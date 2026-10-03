import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { setCancelAtPeriodEnd } from "@/server/billing/subscriptions";
import { CANCELLATION_CHANNELS, CANCELLATION_REASONS, CANCELLATION_STATUS_LABELS, canMoveCancellation, isOpenCancellation, type CancellationStatusCode } from "@/core/admin/statuses";
import { formatFrenchDate } from "@/core/billing/subscription";

/**
 * Les demandes de résiliation, de la réception à la fin.
 *
 * Trois règles :
 *   - l'officine, son organisation et son abonnement sont TOUJOURS retrouvés
 *     côté serveur : la console désigne une officine, rien de plus ;
 *   - chaque geste laisse un événement (`CancellationEvent`) et une ligne au
 *     journal d'audit ;
 *   - rien n'est jamais supprimé ni coupé automatiquement : terminer une
 *     demande ne touche ni l'accès ni Stripe. La fin chez Stripe est un geste
 *     à part, explicite (`scheduleStripeEnd`).
 */

export type Actor = { adminId: string; label: string };
type Result<T> = { ok: true; data: T; message: string } | { ok: false; error: string };

export const CANCELLATION_REASON_CODES = Object.keys(CANCELLATION_REASONS) as [string, ...string[]];
export const CANCELLATION_CHANNEL_CODES = Object.keys(CANCELLATION_CHANNELS) as [string, ...string[]];

function statusLabel(status: string): string {
  return CANCELLATION_STATUS_LABELS[status as CancellationStatusCode]?.label ?? status;
}

function clean(text: string | null | undefined, max: number): string | null {
  const value = (text ?? "").replace(/\s+\n/g, "\n").trim();
  return value ? value.slice(0, max) : null;
}

// ---------------------------------------------------------------- Création

export type CreateCancellationInput = {
  pharmacyId: string;
  reason: string;
  reasonDetail?: string | null;
  channel: string;
  requestedAt: Date;
  plannedEndAt?: Date | null;
  actor: Actor;
};

export async function createCancellationRequest(input: CreateCancellationInput): Promise<Result<{ id: string; pharmacyId: string }>> {
  if (!(input.reason in CANCELLATION_REASONS)) return { ok: false, error: "Motif inconnu." };
  if (!(input.channel in CANCELLATION_CHANNELS)) return { ok: false, error: "Canal inconnu." };
  if (Number.isNaN(input.requestedAt.getTime()) || input.requestedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { ok: false, error: "La date de la demande ne peut pas être dans le futur." };
  }
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: input.pharmacyId }, select: { id: true, name: true, isDemo: true, organizationId: true } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  if (pharmacy.isDemo) return { ok: false, error: "Une officine de démonstration n'a pas de résiliation à suivre." };
  const open = await prisma.cancellationRequest.findFirst({ where: { pharmacyId: pharmacy.id, status: { in: ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] } }, select: { id: true } });
  if (open) return { ok: false, error: "Une demande de résiliation est déjà ouverte pour cette officine : complétez-la plutôt que d'en créer une seconde." };
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { id: true } });

  const reasonDetail = clean(input.reasonDetail, 1000);
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.cancellationRequest.create({
      data: {
        pharmacyId: pharmacy.id,
        organizationId: pharmacy.organizationId,
        subscriptionId: subscription?.id ?? null,
        status: "RECEIVED",
        reason: input.reason,
        reasonDetail,
        channel: input.channel,
        requestedAt: input.requestedAt,
        plannedEndAt: input.plannedEndAt ?? null,
        createdByAdminId: input.actor.adminId,
      },
      select: { id: true },
    });
    await tx.cancellationEvent.create({
      data: {
        requestId: created.id,
        type: "CREATED",
        summary: `Demande enregistrée (${CANCELLATION_CHANNELS[input.channel].toLowerCase()}, reçue le ${formatFrenchDate(input.requestedAt)}) — motif : ${CANCELLATION_REASONS[input.reason]}.`,
        toStatus: "RECEIVED",
        actorAdminId: input.actor.adminId,
        actorLabel: input.actor.label,
      },
    });
    return created;
  });

  await recordAudit({
    action: "billing.cancellation_created",
    entityType: "CancellationRequest",
    entityId: request.id,
    pharmacyId: pharmacy.id,
    platformAdminId: input.actor.adminId,
    metadata: { after: { status: "RECEIVED", reason: input.reason, channel: input.channel, requestedAt: input.requestedAt.toISOString(), plannedEndAt: input.plannedEndAt?.toISOString() ?? null }, subscriptionId: subscription?.id ?? null },
  });
  return { ok: true, data: { id: request.id, pharmacyId: pharmacy.id }, message: `Demande de résiliation enregistrée pour ${pharmacy.name}. Rien n'est coupé : l'abonnement et l'accès continuent.` };
}

