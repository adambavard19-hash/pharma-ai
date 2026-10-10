import "server-only";
import { prisma } from "@/server/db/client";
import type { DeliveryOutcome } from "@/core/ai/ports";
import { DISPATCH_STATUS } from "@/core/admin/statuses";

/**
 * Le journal des e-mails : inscription et accès, contrats, facturation, et
 * tout ce qui part du centre de modèles. Chaque envoi y laisse une
 * ligne : remis au prestataire (SENT), simulé, ou en échec avec le motif.
 * Les événements de délivrance du prestataire (webhook Resend) complètent la
 * même ligne : DELIVERED, BOUNCED, COMPLAINED, DELAYED.
 */
export type DispatchKind =
  | "INVITATION"
  | "WELCOME"
  | "ACCESS_LINK"
  | "DOSSIER_RECEIVED"
  | "CONTRACT_SENT"
  | "CONTRACT_REMINDER"
  | "PAYMENT_FAILED"
  | "TRIAL_ENDING"
  | "SUBSCRIPTION_STARTED"
  | "CONTRACT_SIGNED_PHARMACY"
  | "CONTRACT_FINALIZED"
  | "SUBSCRIPTION_INVITE"
  | "EMAIL_CONFIRMATION"
  | "SUBSCRIPTION_RECEIVED"
  | "SITE_LEAD_ACK"
  | "INSTALL_GUIDE"
  /** Une officine a écrit au support : l'alerte à l'équipe. */
  | "SUPPORT_ALERT"
  /** L'équipe a répondu à une officine depuis la console. */
  | "SUPPORT_REPLY"
  /** Le bilan envoyé au patient à la fin de sa vente au comptoir (adresse masquée dans le journal). */
  | "PATIENT_REPORT"
  /** Le bilan du mois écoulé au comptoir, envoyé au titulaire. */
  | "COUNTER_MONTHLY"
  /** Le titulaire invite un collaborateur : lien personnel pour créer son compte. */
  | "TEAM_INVITATION"
  /** Un collaborateur demande à rejoindre l'officine : l'alerte au titulaire. */
  | "JOIN_REQUEST_ALERT"
  /** Le titulaire a approuvé ou refusé une demande de rattachement. */
  | "JOIN_REQUEST_DECISION"
  /** Une demande de rattachement vient d'une adresse qui a déjà un compte : on le lui dit, par e-mail seulement. */
  | "ACCOUNT_EXISTS"
  /** Un modèle du centre de modèles (relance automatique, envoi manuel, test). */
  | "TEMPLATE"
  /** Une campagne de la console (offre bonus, parrainage, invitation des partenaires). */
  | "CAMPAIGN";

export type DispatchTrigger = "AUTOMATIC" | "MANUAL" | "TEST" | "SYSTEM";

export const DISPATCH_STATUS_LABELS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = DISPATCH_STATUS as Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }>;

export async function recordDispatch(input: {
  kind: DispatchKind;
  recipient: string;
  outcome: DeliveryOutcome;
  prospectId?: string | null;
  pharmacyId?: string | null;
  userId?: string | null;
  invitationId?: string | null;
  subject?: string | null;
  templateKey?: string | null;
  trigger?: DispatchTrigger | null;
  ruleKey?: string | null;
  contractId?: string | null;
  organizationId?: string | null;
  sentByAdminId?: string | null;
}): Promise<{ id: string }> {
  return prisma.emailDispatch.create({
    select: { id: true },
    data: {
      kind: input.kind,
      recipient: input.recipient,
      provider: input.outcome.provider,
      providerMessageId: input.outcome.messageId ?? null,
      status: input.outcome.status,
      detail: input.outcome.detail.slice(0, 500),
      prospectId: input.prospectId ?? null,
      pharmacyId: input.pharmacyId ?? null,
      userId: input.userId ?? null,
      invitationId: input.invitationId ?? null,
      subject: input.subject?.slice(0, 300) ?? null,
      templateKey: input.templateKey ?? null,
      trigger: input.trigger ?? "SYSTEM",
      ruleKey: input.ruleKey ?? null,
      contractId: input.contractId ?? null,
      organizationId: input.organizationId ?? null,
      sentByAdminId: input.sentByAdminId ?? null,
      failedAt: input.outcome.status === "FAILED" ? new Date() : null,
    },
  });
}

/**
 * Comme `recordDispatch`, sans jamais faire échouer l'envoi qu'elle trace :
 * pour les e-mails déjà partis (webhooks, relances) dont on veut garder la
 * trace dans l'historique des communications.
 */
export async function traceDispatch(input: Parameters<typeof recordDispatch>[0]): Promise<{ id: string } | null> {
  try {
    return await recordDispatch(input);
  } catch (error) {
    console.error("[e-mails] trace impossible", input.kind, error);
    return null;
  }
}

const RESEND_EVENT_STATUS: Record<string, string> = {
  "email.delivered": "DELIVERED",
  "email.delivery_delayed": "DELAYED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
};

/** Applique un événement Resend à la ligne du message concerné. Un événement inconnu est ignoré. */
export async function applyResendEvent(event: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } }): Promise<boolean> {
  const status = event.type ? RESEND_EVENT_STATUS[event.type] : undefined;
  const messageId = event.data?.email_id;
  if (!status || !messageId) return false;
  const row = await prisma.emailDispatch.findUnique({ where: { providerMessageId: messageId }, select: { id: true, status: true } });
  if (!row) return false;
  // Une délivrance confirmée n'est pas effacée par un retard signalé ensuite.
  if (row.status === "DELIVERED" && status === "DELAYED") return true;
  await prisma.emailDispatch.update({
    where: { id: row.id },
    data: {
      status,
      ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      ...(["BOUNCED", "COMPLAINED", "FAILED"].includes(status) ? { failedAt: new Date(), detail: event.data?.bounce?.message?.slice(0, 500) ?? undefined } : {}),
    },
  });
  return true;
}

/** Le dernier e-mail d'un type donné envoyé à un compte : pour l'état affiché dans la console. */
export async function lastDispatchFor(where: { userId?: string; prospectId?: string; pharmacyId?: string }, kinds: DispatchKind[]) {
  return prisma.emailDispatch.findFirst({ where: { ...where, kind: { in: kinds } }, orderBy: { createdAt: "desc" } });
}
