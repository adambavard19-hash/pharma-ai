import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { decryptField, encryptField } from "@/server/security/encryption";
import { hashEmail, maskEmail, openToken, sealToken, signPayload, verifyPayload } from "@/server/security/tokens";
import type { TenantScope } from "@/server/db/tenant";
import { TIME_ZONE } from "@/config/constants";
import {
  NEWS_CLAIM_STALE_MS,
  NEWS_MIN_INTERVAL_DAYS,
  NEWS_OPT_IN_TTL_MS,
  NEWS_SEND_BATCH,
  NEWS_SEND_BUDGET_MS,
  NEWS_STUCK_AFTER_MS,
  NEWS_UNSUBSCRIBE_TTL_MS,
  PATIENT_NEWS_NOTICE_VERSION,
  buildNewsWelcomeEmail,
  buildPatientNewsEmail,
  newsRetentionCutoff,
  newsUnsubscribeHeaders,
  nextAnnouncementAllowedAt,
  validateAnnouncement,
  type AnnouncementInput,
} from "@/core/patient-news";

/**
 * Les nouveautés d'une officine pour les patients qui l'ont demandé.
 *
 * Quatre principes, portés ici et non par l'écran :
 *
 * 1. **Rien n'est conservé avant le geste du patient.** Le lien de l'e-mail du
 *    plan porte l'adresse dans un jeton chiffré ; ouvrir la page n'écrit rien
 *    (un antivirus ou un aperçu de messagerie ouvre les liens). L'abonnement
 *    naît quand le patient confirme.
 * 2. **Rien de médical.** Aucun lien entre l'adresse et une ordonnance, un
 *    plan, un produit ou un nom. Le patient n'a pas de fiche.
 * 3. **Rien ne part tout seul.** Une annonce est un acte du titulaire,
 *    confirmé avec le nombre d'abonnés, au plus une tous les 7 jours.
 * 4. **Jamais deux fois.** La réservation de l'envoi (clé unique, une par
 *    annonce et par abonné) est inscrite AVANT le message ; un passage
 *    interrompu laisse une réservation visible, jamais un doublon.
 *
 * Les e-mails destinés aux patients ne sont pas tracés dans le journal des
 * e-mails de la plateforme, et les audits ne portent que des comptes : aucune
 * adresse, pas même masquée.
 */

const OPT_IN_PURPOSE = "news-optin";
const UNSUBSCRIBE_KIND = "news-unsubscribe";
const MAX_TOKEN_LENGTH = 2000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const INVALID_LINK = "Ce lien n'est plus valide. Pour recevoir les nouveautés de votre pharmacie, demandez un nouveau lien lors de votre prochain passage.";
const NEWS_OFF = "Cette pharmacie n'envoie pas de nouveautés par e-mail pour le moment.";
const INVALID_UNSUBSCRIBE_LINK = "Ce lien de désinscription n'est plus valide. Adressez-vous à votre pharmacie : elle supprimera votre adresse.";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Aucune adresse ne survit dans un détail d'envoi : certains serveurs de messagerie recopient le destinataire dans leur refus. */
function scrub(detail: string): string {
  return detail.replace(/[^\s<>"',;]+@[^\s<>"',;]+/g, "[adresse]").slice(0, 200);
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(date);
}

const pharmacySelect = { id: true, name: true, phone: true, brandColor: true, isActive: true, patientNewsEnabled: true } as const;

async function loadPharmacy(pharmacyId: string) {
  return prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: pharmacySelect });
}

type SendingPharmacy = NonNullable<Awaited<ReturnType<typeof loadPharmacy>>>;

// ---------------------------------------------------------------- Liens

function readOptInToken(token: string): { pharmacyId: string; email: string } | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const payload = openToken<{ p?: unknown; e?: unknown }>(OPT_IN_PURPOSE, token);
  if (!payload || typeof payload.p !== "string" || typeof payload.e !== "string" || !payload.p) return null;
  const email = payload.e.trim();
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) return null;
  return { pharmacyId: payload.p, email };
}

/** Signé, non chiffré : il ne porte que l'officine et l'empreinte de l'adresse, jamais l'adresse. */
function unsubscribeUrlFor(pharmacyId: string, emailHash: string): string {
  return publicUrl(`/nouveautes/desinscription/${signPayload({ p: pharmacyId, h: emailHash, t: UNSUBSCRIBE_KIND }, NEWS_UNSUBSCRIBE_TTL_MS)}`);
}