// ---------------------------------------------------------------- Statut

/** Les dates que pose un changement de statut ; les autres restent intactes. */
export function statusDates(to: CancellationStatusCode, now: Date): { confirmedAt?: Date; completedAt?: Date; canceledAt?: Date } {
  if (to === "CONFIRMED") return { confirmedAt: now };
  if (to === "COMPLETED") return { completedAt: now };
  if (to === "CANCELED") return { canceledAt: now };
  return {};
}

export async function moveCancellation(id: string, to: CancellationStatusCode, actor: Actor, options: { note?: string | null; plannedEndAt?: Date | null } = {}): Promise<Result<{ id: string; pharmacyId: string; from: string; to: string }>> {
  const request = await prisma.cancellationRequest.findUnique({ where: { id }, select: { id: true, status: true, pharmacyId: true, requestedAt: true, plannedEndAt: true, stripeScheduled: true } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  const from = request.status as CancellationStatusCode;
  if (options.plannedEndAt && request.requestedAt && options.plannedEndAt < request.requestedAt) return { ok: false, error: "La fin prévue ne peut pas précéder la demande." };
  if (!canMoveCancellation(from, to)) {
    return { ok: false, error: `Passage impossible : « ${statusLabel(from)} » ne peut pas devenir « ${statusLabel(to)} ».` };
  }
  const note = clean(options.note, 1000);
  if (to === "CANCELED" && !note) return { ok: false, error: "Indiquez pourquoi la demande est annulée (le client a changé d'avis…)." };
  const now = new Date();
  const plannedEndAt = options.plannedEndAt !== undefined ? options.plannedEndAt : request.plannedEndAt;

  // Écriture conditionnée au statut lu : deux gestes simultanés ne s'écrasent pas.
  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.cancellationRequest.updateMany({
      where: { id, status: from },
      data: { status: to, ...statusDates(to, now), ...(options.plannedEndAt !== undefined ? { plannedEndAt: options.plannedEndAt } : {}) },
    });
    if (updated.count === 0) return false;
    const endText = to === "CONFIRMED" && plannedEndAt ? ` Fin prévue le ${formatFrenchDate(plannedEndAt)}.` : "";
    await tx.cancellationEvent.create({
      data: {
        requestId: id,
        type: "STATUS_CHANGED",
        summary: `${statusLabel(from)} → ${statusLabel(to)}.${endText}${note ? ` ${note}` : ""}`.slice(0, 1500),
        fromStatus: from,
        toStatus: to,
        actorAdminId: actor.adminId,
        actorLabel: actor.label,
      },
    });
    return true;
  });
  if (!done) return { ok: false, error: "La demande a changé entre-temps : rechargez la page." };

  await recordAudit({
    action: "billing.cancellation_status_changed",
    entityType: "CancellationRequest",
    entityId: id,
    pharmacyId: request.pharmacyId,
    platformAdminId: actor.adminId,
    metadata: {
      changes: { status: { from, to }, ...(options.plannedEndAt !== undefined ? { plannedEndAt: { from: request.plannedEndAt?.toISOString() ?? null, to: options.plannedEndAt?.toISOString() ?? null } } : {}) },
      note,
    },
  });

  const messages: Record<CancellationStatusCode, string> = {
    RECEIVED: "Demande reçue.",
    IN_PROGRESS: "Demande passée en traitement.",
    CONFIRMED: "Résiliation confirmée. Pensez à programmer la fin chez Stripe et à envoyer la confirmation au titulaire.",
    CANCELED: request.stripeScheduled ? "Demande annulée. La fin reste programmée chez Stripe : annulez-la depuis la fiche abonnement." : "Demande annulée : l'abonnement continue.",
    COMPLETED: "Résiliation terminée. Rien n'a été coupé ni supprimé automatiquement.",
  };
  return { ok: true, data: { id, pharmacyId: request.pharmacyId, from, to }, message: messages[to] };
}

// ---------------------------------------------------------------- Notes et contacts

