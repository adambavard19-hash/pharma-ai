import "server-only";
import { activityScope } from "@/server/db/demo-scope";
import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { generateToken, maskEmail } from "@/server/security/tokens";
import { recordAudit } from "@/server/audit/log";
import { recordInteraction } from "./patients";
import { buildDocumentUrl } from "./documents";
import { getMessagingProvider } from "@/server/ai/registry";
import {
  buildFollowUpEmailHtml,
  evaluateSendEligibility,
  findAnswer,
  findTemplate,
  type FollowUpAnswerCode,
  type SendEligibility,
} from "@/core/followup";
import { createNotification } from "./notifications";
import type { TenantScope } from "@/server/db/tenant";
import type { ReminderReason } from "@/generated/prisma";

/**
 * Le suivi patient — troisième pilier de PharmaBoost.
 *
 * Trois principes portés par ce service, et non par l'interface :
 *
 * 1. **Rien ne part tout seul.** Un rappel arrive à échéance dans une liste de
 *    travail ; c'est un professionnel qui l'envoie, et son identité est
 *    enregistrée. L'envoi automatique transformerait le suivi en campagne.
 * 2. **Rien ne part sans droit.** Consentement explicite, absence de
 *    désinscription, plafond anti-sollicitation : la règle est évaluée ici,
 *    même si l'écran l'autorisait.
 * 3. **Rien de médical ne sort par e-mail.** Le message ne porte qu'un lien
 *    sécurisé ; le contenu de santé reste derrière ce lien.
 */

export type ReminderView = {
  id: string;
  patientId: string;
  patientName: string;
  patientFirstName: string;
  reason: ReminderReason;
  templateKey: string;
  templateLabel: string;
  purpose: string;
  dueAt: Date;
  status: string;
  note: string | null;
  sentAt: Date | null;
  deliveryStatus: string;
  detail: string | null;
  /** Sujet et corps réellement composés, tels qu'ils partiraient. */
  preview: { subject: string; body: string } | null;
  eligibility: SendEligibility;
  /** Réponse du patient au lien « Comment allez-vous ? », si elle est arrivée. */
  answer: { code: FollowUpAnswerCode; label: string; emoji: string; at: Date } | null;
  handledAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Le lien de désinscription du patient, créé à la première utilisation. */
async function ensureOptOutToken(patientId: string): Promise<string> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { followUpOptOutToken: true },
  });
  if (patient.followUpOptOutToken) return patient.followUpOptOutToken;

  const token = generateToken(24);
  await prisma.patient.update({
    where: { id: patientId },
    data: { followUpOptOutToken: token },
  });
  return token;
}

export function buildOptOutUrl(token: string): string {
  return publicUrl(`/desinscription/${token}`);
}

/** Le lien « Comment allez-vous ? » : un jeton par suivi, sans compte. */
export function buildResponseUrl(token: string): string {
  return publicUrl(`/suivi/${token}`);
}

function answerView(reminder: { answer: string | null; answeredAt: Date | null }) {
  const answer = findAnswer(reminder.answer);
  return answer && reminder.answeredAt
    ? { code: answer.code, label: answer.pharmacistLabel, emoji: answer.emoji, at: reminder.answeredAt }
    : null;
}

/**
 * Programme un suivi.
 *
 * `saleId` / `prescriptionId` ne sont pas décoratifs : ils sont la preuve que
 * le rappel découle d'un fait enregistré, et non d'un profil déduit.
 */