function readUnsubscribeToken(token: string): { pharmacyId: string; emailHash: string } | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const payload = verifyPayload<{ p?: unknown; h?: unknown; t?: unknown }>(token);
  if (!payload || payload.t !== UNSUBSCRIBE_KIND || typeof payload.p !== "string" || typeof payload.h !== "string") return null;
  return { pharmacyId: payload.p, emailHash: payload.h };
}

/**
 * Le lien d'abonnement à glisser dans l'e-mail du plan. L'adresse y est
 * chiffrée : rien ne la conserve avant que le patient ait confirmé. `null`
 * quand l'officine a coupé la fonction (ou n'existe plus) : le message part
 * alors sans le bloc.
 */
export async function newsOptInUrlFor(pharmacyId: string, email: string): Promise<string | null> {
  const address = email.trim();
  if (address.length > 254 || !EMAIL_SHAPE.test(address)) return null;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { isActive: true, patientNewsEnabled: true } });
  if (!pharmacy?.isActive || !pharmacy.patientNewsEnabled) return null;
  return publicUrl(`/nouveautes/abonnement/${sealToken(OPT_IN_PURPOSE, { p: pharmacyId, e: address }, NEWS_OPT_IN_TTL_MS)}`);
}

// ---------------------------------------------------------------- Abonnement du patient

/** Ce que la page d'abonnement affiche. N'écrit RIEN : l'ouvrir ne vaut pas accord. */
export async function peekNewsOptIn(token: string): Promise<{ pharmacyName: string; brandColor: string; alreadySubscribed: boolean } | null> {
  const request = readOptInToken(token);
  if (!request) return null;
  const pharmacy = await loadPharmacy(request.pharmacyId);
  if (!pharmacy?.isActive || !pharmacy.patientNewsEnabled) return null;
  const existing = await prisma.patientNewsSubscription.findUnique({
    where: { pharmacyId_emailHash: { pharmacyId: pharmacy.id, emailHash: hashEmail(request.email) } },
    select: { status: true },
  });
  return { pharmacyName: pharmacy.name, brandColor: pharmacy.brandColor, alreadySubscribed: existing?.status === "ACTIVE" };
}

/**
 * Inscrit l'adresse, ou la réactive si elle s'était désinscrite. Idempotent et
 * sûr sous concurrence : la clé unique (officine, empreinte) départage deux
 * clics simultanés, et seule la transition réelle (création ou réactivation)
 * est signalée, pour qu'un double clic n'envoie pas deux messages de bienvenue.
 */
