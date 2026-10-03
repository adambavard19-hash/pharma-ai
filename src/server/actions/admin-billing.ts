"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { changeContractPrice } from "@/server/services/admin/price-changes";
import { addCancellationNote, CANCELLATION_CHANNEL_CODES, CANCELLATION_REASON_CODES, createCancellationRequest, logCancellationContact, moveCancellation, scheduleStripeEnd } from "@/server/services/admin/cancellations";
import { CANCELLATION_STATUSES } from "@/core/admin/statuses";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes de l'espace Facturation ajoutés au centre de contrôle : tarif
 * contractuel, demandes de résiliation. Chaque action exige une session
 * administrateur, valide son entrée, revérifie en base ce qu'elle désigne,
 * et laisse une trace (historique métier + journal d'audit).
 */

const id = z.string().trim().min(1).max(60);
const dateInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.");

/** Une date saisie (« 2026-10-03 ») devient midi UTC ce jour-là : aucun fuseau ne la fait glisser d'un jour à l'affichage. */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function revalidateSubscription(pharmacyId: string | null | undefined) {
  revalidatePath("/admin");
  revalidatePath("/admin/abonnements");
  revalidatePath("/admin/abonnements/offres");
  if (pharmacyId) {
    revalidatePath(`/admin/abonnements/${pharmacyId}`);
    revalidatePath(`/admin/pharmacies/${pharmacyId}`);
  }
}

function revalidateCancellation(requestId: string, pharmacyId: string | null | undefined) {
  revalidatePath("/admin/resiliations");
  revalidatePath(`/admin/resiliations/${requestId}`);
  revalidateSubscription(pharmacyId);
}

// ---------------------------------------------------------------- Tarif contractuel

const priceSchema = z.object({
  subscriptionId: id,
  nextCents: z.coerce.number().int("Montant en centimes entiers.").min(100, "Au moins 1 € HT.").max(1_000_000, "Au plus 10 000 € HT."),
  reason: z.string().trim().min(5, "Indiquez le motif (5 caractères au moins).").max(500),
});

export async function changeContractPriceAction(payload: z.input<typeof priceSchema>): Promise<ActionResult<{ appliedToStripe: boolean }>> {
  const session = await requirePlatformSession();
  const parsed = priceSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le nouveau tarif.", zodFieldErrors(parsed.error.issues));
  const result = await changeContractPrice({ ...parsed.data, adminId: session.admin.id });
  if (!result.ok) return fail(result.error);
  const subscription = await prisma.subscription.findUnique({ where: { id: parsed.data.subscriptionId }, select: { organization: { select: { pharmacies: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true } } } } } });
  revalidateSubscription(subscription?.organization.pharmacies[0]?.id);
  return ok({ appliedToStripe: result.appliedToStripe }, result.message);
}

// ---------------------------------------------------------------- Résiliations

const createSchema = z.object({
  pharmacyId: id,
  reason: z.enum(CANCELLATION_REASON_CODES, "Choisissez un motif."),
  reasonDetail: z.string().trim().max(1000).optional().nullable(),
  channel: z.enum(CANCELLATION_CHANNEL_CODES, "Choisissez le canal de la demande."),
  requestedAt: dateInput,
  plannedEndAt: dateInput.optional().nullable().or(z.literal("")),
});

export async function createCancellationAction(payload: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la demande.", zodFieldErrors(parsed.error.issues));
  const requestedAt = parseDay(parsed.data.requestedAt);
  if (!requestedAt) return fail("Date de la demande invalide.", { requestedAt: "Date invalide." });
  const plannedEndAt = parsed.data.plannedEndAt ? parseDay(parsed.data.plannedEndAt) : null;
  if (parsed.data.plannedEndAt && !plannedEndAt) return fail("Date de fin prévue invalide.", { plannedEndAt: "Date invalide." });
  if (plannedEndAt && plannedEndAt < requestedAt) return fail("La fin prévue précède la demande.", { plannedEndAt: "Doit suivre la date de la demande." });
  const result = await createCancellationRequest({
    pharmacyId: parsed.data.pharmacyId,
    reason: parsed.data.reason,
    reasonDetail: parsed.data.reasonDetail ?? null,
    channel: parsed.data.channel,
    requestedAt,
    plannedEndAt,
    actor: { adminId: session.admin.id, label: session.admin.fullName },
  });
  if (!result.ok) return fail(result.error);
  revalidateCancellation(result.data.id, result.data.pharmacyId);
  return ok({ id: result.data.id }, result.message);
}

const moveSchema = z.object({
  requestId: id,
  to: z.enum(CANCELLATION_STATUSES),
  note: z.string().trim().max(1000).optional().nullable(),
  plannedEndAt: dateInput.optional().nullable().or(z.literal("")),
});

export async function moveCancellationAction(payload: z.input<typeof moveSchema>): Promise<ActionResult<{ to: string }>> {
  const session = await requirePlatformSession();
  const parsed = moveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.", zodFieldErrors(parsed.error.issues));
  let plannedEndAt: Date | null | undefined;
  if (parsed.data.plannedEndAt !== undefined && parsed.data.plannedEndAt !== null && parsed.data.plannedEndAt !== "") {
    plannedEndAt = parseDay(parsed.data.plannedEndAt);
    if (!plannedEndAt) return fail("Date de fin prévue invalide.");
  }
  const result = await moveCancellation(parsed.data.requestId, parsed.data.to, { adminId: session.admin.id, label: session.admin.fullName }, { note: parsed.data.note ?? null, plannedEndAt });
  if (!result.ok) return fail(result.error);
  revalidateCancellation(result.data.id, result.data.pharmacyId);
  return ok({ to: result.data.to }, result.message);
}

const noteSchema = z.object({ requestId: id, body: z.string().trim().min(3, "La note est vide.").max(1500) });

export async function addCancellationNoteAction(payload: z.input<typeof noteSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = noteSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Note invalide.", zodFieldErrors(parsed.error.issues));
  const result = await addCancellationNote(parsed.data.requestId, parsed.data.body, { adminId: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidateCancellation(result.data.id, result.data.pharmacyId);
  return ok(null, result.message);
}

const contactSchema = z.object({
  requestId: id,
  channel: z.enum(CANCELLATION_CHANNEL_CODES, "Choisissez le canal."),
  summary: z.string().trim().min(3, "Résumez l'échange.").max(1500),
  at: dateInput.optional().nullable().or(z.literal("")),
});

export async function logCancellationContactAction(payload: z.input<typeof contactSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Contact invalide.", zodFieldErrors(parsed.error.issues));
  const at = parsed.data.at ? parseDay(parsed.data.at) : null;
  if (parsed.data.at && !at) return fail("Date du contact invalide.");
  const result = await logCancellationContact(parsed.data.requestId, { channel: parsed.data.channel, summary: parsed.data.summary, at }, { adminId: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidateCancellation(result.data.id, result.data.pharmacyId);
  return ok(null, result.message);
}

export async function scheduleCancellationStripeEndAction(payload: { requestId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ requestId: id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await scheduleStripeEnd(parsed.data.requestId, { adminId: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidateCancellation(result.data.id, result.data.pharmacyId);
  return ok(null, result.message);
}