export async function scheduleReminder(params: {
  scope: TenantScope;
  patientId: string;
  templateKey: string;
  dueAt: Date;
  saleId?: string | null;
  prescriptionId?: string | null;
  note?: string | null;
  isDemo?: boolean;
}): Promise<{ reminderId: string }> {
  const template = findTemplate(params.templateKey);
  if (!template) throw new Error("Gabarit de suivi inconnu.");

  const patient = await prisma.patient.findUnique({
    where: { id: params.patientId },
    select: { id: true, pharmacyId: true, firstName: true, lastName: true },
  });
  if (!patient || patient.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Patient introuvable dans cette officine.");
  }

  const reminder = await prisma.reminder.create({
    data: {
      pharmacyId: params.scope.pharmacyId,
      patientId: patient.id,
      saleId: params.saleId ?? null,
      prescriptionId: params.prescriptionId ?? null,
      reason: template.reason as ReminderReason,
      templateKey: template.key,
      dueAt: params.dueAt,
      note: params.note ?? null,
      createdByUserId: params.scope.userId,
      isDemo: params.isDemo ?? false,
    },
  });

  await recordInteraction({
    patientId: patient.id,
    scope: params.scope,
    type: "FOLLOW_UP_SCHEDULED",
    summary: `Suivi « ${template.label} » programmé pour le ${params.dueAt.toLocaleDateString("fr-FR")}.`,
    metadata: { reminderId: reminder.id, templateKey: template.key },
  });

  await recordAudit({
    action: "reminder.scheduled",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: { templateKey: template.key, dueAt: params.dueAt.toISOString() },
  });

  return { reminderId: reminder.id };
}

/**
 * La liste de travail.
 *
 * Chaque ligne porte son verdict d'envoi : le pharmacien voit immédiatement
 * pourquoi une ligne n'est pas envoyable, plutôt que de découvrir un refus au
 * moment du clic.
 */