export async function addCancellationNote(id: string, body: string, actor: Actor): Promise<Result<{ id: string; pharmacyId: string }>> {
  const text = clean(body, 1500);
  if (!text || text.length < 3) return { ok: false, error: "La note est vide." };
  const request = await prisma.cancellationRequest.findUnique({ where: { id }, select: { id: true, pharmacyId: true } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  await prisma.cancellationEvent.create({ data: { requestId: id, type: "NOTE", summary: text, actorAdminId: actor.adminId, actorLabel: actor.label } });
  await prisma.cancellationRequest.update({ where: { id }, data: { updatedAt: new Date() } });
  await recordAudit({ action: "billing.cancellation_note_added", entityType: "CancellationRequest", entityId: id, pharmacyId: request.pharmacyId, platformAdminId: actor.adminId, metadata: { kind: "note", length: text.length } });
  return { ok: true, data: { id, pharmacyId: request.pharmacyId }, message: "Note ajoutée à l'historique de la demande." };
}

export async function logCancellationContact(id: string, input: { channel: string; summary: string; at?: Date | null }, actor: Actor): Promise<Result<{ id: string; pharmacyId: string }>> {
  if (!(input.channel in CANCELLATION_CHANNELS)) return { ok: false, error: "Canal inconnu." };
  const text = clean(input.summary, 1500);
  if (!text || text.length < 3) return { ok: false, error: "Résumez l'échange en quelques mots." };
  const at = input.at ?? new Date();
  // Une date saisie vaut midi UTC ce jour-là : on tolère la journée en cours.
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, error: "La date du contact ne peut pas être dans le futur." };
  const request = await prisma.cancellationRequest.findUnique({ where: { id }, select: { id: true, pharmacyId: true, lastContactAt: true } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  await prisma.$transaction([
    prisma.cancellationEvent.create({ data: { requestId: id, type: "CONTACT", summary: `${CANCELLATION_CHANNELS[input.channel]} le ${formatFrenchDate(at)} : ${text}`.slice(0, 1600), actorAdminId: actor.adminId, actorLabel: actor.label } }),
    // Le dernier contact ne recule jamais : un échange ancien noté tard ne masque pas un plus récent.
    prisma.cancellationRequest.update({ where: { id }, data: { lastContactAt: !request.lastContactAt || request.lastContactAt < at ? at : request.lastContactAt } }),
  ]);
  await recordAudit({ action: "billing.cancellation_note_added", entityType: "CancellationRequest", entityId: id, pharmacyId: request.pharmacyId, platformAdminId: actor.adminId, metadata: { kind: "contact", channel: input.channel, at: at.toISOString() } });
  return { ok: true, data: { id, pharmacyId: request.pharmacyId }, message: "Contact noté." };
}

// ---------------------------------------------------------------- Fin chez Stripe

/**
 * Programme la fin de l'abonnement Stripe à l'échéance en cours. Sans Stripe
 * configuré, on refuse explicitement : rien n'est simulé, le geste reste à
 * faire chez Stripe.
 */
export async function scheduleStripeEnd(id: string, actor: Actor): Promise<Result<{ id: string; pharmacyId: string }>> {
  const request = await prisma.cancellationRequest.findUnique({ where: { id }, select: { id: true, status: true, pharmacyId: true, organizationId: true, stripeScheduled: true, plannedEndAt: true } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  if (!isOpenCancellation(request.status)) return { ok: false, error: "Cette demande est close : rien à programmer." };
  if (request.stripeScheduled) return { ok: false, error: "La fin est déjà programmée chez Stripe." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `À faire chez Stripe : Stripe n'est pas configuré sur ce serveur (${state.detail}). Rien n'a été programmé.` };
  // L'abonnement est relu par l'organisation de la demande, jamais désigné par le client.
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: request.organizationId }, select: { id: true, stripeSubscriptionId: true } });
  if (!subscription?.stripeSubscriptionId) return { ok: false, error: "Aucun abonnement Stripe n'est rattaché à cette officine : rien à programmer chez Stripe." };

  const result = await setCancelAtPeriodEnd(request.organizationId, true, actor.adminId);
  if (!result.ok) return { ok: false, error: result.error };
  const refreshed = await prisma.subscription.findUnique({ where: { id: subscription.id }, select: { currentPeriodEnd: true, cancelAt: true } });
  const endAt = refreshed?.cancelAt ?? refreshed?.currentPeriodEnd ?? null;
  await prisma.$transaction([
    prisma.cancellationRequest.update({ where: { id }, data: { stripeScheduled: true, subscriptionId: subscription.id, ...(request.plannedEndAt ? {} : endAt ? { plannedEndAt: endAt } : {}) } }),
    prisma.cancellationEvent.create({ data: { requestId: id, type: "STRIPE_SCHEDULED", summary: `Fin programmée chez Stripe${endAt ? ` au ${formatFrenchDate(endAt)}` : " à la fin de la période en cours"}.`, actorAdminId: actor.adminId, actorLabel: actor.label } }),
  ]);
  await recordAudit({ action: "billing.cancellation_stripe_scheduled", entityType: "CancellationRequest", entityId: id, pharmacyId: request.pharmacyId, platformAdminId: actor.adminId, metadata: { subscriptionId: subscription.id, endAt: endAt?.toISOString() ?? null } });
  return { ok: true, data: { id, pharmacyId: request.pharmacyId }, message: `Fin programmée chez Stripe${endAt ? ` au ${formatFrenchDate(endAt)}` : ""}. L'accès reste ouvert jusque-là.` };
}
