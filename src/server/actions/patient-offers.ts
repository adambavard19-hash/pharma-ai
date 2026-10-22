"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { cancelLabOffer, cancelPharmacyOffer, createLabOffer, createPharmacyOffer, markClaimedPharmacy } from "@/server/services/patient-offers";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les offres de l'appli des patients : celles du titulaire (sa pharmacie vient de la session, jamais de la requête), celles
 * des laboratoires et les pharmacies réclamées (console PharmaBoost).
 */

const offerSchema = z.object({
  title: z.string().max(500),
  rangeLabel: z.string().max(500),
  discountPercent: z.number().int(),
  details: z.string().max(2000).nullable().optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  audience: z.enum(["ALL", "SUBSCRIBERS"]),
});

/** « 2026-10-22 » → le début de ce jour, « 2026-11-22 » → sa fin (heure de Paris approchée par UTC+2 au plus). */
function dates(startsOn: string, endsOn: string): { startsAt: Date; endsAt: Date } {
  return { startsAt: new Date(`${startsOn}T00:00:00+02:00`), endsAt: new Date(`${endsOn}T23:59:59+01:00`) };
}

export async function createPharmacyOfferAction(payload: z.input<typeof offerSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const parsed = offerSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const { startsOn, endsOn, ...rest } = parsed.data;
  const result = await createPharmacyOffer(session.scope, session.user.fullName, { ...rest, ...dates(startsOn, endsOn) });
  if (!result.ok) return fail(result.error);
  revalidatePath("/offres-patients");
  return ok(null, "Offre publiée : vos patients la voient dans l'appli PharmaBoost.");
}

export async function cancelPharmacyOfferAction(offerId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);
  const done = await cancelPharmacyOffer(session.scope, String(offerId ?? "").slice(0, 64));
  if (!done) return fail("Cette offre est déjà arrêtée.");
  revalidatePath("/offres-patients");
  return ok(null, "Offre arrêtée.");
}

const labSchema = offerSchema.extend({ partnerId: z.string().min(1).max(64), labFeeEuros: z.number().min(0).max(100) });

export async function createLabOfferAction(payload: z.input<typeof labSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = labSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const { startsOn, endsOn, labFeeEuros, ...rest } = parsed.data;
  const result = await createLabOffer({ id: session.admin.id, name: session.admin.fullName }, { ...rest, labFeeCents: Math.round(labFeeEuros * 100), ...dates(startsOn, endsOn) });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/offres-laboratoires");
  return ok(null, "Offre publiée dans toutes les pharmacies PharmaBoost.");
}

export async function cancelLabOfferAction(offerId: string): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const done = await cancelLabOffer({ id: session.admin.id }, String(offerId ?? "").slice(0, 64));
  if (!done) return fail("Cette offre est déjà arrêtée.");
  revalidatePath("/admin/offres-laboratoires");
  return ok(null, "Offre arrêtée.");
}

export async function markClaimedPharmacyAction(key: string, note: string): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const count = await markClaimedPharmacy({ id: session.admin.id }, String(key ?? "").slice(0, 200), String(note ?? ""));
  if (count === 0) return fail("Pharmacie introuvable.");
  revalidatePath("/admin/pharmacies-reclamees");
  return ok(null, "Suite notée.");
}