export async function listReminders(
  scope: TenantScope,
  options: {
    horizonDays?: number;
    limit?: number;
    /**
     * Inclure aussi les suivis envoyés ou terminés de ces derniers jours :
     * la liste « Terminés » et les réponses des patients.
     */
    includeCompletedDays?: number;
  } = {},
): Promise<ReminderView[]> {
  const horizon = new Date(Date.now() + (options.horizonDays ?? 7) * DAY_MS);
  const completedSince = options.includeCompletedDays
    ? new Date(Date.now() - options.includeCompletedDays * DAY_MS)
    : null;

  const [pharmacy, reminders] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: scope.pharmacyId },
      select: { name: true, followUpMinIntervalDays: true },
    }),
    prisma.reminder.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        OR: [
          { status: { in: ["SCHEDULED", "SNOOZED"] }, dueAt: { lte: horizon } },
          ...(completedSince
            ? [
                { status: { in: ["SENT" as const, "DONE" as const] }, updatedAt: { gte: completedSince } },
                // Une demande de conseil non traitée reste visible, quel que soit son âge.
                { answer: "NEED_ADVICE" as const, handledAt: null },
              ]
            : []),
        ],
      },
      orderBy: { dueAt: "asc" },
      take: options.limit ?? 80,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            followUpOptOutAt: true,
            followUpOptOutToken: true,
            consents: {
              where: { type: "FOLLOW_UP_MESSAGE" },
              select: { granted: true, revokedAt: true },
            },
            documents: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { accessToken: true },
            },
          },
        },
      },
    }),
  ]);

  if (reminders.length === 0) return [];

  // Dernier suivi RÉELLEMENT envoyé à chacun de ces patients : c'est lui qui
  // arme le plafond anti-sollicitation.
  const lastSent = await prisma.reminder.groupBy({
    by: ["patientId"],
    where: {
      pharmacyId: scope.pharmacyId,
      status: "SENT",
      patientId: { in: reminders.map((reminder) => reminder.patientId) },
    },
    _max: { sentAt: true },
  });
  const lastSentByPatient = new Map(
    lastSent.map((row) => [row.patientId, row._max.sentAt ?? null]),
  );

  const now = new Date();

  return reminders.map((reminder) => {
    const template = findTemplate(reminder.templateKey);
    const patient = reminder.patient;
    const consent = patient.consents[0];
    const documentToken = patient.documents[0]?.accessToken ?? null;

    const eligibility = evaluateSendEligibility({
      hasConsent: Boolean(consent?.granted && !consent.revokedAt),
      optedOut: Boolean(patient.followUpOptOutAt),
      hasContact: Boolean(patient.email),
      hasSharableLink: Boolean(documentToken),
      lastFollowUpAt: lastSentByPatient.get(patient.id) ?? null,
      minIntervalDays: pharmacy.followUpMinIntervalDays,
      now,
    });

    // Le jeton de désinscription n'est créé qu'au premier envoi : l'aperçu
    // montre donc l'emplacement du lien, pas un jeton inventé.
    const preview =
      template && documentToken
        ? {
            subject: template.subject({
              patientFirstName: patient.firstName,
              pharmacyName: pharmacy.name,
              link: buildDocumentUrl(documentToken),
              unsubscribeLink: buildOptOutUrl(patient.followUpOptOutToken ?? "lien-genere-a-l-envoi"),
            }),
            body: template.body({
              patientFirstName: patient.firstName,
              pharmacyName: pharmacy.name,
              link: buildDocumentUrl(documentToken),
              unsubscribeLink: buildOptOutUrl(patient.followUpOptOutToken ?? "lien-genere-a-l-envoi"),
            }),
          }
        : null;

    return {
      id: reminder.id,
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName.toUpperCase()}`,
      patientFirstName: patient.firstName,
      reason: reminder.reason,
      templateKey: reminder.templateKey,
      templateLabel: template?.label ?? reminder.templateKey,
      purpose: template?.purpose ?? "",
      dueAt: reminder.dueAt,
      status: reminder.status,
      note: reminder.note,
      sentAt: reminder.sentAt,
      deliveryStatus: reminder.deliveryStatus,
      detail: reminder.detail,
      preview,
      eligibility,
      answer: answerView(reminder),
      handledAt: reminder.handledAt,
    };
  });
}

/** Les trois chiffres du tableau de bord des suivis. */
export async function countFollowUpBoard(
  scope: TenantScope,
): Promise<{ today: number; upcoming: number; needAdvice: number }> {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const base = { pharmacyId: scope.pharmacyId, ...activityScope() };
  const [today, upcoming, needAdvice] = await Promise.all([
    prisma.reminder.count({
      where: { ...base, status: { in: ["SCHEDULED", "SNOOZED"] }, dueAt: { lte: endOfDay } },
    }),
    prisma.reminder.count({
      where: { ...base, status: { in: ["SCHEDULED", "SNOOZED"] }, dueAt: { gt: endOfDay } },
    }),
    prisma.reminder.count({ where: { ...base, answer: "NEED_ADVICE", handledAt: null } }),
  ]);
  return { today, upcoming, needAdvice };
}

/** Nombre de suivis arrivés à échéance — le chiffre affiché sur l'accueil. */
export async function countDueReminders(scope: TenantScope): Promise<number> {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.reminder.count({
    where: {
      pharmacyId: scope.pharmacyId,
      status: { in: ["SCHEDULED", "SNOOZED"] },
      dueAt: { lte: endOfDay },
    },
  });
}

/**
 * Envoie un suivi. Appelé uniquement sur action explicite d'un professionnel.
 *
 * Les conditions sont revérifiées ici, à l'instant de l'envoi : la liste de
 * travail a pu être affichée il y a dix minutes, et une désinscription arrivée
 * entre-temps doit être respectée.
 */
export async function sendReminder(params: {
  scope: TenantScope;
  reminderId: string;
  /**
   * Envoi déclenché par la tâche planifiée, sans clic humain. La trace doit le
   * dire : attribuer l'envoi à un utilisateur qui n'a rien fait serait faux.
   */
  automated?: boolean;
}): Promise<{ status: string; detail: string }> {
  const actorId = params.automated ? null : params.scope.userId;
  const reminder = await prisma.reminder.findUnique({
    where: { id: params.reminderId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          email: true,
          followUpOptOutAt: true,
          consents: {
            where: { type: "FOLLOW_UP_MESSAGE" },
            select: { granted: true, revokedAt: true },
          },
          documents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { accessToken: true },
          },
        },
      },
    },
  });

  if (!reminder || reminder.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Suivi introuvable dans cette officine.");
  }
  if (reminder.status === "SENT") {
    throw new Error("Ce suivi a déjà été envoyé.");
  }

  const template = findTemplate(reminder.templateKey);
  if (!template) throw new Error("Gabarit de suivi inconnu.");

  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: params.scope.pharmacyId },
    select: { name: true, brandColor: true, followUpMinIntervalDays: true },
  });

  const lastSent = await prisma.reminder.findFirst({
    where: {
      pharmacyId: params.scope.pharmacyId,
      patientId: reminder.patientId,
      status: "SENT",
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });

  const consent = reminder.patient.consents[0];
  const documentToken = reminder.patient.documents[0]?.accessToken ?? null;

  const eligibility = evaluateSendEligibility({
    hasConsent: Boolean(consent?.granted && !consent.revokedAt),
    optedOut: Boolean(reminder.patient.followUpOptOutAt),
    hasContact: Boolean(reminder.patient.email),
    hasSharableLink: Boolean(documentToken),
    lastFollowUpAt: lastSent?.sentAt ?? null,
    minIntervalDays: pharmacy.followUpMinIntervalDays,
    now: new Date(),
  });

  if (!eligibility.allowed) throw new Error(eligibility.reason);

  const recipient = reminder.patient.email as string;
  const optOutToken = await ensureOptOutToken(reminder.patientId);

  // Le lien de réponse est propre à CE suivi : il ne permet que de répondre à
  // la question posée, et ne mène à aucune donnée.
  let responseToken = reminder.responseToken;
  if (template.asksFeedback && !responseToken) {
    responseToken = generateToken(24);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { responseToken } });
  }

  const variables = {
    patientFirstName: reminder.patient.firstName,
    pharmacyName: pharmacy.name,
    link: buildDocumentUrl(documentToken as string),
    unsubscribeLink: buildOptOutUrl(optOutToken),
    responseLink: template.asksFeedback && responseToken ? buildResponseUrl(responseToken) : null,
  };

  const outcome = await getMessagingProvider().sendEmail({
    to: recipient,
    fromName: pharmacy.name,
    subject: template.subject(variables),
    text: template.body(variables),
    html: buildFollowUpEmailHtml(template, variables, { brandColor: pharmacy.brandColor }),
  });

  // Seul un envoi confirmé par le prestataire est un envoi. Un échec — comme
  // une absence de fournisseur — laisse le rappel PROGRAMMÉ : il repartira
  // quand la cause aura disparu, au lieu de quitter la liste de travail en se
  // disant « envoyé » alors que rien n'est parti.
  const transmitted = outcome.status === "SENT";

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      status: transmitted ? "SENT" : "SCHEDULED",
      sentAt: transmitted ? new Date() : null,
      sentByUserId: actorId,
      deliveryStatus: outcome.status,
      provider: outcome.provider,
      detail: outcome.detail,
      targetMasked: maskEmail(recipient),
    },
  });

  await recordInteraction({
    patientId: reminder.patientId,
    scope: params.scope,
    automated: params.automated === true,
    type: "FOLLOW_UP_SENT",
    summary:
      outcome.status === "SENT"
        ? `Suivi « ${template.label} » envoyé.`
        : outcome.status === "FAILED"
          ? `Suivi « ${template.label} » — ÉCHEC d'envoi, aucun message n'a été transmis : ${outcome.detail}`
          : `Suivi « ${template.label} » — envoi SIMULÉ, aucun message n'a été transmis.`,
    metadata: { reminderId: reminder.id, deliveryStatus: outcome.status },
  });

  await recordAudit({
    action: "reminder.sent",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: params.scope.pharmacyId,
    userId: actorId,
    metadata: {
      templateKey: template.key,
      deliveryStatus: outcome.status,
      automated: params.automated === true,
      target: maskEmail(recipient),
    },
  });

  return { status: outcome.status, detail: outcome.detail };
}