async function activateSubscription(pharmacyId: string, email: string, emailHash: string, now: Date): Promise<"created" | "reactivated" | "already"> {
  const data = {
    emailCipher: encryptField(email),
    emailMasked: maskEmail(email),
    status: "ACTIVE" as const,
    consentSource: "PLAN_EMAIL",
    consentAt: now,
    noticeVersion: PATIENT_NEWS_NOTICE_VERSION,
  };
  try {
    await prisma.patientNewsSubscription.create({ data: { pharmacyId, emailHash, ...data } });
    return "created";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const reactivated = await prisma.patientNewsSubscription.updateMany({ where: { pharmacyId, emailHash, status: "UNSUBSCRIBED" }, data: { ...data, unsubscribedAt: null } });
  return reactivated.count === 1 ? "reactivated" : "already";
}

/** Le message de bienvenue est une confirmation : son échec n'annule pas l'abonnement. */
async function sendWelcome(pharmacy: SendingPharmacy, email: string, emailHash: string): Promise<boolean> {
  try {
    const unsubscribeUrl = unsubscribeUrlFor(pharmacy.id, emailHash);
    const message = buildNewsWelcomeEmail({ pharmacyName: pharmacy.name, pharmacyPhone: pharmacy.phone, brandColor: pharmacy.brandColor, unsubscribeUrl });
    const outcome = await getMessagingProvider().sendEmail({ to: email, fromName: pharmacy.name, subject: message.subject, text: message.text, html: message.html, headers: newsUnsubscribeHeaders(unsubscribeUrl) });
    return outcome.status === "SENT";
  } catch {
    return false;
  }
}

/** Le geste du patient : le POST de la page d'abonnement. C'est ici, et seulement ici, que son adresse est enregistrée. */
export async function confirmNewsOptIn(token: string): Promise<{ ok: true; pharmacyName: string; welcomeSent: boolean } | { ok: false; error: string }> {
  const request = readOptInToken(token);
  if (!request) return { ok: false, error: INVALID_LINK };
  const pharmacy = await loadPharmacy(request.pharmacyId);
  if (!pharmacy?.isActive || !pharmacy.patientNewsEnabled) return { ok: false, error: NEWS_OFF };

  const emailHash = hashEmail(request.email);
  const outcome = await activateSubscription(pharmacy.id, request.email, emailHash, new Date());
  if (outcome === "already") return { ok: true, pharmacyName: pharmacy.name, welcomeSent: false };

  await recordAudit({ action: "patient_news.subscribed", entityType: "PatientNewsSubscription", pharmacyId: pharmacy.id, metadata: { source: "PLAN_EMAIL", reactivated: outcome === "reactivated", noticeVersion: PATIENT_NEWS_NOTICE_VERSION } });
  const welcomeSent = await sendWelcome(pharmacy, request.email, emailHash);
  return { ok: true, pharmacyName: pharmacy.name, welcomeSent };
}

// ---------------------------------------------------------------- Désinscription

/**
 * Ce que la page de désinscription affiche. N'écrit RIEN. Elle reste
 * accessible même si l'officine a coupé la fonction : un patient doit toujours
 * pouvoir partir.
 */
export async function peekNewsUnsubscribe(token: string): Promise<{ pharmacyName: string; alreadyUnsubscribed: boolean } | null> {
  const request = readUnsubscribeToken(token);
  if (!request) return null;
  const subscription = await prisma.patientNewsSubscription.findUnique({
    where: { pharmacyId_emailHash: { pharmacyId: request.pharmacyId, emailHash: request.emailHash } },
    select: { status: true, pharmacy: { select: { name: true } } },
  });
  if (!subscription) return null;
  return { pharmacyName: subscription.pharmacy.name, alreadyUnsubscribed: subscription.status === "UNSUBSCRIBED" };
}

/** Efface l'adresse (chiffrée et masquée) ; garde l'empreinte, le statut et les dates pour que le choix du patient soit respecté. */
export async function confirmNewsUnsubscribe(token: string): Promise<{ ok: true; pharmacyName: string } | { ok: false; error: string }> {
  const request = readUnsubscribeToken(token);
  if (!request) return { ok: false, error: INVALID_UNSUBSCRIBE_LINK };
  const subscription = await prisma.patientNewsSubscription.findUnique({
    where: { pharmacyId_emailHash: { pharmacyId: request.pharmacyId, emailHash: request.emailHash } },
    select: { status: true, pharmacy: { select: { name: true } } },
  });
  if (!subscription) return { ok: false, error: INVALID_UNSUBSCRIBE_LINK };

  // Conditionnel : deux clics simultanés n'effacent et ne journalisent qu'une fois.
  const changed = await prisma.patientNewsSubscription.updateMany({
    where: { pharmacyId: request.pharmacyId, emailHash: request.emailHash, status: "ACTIVE" },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date(), emailCipher: null, emailMasked: null },
  });
  if (changed.count === 1) {
    await recordAudit({ action: "patient_news.unsubscribed", entityType: "PatientNewsSubscription", pharmacyId: request.pharmacyId, metadata: { source: "public_link" } });
  }
  return { ok: true, pharmacyName: subscription.pharmacy.name };
}

// ---------------------------------------------------------------- Vue de l'officine

export type NewsOverview = {
  enabled: boolean;
  activeCount: number;
  messagingLive: boolean;
  lastAnnouncementAt: Date | null;
  nextAllowedAt: Date | null;
  announcements: { id: string; title: string; rangeLabel: string | null; status: string; recipientCount: number; sentCount: number; failedCount: number; simulated: boolean; createdAt: Date }[];
  rangeSuggestions: { laboratory: string; rangeName: string | null }[];
};

/**
 * L'annonce la plus récente qui a réellement compté : un échec complet, ou un
 * envoi simulé faute de messagerie, n'a contacté personne et ne bloque pas la
 * suivante.
 */
