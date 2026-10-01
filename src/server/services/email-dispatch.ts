import "server-only";
import { prisma } from "@/server/db/client";
import type { DeliveryOutcome } from "@/core/ai/ports";

/**
 * Le journal des e-mails d'inscription et d'accès. Chaque envoi y laisse une
 * ligne : remis au prestataire (SENT), simulé, ou en échec avec le motif.
 * Les événements de délivrance du prestataire (webhook Resend) complètent la
 * même ligne : DELIVERED, BOUNCED, COMPLAINED, DELAYED.
 */
export type DispatchKind = "INVITATION" | "WELCOME" | "ACCESS_LINK" | "DOSSIER_RECEIVED";

export const DISPATCH_STATUS_LABELS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  SENT: { label: "Envoyé", tone: "info" },
  DELIVERED: { label: "Délivré", tone: "success" },
  DELAYED: { label: "Délivrance retardée", tone: "warning" },
  BOUNCED: { label: "Adresse rejetée", tone: "danger" },
  COMPLAINED: { label: "Signalé comme indésirable", tone: "danger" },
  FAILED: { label: "Échec d'envoi", tone: "danger" },
  SIMULATED: { label: "Non envoyé (messagerie non configurée)", tone: "warning" },
};

export async function recordDispatch(input: {
  kind: DispatchKind;
  recipient: string;
  outcome: DeliveryOutcome;
  prospectId?: string | null;
  pharmacyId?: string | null;
  userId?: string | null;
  invitationId?: string | null;
}): Promise<void> {
  await prisma.emailDispatch.create({
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
      failedAt: input.outcome.status === "FAILED" ? new Date() : null,
    },
  });
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