export async function snoozeReminder(params: {
  scope: TenantScope;
  reminderId: string;
  days: number;
}): Promise<Date> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: params.reminderId },
    select: { id: true, pharmacyId: true, dueAt: true },
  });
  if (!reminder || reminder.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Suivi introuvable dans cette officine.");
  }

  // On repousse depuis aujourd'hui, pas depuis l'échéance : reporter de 7 jours
  // un rappel en retard de trois semaines doit le ramener dans une semaine.
  const dueAt = new Date(Date.now() + params.days * DAY_MS);
  dueAt.setHours(9, 0, 0, 0);

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: "SNOOZED", dueAt },
  });

  await recordAudit({
    action: "reminder.snoozed",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: { dueAt: dueAt.toISOString(), days: params.days },
  });

  return dueAt;
}

export async function cancelReminder(params: {
  scope: TenantScope;
  reminderId: string;
  reason?: string | null;
}): Promise<void> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: params.reminderId },
    select: { id: true, pharmacyId: true },
  });
  if (!reminder || reminder.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Suivi introuvable dans cette officine.");
  }

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: "CANCELLED", note: params.reason ?? undefined },
  });

  await recordAudit({
    action: "reminder.cancelled",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: { reason: params.reason ?? null },
  });
}

/**
 * Consulte un lien « Comment allez-vous ? » SANS rien écrire.
 *
 * Même règle que la désinscription : un GET ne répond jamais à la place du
 * patient, les aperçus de messagerie visitent les liens. La page affiche la
 * question ; seul un POST enregistre la réponse.
 */