async function lastCountedAnnouncementAt(pharmacyId: string): Promise<Date | null> {
  const last = await prisma.patientNewsAnnouncement.findFirst({
    where: { pharmacyId, simulated: false, status: { not: "FAILED" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

/** L'écran « Nouveautés » : des comptes, jamais une adresse. */
export async function getNewsOverview(scope: TenantScope): Promise<NewsOverview> {
  const [pharmacy, activeCount, announcements, lastAnnouncementAt, ranges] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { patientNewsEnabled: true } }),
    prisma.patientNewsSubscription.count({ where: { pharmacyId: scope.pharmacyId, status: "ACTIVE" } }),
    prisma.patientNewsAnnouncement.findMany({
      where: { pharmacyId: scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, rangeLabel: true, status: true, recipientCount: true, sentCount: true, failedCount: true, simulated: true, createdAt: true },
    }),
    lastCountedAnnouncementAt(scope.pharmacyId),
    // Les suggestions viennent des gammes privilégiées de l'officine, et d'elles seules.
    prisma.preferredRange.findMany({
      where: { pharmacyId: scope.pharmacyId, isActive: true },
      orderBy: [{ universe: "asc" }, { priority: "asc" }, { laboratory: "asc" }],
      take: 40,
      select: { laboratory: true, rangeName: true },
    }),
  ]);

  const seen = new Set<string>();
  const rangeSuggestions = ranges.filter((range) => {
    const key = `${range.laboratory}|${range.rangeName ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    enabled: pharmacy?.patientNewsEnabled ?? false,
    activeCount,
    messagingLive: getMessagingProvider().info.capability === "LIVE",
    lastAnnouncementAt,
    nextAllowedAt: nextAnnouncementAllowedAt(lastAnnouncementAt, new Date()),
    announcements,
    rangeSuggestions,
  };
}

/** L'interrupteur du titulaire : le lien d'abonnement disparaît des e-mails du plan, les annonces sont suspendues. */
export async function setPatientNewsEnabled(scope: TenantScope, enabled: boolean): Promise<void> {
  const changed = await prisma.pharmacy.updateMany({ where: { id: scope.pharmacyId, patientNewsEnabled: !enabled }, data: { patientNewsEnabled: enabled } });
  if (changed.count === 1) {
    await recordAudit({ action: "patient_news.settings_changed", entityType: "Pharmacy", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { enabled } });
  }
}

// ---------------------------------------------------------------- Aperçu et test

/** Le lien de désinscription d'un aperçu ou d'un test : il ne mène à rien, aucun abonné n'y est associé. */
function exampleUnsubscribeUrl(): string {
  return publicUrl("/nouveautes/desinscription/exemple");
}

export async function previewAnnouncement(scope: TenantScope, input: AnnouncementInput): Promise<{ subject: string; text: string; html: string }> {
  const pharmacy = await loadPharmacy(scope.pharmacyId);
  if (!pharmacy) throw new Error("Officine introuvable.");
  return buildPatientNewsEmail({ pharmacyName: pharmacy.name, pharmacyPhone: pharmacy.phone, brandColor: pharmacy.brandColor, ...input, unsubscribeUrl: exampleUnsubscribeUrl() });
}

/** Le message de test part vers l'adresse de l'utilisateur connecté, et vers elle seule. */
export async function sendAnnouncementTest(scope: TenantScope & { email: string }, input: AnnouncementInput): Promise<{ status: string; detail: string }> {
  const checked = validateAnnouncement(input);
  if (!checked.ok) return { status: "FAILED", detail: checked.error };
  const pharmacy = await loadPharmacy(scope.pharmacyId);
  if (!pharmacy) return { status: "FAILED", detail: "Officine introuvable." };
  const message = buildPatientNewsEmail({ pharmacyName: pharmacy.name, pharmacyPhone: pharmacy.phone, brandColor: pharmacy.brandColor, ...checked.value, unsubscribeUrl: exampleUnsubscribeUrl(), isTest: true });
  try {
    const outcome = await getMessagingProvider().sendEmail({ to: scope.email, fromName: pharmacy.name, subject: message.subject, text: message.text, html: message.html });
    return { status: outcome.status, detail: scrub(outcome.detail) };
  } catch (error) {
    return { status: "FAILED", detail: scrub(error instanceof Error ? error.message : "Envoi impossible.") };
  }
}

// ---------------------------------------------------------------- Envoi d'une annonce

type AnnouncementRow = { id: string; pharmacyId: string; title: string; rangeLabel: string | null; message: string; createdAt: Date; recipientCount: number; simulated: boolean };

/**
 * Un abonné, un message. La réservation précède TOUJOURS l'envoi : si elle
 * existe déjà (autre passage, reprise), on passe. Le statut de l'abonné est
 * relu juste après, avant d'écrire à qui que ce soit : un patient désinscrit
 * pendant l'envoi n'est pas contacté.
 */
async function deliverTo(subscriptionId: string, announcement: AnnouncementRow, pharmacy: SendingPharmacy): Promise<void> {
  let deliveryId: string;
  try {
    const reserved = await prisma.patientNewsDelivery.create({ data: { announcementId: announcement.id, subscriptionId, status: "CLAIMED" }, select: { id: true } });
    deliveryId = reserved.id;
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }
  const settle = (status: string, detail: string | null) => prisma.patientNewsDelivery.update({ where: { id: deliveryId }, data: { status, detail } });

  const subscriber = await prisma.patientNewsSubscription.findFirst({
    where: { id: subscriptionId, pharmacyId: announcement.pharmacyId, status: "ACTIVE" },
    select: { emailHash: true, emailCipher: true },
  });
  if (!subscriber) {
    await settle("SKIPPED", "Désinscrit avant l'envoi : aucun message.");
    return;
  }
  const address = decryptField(subscriber.emailCipher);
  if (!address) {
    await settle("FAILED", "Adresse illisible : aucun message.");
    return;
  }

  try {
    const unsubscribeUrl = unsubscribeUrlFor(announcement.pharmacyId, subscriber.emailHash);
    const message = buildPatientNewsEmail({ pharmacyName: pharmacy.name, pharmacyPhone: pharmacy.phone, brandColor: pharmacy.brandColor, title: announcement.title, rangeLabel: announcement.rangeLabel, message: announcement.message, unsubscribeUrl });
    const outcome = await getMessagingProvider().sendEmail({ to: address, fromName: pharmacy.name, subject: message.subject, text: message.text, html: message.html, headers: newsUnsubscribeHeaders(unsubscribeUrl) });
    await settle(outcome.status, scrub(outcome.detail));
  } catch (error) {
    await settle("FAILED", scrub(error instanceof Error ? error.message : "Envoi impossible."));
  }
}

type AnnouncementProgress = { recipientCount: number; sentCount: number; failedCount: number; simulated: boolean; complete: boolean };

/**
 * Écrit l'état de l'annonce d'après les réservations, et la clôt quand il n'y
 * a plus personne à servir. Une réservation restée sans issue depuis longtemps
 * est un envoi interrompu : on ne sait pas si le message est parti, il n'est
 * donc jamais rejoué (un message manquant vaut mieux que deux).
 */
async function settleAnnouncement(announcement: AnnouncementRow, exhausted: boolean): Promise<AnnouncementProgress> {
  if (exhausted) {
    await prisma.patientNewsDelivery.updateMany({
      where: { announcementId: announcement.id, status: "CLAIMED", createdAt: { lt: new Date(Date.now() - NEWS_CLAIM_STALE_MS) } },
      data: { status: "FAILED", detail: "Envoi interrompu : le résultat est inconnu, le message n'a pas été renvoyé." },
    });
  }
  const groups = await prisma.patientNewsDelivery.groupBy({ by: ["status"], where: { announcementId: announcement.id }, _count: { _all: true } });
  const count = (status: string) => groups.find((group) => group.status === status)?._count._all ?? 0;
  const simulatedCount = count("SIMULATED");
  const sentCount = count("SENT") + simulatedCount;
  const failedCount = count("FAILED");
  const simulated = simulatedCount > 0;
  const complete = exhausted && count("CLAIMED") === 0;

  if (!complete) {
    await prisma.patientNewsAnnouncement.updateMany({ where: { id: announcement.id, status: "SENDING" }, data: { sentCount, failedCount, simulated: simulated || announcement.simulated } });
    return { recipientCount: announcement.recipientCount, sentCount, failedCount, simulated: simulated || announcement.simulated, complete: false };
  }

  const status = sentCount === 0 ? "FAILED" : failedCount === 0 ? "SENT" : "PARTIAL";
  const recipientCount = sentCount + failedCount;
  const closed = await prisma.patientNewsAnnouncement.updateMany({
    where: { id: announcement.id, status: "SENDING" },
    data: { status, recipientCount, sentCount, failedCount, simulated, completedAt: new Date() },
  });
  if (closed.count === 1) {
    await recordAudit({ action: "patient_news.announcement_sent", entityType: "PatientNewsAnnouncement", entityId: announcement.id, pharmacyId: announcement.pharmacyId, metadata: { status, recipientCount, sentCount, failedCount, simulated } });
  }
  return { recipientCount, sentCount, failedCount, simulated, complete: true };
}

/**
 * Sert les abonnés de l'annonce par lots, jusqu'à épuisement de la liste ou du
 * budget de temps. L'officine, l'annonce et le moment de sa création bornent la
 * liste : un abonné d'une autre officine, ou qui a donné son accord après la
 * rédaction de l'annonce, n'est jamais servi. Si l'officine a coupé la
 * fonction entre-temps, on s'arrête et l'annonce est clôturée telle quelle.
 */
async function processAnnouncement(announcement: AnnouncementRow, pharmacy: SendingPharmacy, deadline: number): Promise<AnnouncementProgress> {
  let exhausted = !pharmacy.isActive || !pharmacy.patientNewsEnabled;
  while (!exhausted && Date.now() < deadline) {
    const batch = await prisma.patientNewsSubscription.findMany({
      where: { pharmacyId: announcement.pharmacyId, status: "ACTIVE", consentAt: { lte: announcement.createdAt }, deliveries: { none: { announcementId: announcement.id } } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: NEWS_SEND_BATCH,
    });
    if (batch.length === 0) {
      exhausted = true;
      break;
    }
    const results = await Promise.allSettled(batch.map((subscriber) => deliverTo(subscriber.id, announcement, pharmacy)));
    // Si rien n'a pu être réservé, recommencer ne ferait que tourner dans le vide.
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure && results.every((result) => result.status === "rejected")) throw failure.reason;
  }
  return settleAnnouncement(announcement, exhausted);
}

type SendAnnouncementResult = ({ ok: true; announcementId: string } & AnnouncementProgress) | { ok: false; error: string };

/**
 * Envoie une annonce aux abonnés ACTIFS de l'officine de la session.
 *
 * Tout est revérifié ici : le contenu, l'interrupteur de l'officine,
 * l'intervalle de 7 jours, et le nombre d'abonnés que le titulaire a confirmé
 * (recalculé, jamais cru sur parole). Passé le budget de temps, l'annonce reste
 * « en cours » et se poursuit par `resumeAnnouncement` ou le passage
 * quotidien, sans doublon.
 */
export async function sendAnnouncement(scope: TenantScope, input: AnnouncementInput, confirmedRecipientCount: number): Promise<SendAnnouncementResult> {
  const checked = validateAnnouncement(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const pharmacy = await loadPharmacy(scope.pharmacyId);
  if (!pharmacy?.isActive) return { ok: false, error: "Officine introuvable." };
  if (!pharmacy.patientNewsEnabled) return { ok: false, error: "Les nouveautés pour les patients sont désactivées : réactivez-les avant d'envoyer une annonce." };

  const now = new Date();
  const next = nextAnnouncementAllowedAt(await lastCountedAnnouncementAt(pharmacy.id), now);
  if (next) return { ok: false, error: `Une annonce a déjà été envoyée cette semaine : la prochaine sera possible le ${formatDay(next)}.` };

  const activeCount = await prisma.patientNewsSubscription.count({ where: { pharmacyId: pharmacy.id, status: "ACTIVE" } });
  if (activeCount === 0) return { ok: false, error: "Aucun patient n'est abonné : il n'y a personne à qui écrire." };
  if (confirmedRecipientCount !== activeCount) {
    return { ok: false, error: `Le nombre d'abonnés a changé : ${activeCount} au lieu de ${confirmedRecipientCount}. Relisez l'annonce, puis confirmez de nouveau.` };
  }

  const announcement = await prisma.patientNewsAnnouncement.create({
    data: {
      pharmacyId: pharmacy.id,
      ...checked.value,
      status: "SENDING",
      recipientCount: activeCount,
      simulated: getMessagingProvider().info.capability !== "LIVE",
      createdByUserId: scope.userId,
      createdAt: now,
    },
    select: { id: true, pharmacyId: true, title: true, rangeLabel: true, message: true, createdAt: true, recipientCount: true, simulated: true },
  });

  // Deux envois lancés au même instant (deux onglets) passent tous deux le
  // contrôle ci-dessus. Le plus ancien garde la main, l'autre se retire avant
  // d'avoir écrit à quiconque.
  const rival = await prisma.patientNewsAnnouncement.findFirst({
    where: { pharmacyId: pharmacy.id, id: { not: announcement.id }, simulated: false, status: { not: "FAILED" }, createdAt: { gt: new Date(now.getTime() - NEWS_MIN_INTERVAL_DAYS * DAY_MS) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, createdAt: true },
  });
  if (rival && (rival.createdAt < announcement.createdAt || (rival.createdAt.getTime() === announcement.createdAt.getTime() && rival.id < announcement.id))) {
    await prisma.patientNewsAnnouncement.deleteMany({ where: { id: announcement.id } });
    return { ok: false, error: "Une annonce vient d'être lancée pour cette officine. Une seule est permise par semaine." };
  }

  const progress = await processAnnouncement(announcement, pharmacy, Date.now() + NEWS_SEND_BUDGET_MS);
  return { ok: true, announcementId: announcement.id, ...progress };
}

const announcementSelect = { id: true, pharmacyId: true, title: true, rangeLabel: true, message: true, createdAt: true, recipientCount: true, simulated: true } as const;

/** Reprend une annonce restée « en cours » : les abonnés déjà servis ne le sont pas deux fois. */
export async function resumeAnnouncement(scope: TenantScope, announcementId: string): Promise<{ ok: true; sentCount: number; failedCount: number; complete: boolean } | { ok: false; error: string }> {
  const announcement = await prisma.patientNewsAnnouncement.findFirst({ where: { id: announcementId, pharmacyId: scope.pharmacyId }, select: { ...announcementSelect, status: true } });
  if (!announcement) return { ok: false, error: "Annonce introuvable dans cette officine." };
  if (announcement.status !== "SENDING") return { ok: false, error: "Cette annonce est déjà terminée." };
  const pharmacy = await loadPharmacy(announcement.pharmacyId);
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  const { sentCount, failedCount, complete } = await processAnnouncement(announcement, pharmacy, Date.now() + NEWS_SEND_BUDGET_MS);
  return { ok: true, sentCount, failedCount, complete };
}

/** Le passage quotidien : reprend les annonces « en cours » depuis plus de 5 minutes. Renvoie le nombre d'annonces reprises. */
export async function resumeStuckAnnouncements(now: Date): Promise<number> {
  const stuck = await prisma.patientNewsAnnouncement.findMany({
    where: { status: "SENDING", createdAt: { lt: new Date(now.getTime() - NEWS_STUCK_AFTER_MS) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: announcementSelect,
  });
  const deadline = Date.now() + NEWS_SEND_BUDGET_MS;
  let resumed = 0;
  for (const announcement of stuck) {
    if (Date.now() >= deadline) break;
    try {
      const pharmacy = await loadPharmacy(announcement.pharmacyId);
      if (!pharmacy) continue;
      await processAnnouncement(announcement, pharmacy, deadline);
      resumed += 1;
    } catch {
      // Une annonce en difficulté ne doit pas empêcher les suivantes ; le prochain passage la reprendra.
      console.error("[nouveautés] reprise impossible", announcement.id);
    }
  }
  return resumed;
}

// ---------------------------------------------------------------- Conservation

/** 36 mois après le consentement, l'adresse (ou son empreinte) disparaît. Le patient peut redonner son accord par le prochain e-mail de plan. */
export async function purgeStalePatientNews(now: Date): Promise<number> {
  const purged = await prisma.patientNewsSubscription.deleteMany({ where: { consentAt: { lt: newsRetentionCutoff(now) } } });
  if (purged.count > 0) await recordAudit({ action: "patient_news.purged", entityType: "PatientNewsSubscription", metadata: { count: purged.count } });
  return purged.count;
}