export async function peekFollowUpResponse(token: string): Promise<{
  pharmacyName: string;
  patientFirstName: string;
  answered: FollowUpAnswerCode | null;
} | null> {
  if (!token || token.length < 16) return null;
  const reminder = await prisma.reminder.findUnique({
    where: { responseToken: token },
    select: {
      answer: true,
      patient: { select: { firstName: true } },
      pharmacy: { select: { name: true } },
    },
  });
  if (!reminder) return null;
  return {
    pharmacyName: reminder.pharmacy.name,
    patientFirstName: reminder.patient.firstName,
    answered: (reminder.answer as FollowUpAnswerCode | null) ?? null,
  };
}

/**
 * Enregistre la réponse du patient à un suivi.
 *
 * Trois réponses fermées. La première réponse fait foi : un lien d'e-mail peut
 * être cliqué deux fois, la seconde ne réécrit pas la première. Un besoin de
 * conseil prévient l'équipe de l'officine — rien d'autre : ni diagnostic, ni
 * modification de traitement.
 */
export async function answerFollowUp(
  token: string,
  code: FollowUpAnswerCode,
): Promise<{ pharmacyName: string; answered: FollowUpAnswerCode; alreadyAnswered: boolean } | null> {
  if (!token || token.length < 16) return null;
  const answer = findAnswer(code);
  if (!answer) return null;

  const reminder = await prisma.reminder.findUnique({
    where: { responseToken: token },
    select: {
      id: true,
      pharmacyId: true,
      patientId: true,
      answer: true,
      templateKey: true,
      patient: { select: { firstName: true, lastName: true } },
      pharmacy: { select: { name: true } },
    },
  });
  if (!reminder) return null;
  if (reminder.answer) {
    return {
      pharmacyName: reminder.pharmacy.name,
      answered: reminder.answer as FollowUpAnswerCode,
      alreadyAnswered: true,
    };
  }

  const now = new Date();
  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      answer: answer.code,
      answeredAt: now,
      // Un suivi auquel le patient a répondu est terminé, sauf s'il demande un
      // conseil : il reste alors à traiter par l'équipe.
      status: "DONE",
    },
  });

  const scope: TenantScope = { pharmacyId: reminder.pharmacyId, organizationId: "", userId: "" };
  const patientName = `${reminder.patient.firstName} ${reminder.patient.lastName.toUpperCase()}`;

  await recordInteraction({
    patientId: reminder.patientId,
    scope,
    byPatient: true,
    type: "FOLLOW_UP_ANSWERED",
    summary: `Réponse au suivi : ${answer.emoji} ${answer.label}.`,
    metadata: { reminderId: reminder.id, answer: answer.code },
  });

  if (answer.code === "NEED_ADVICE") {
    await createNotification({
      pharmacyId: reminder.pharmacyId,
      type: "FOLLOW_UP_RESPONSE",
      severity: "WARNING",
      title: `${patientName} a besoin d'un conseil`,
      body: "Le patient a répondu à son suivi qu'il avait encore besoin d'un conseil. Reprenez contact avec lui.",
      linkUrl: "/suivis",
      metadata: { reminderId: reminder.id, patientId: reminder.patientId },
    });
  }

  await recordAudit({
    action: "reminder.answered",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: reminder.pharmacyId,
    userId: null,
    metadata: { answer: answer.code, templateKey: reminder.templateKey },
  });

  return { pharmacyName: reminder.pharmacy.name, answered: answer.code, alreadyAnswered: false };
}

/** Le pharmacien a repris contact : la demande de conseil quitte la liste. */
export async function markFollowUpHandled(params: {
  scope: TenantScope;
  reminderId: string;
}): Promise<void> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: params.reminderId },
    select: { id: true, pharmacyId: true, patientId: true },
  });
  if (!reminder || reminder.pharmacyId !== params.scope.pharmacyId) {
    throw new Error("Suivi introuvable dans cette officine.");
  }
  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { handledAt: new Date(), handledByUserId: params.scope.userId, status: "DONE" },
  });
  await recordInteraction({
    patientId: reminder.patientId,
    scope: params.scope,
    type: "NOTE",
    summary: "Demande de conseil traitée : contact repris avec le patient.",
    metadata: { reminderId: reminder.id },
  });
  await recordAudit({
    action: "reminder.handled",
    entityType: "Reminder",
    entityId: reminder.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
  });
}

/**
 * Consulte un jeton de désinscription SANS rien modifier.
 *
 * La désinscription n'est jamais déclenchée par un simple GET : les
 * antivirus et les aperçus de messagerie visitent les liens des e-mails, et
 * désinscriraient des patients qui n'ont rien demandé. La page affiche donc une
 * confirmation, et seule celle-ci écrit.
 */
export async function peekOptOut(
  token: string,
): Promise<{ pharmacyName: string; alreadyOptedOut: boolean } | null> {
  const patient = await prisma.patient.findUnique({
    where: { followUpOptOutToken: token },
    select: { followUpOptOutAt: true, pharmacy: { select: { name: true } } },
  });
  if (!patient) return null;
  return {
    pharmacyName: patient.pharmacy.name,
    alreadyOptedOut: Boolean(patient.followUpOptOutAt),
  };
}

/**
 * Désinscription par le patient, sans authentification.
 *
 * Elle coupe les suivis à venir et n'y touche à rien d'autre : le dossier de
 * soin relève d'une obligation de conservation distincte.
 */
export async function optOutByToken(
  token: string,
): Promise<{ pharmacyName: string; alreadyOptedOut: boolean } | null> {
  const patient = await prisma.patient.findUnique({
    where: { followUpOptOutToken: token },
    select: {
      id: true,
      pharmacyId: true,
      followUpOptOutAt: true,
      pharmacy: { select: { name: true } },
    },
  });

  if (!patient) return null;
  if (patient.followUpOptOutAt) {
    return { pharmacyName: patient.pharmacy.name, alreadyOptedOut: true };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.patient.update({
      where: { id: patient.id },
      data: { followUpOptOutAt: now },
    }),
    prisma.patientConsent.updateMany({
      where: { patientId: patient.id, type: "FOLLOW_UP_MESSAGE" },
      data: { granted: false, revokedAt: now },
    }),
    prisma.reminder.updateMany({
      where: { patientId: patient.id, status: { in: ["SCHEDULED", "SNOOZED"] } },
      data: { status: "CANCELLED", note: "Désinscription du patient." },
    }),
  ]);

  await recordInteraction({
    patientId: patient.id,
    scope: { pharmacyId: patient.pharmacyId, organizationId: "", userId: "" },
    type: "FOLLOW_UP_OPTED_OUT",
    summary: "Le patient s'est désinscrit des suivis depuis le lien reçu.",
    byPatient: true,
  });

  await recordAudit({
    action: "reminder.opted_out",
    entityType: "Patient",
    entityId: patient.id,
    pharmacyId: patient.pharmacyId,
    metadata: { source: "public_link" },
  });

  return { pharmacyName: patient.pharmacy.name, alreadyOptedOut: false };
}
