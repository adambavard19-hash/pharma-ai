"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { saveStandardCommission } from "@/server/services/standard-commission";
import { savePlanAction } from "@/server/actions/platform-billing";
import { OFFICIAL_OFFER, STANDARD_COMMISSION_MAX_CENTS } from "@/core/pricing/official-offer";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le tarif du site, depuis la console : publier l'offre officielle (un seul
 * abonnement, 126 € HT par mois, engagement 12 mois, mise en service 290 € HT)
 * comme offre par défaut, et régler la commission standard d'un commercial.
 *
 * Ce sont des tarifs de CATALOGUE : aucun abonnement existant n'est modifié, le
 * prix de chaque officine reste celui de son contrat.
 */

const OFFICIAL_FEATURES = ["Tous les postes de l'officine"];

/** Crée ou met à jour l'offre officielle et la rend offre par défaut (celle du site et des nouveaux contrats). */
export async function publishOfficialOfferAction(): Promise<ActionResult<{ planId: string }>> {
  const session = await requirePlatformSession();
  const existing = await prisma.plan.findUnique({ where: { code: OFFICIAL_OFFER.code }, select: { id: true, name: true, description: true, features: true, options: true, maxUsers: true, discountPercent: true, discountLabel: true, foundingPriceCents: true, sortOrder: true, monthlyPriceCents: true, setupFeeCents: true, trialDays: true, isDefault: true, isActive: true } });
  const previousDefault = await prisma.plan.findFirst({ where: { isDefault: true, isActive: true, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true, name: true } });

  const result = await savePlanAction({
    planId: existing?.id ?? null,
    code: OFFICIAL_OFFER.code,
    name: existing?.name ?? OFFICIAL_OFFER.name,
    description: existing?.description ?? "",
    monthlyPriceCents: OFFICIAL_OFFER.monthlyPriceCents,
    // Un seul abonnement : plus de prix annuel dans l'offre officielle.
    annualPriceCents: null,
    setupFeeCents: OFFICIAL_OFFER.setupFeeCents,
    annualSetupFeeCents: null,
    // Aucun essai dans l'offre officielle : rien n'est offert qui ne soit annoncé.
    trialDays: 0,
    foundingPriceCents: existing?.foundingPriceCents ?? null,
    discountPercent: existing?.discountPercent ?? null,
    discountLabel: existing?.discountLabel ?? null,
    features: existing?.features?.length ? existing.features : OFFICIAL_FEATURES,
    options: existing?.options ?? [],
    maxUsers: existing?.maxUsers ?? null,
    sortOrder: existing?.sortOrder ?? 0,
    isActive: true,
    isDefault: true,
  });
  if (!result.ok) return fail(result.error, result.fieldErrors);

  await recordAudit({
    action: "platform.public_offer_published",
    entityType: "Plan",
    entityId: result.data.planId,
    platformAdminId: session.admin.id,
    metadata: {
      before: existing ? { monthlyPriceCents: existing.monthlyPriceCents, setupFeeCents: existing.setupFeeCents, trialDays: existing.trialDays, isDefault: existing.isDefault } : null,
      after: { monthlyPriceCents: OFFICIAL_OFFER.monthlyPriceCents, setupFeeCents: OFFICIAL_OFFER.setupFeeCents, trialDays: 0, isDefault: true },
      previousDefault: previousDefault?.name ?? null,
      note: "Tarif de catalogue : aucun abonnement existant n'est modifié.",
    },
  });
  revalidatePath("/decouvrir");
  revalidatePath("/decouvrir/abonnement");
  revalidatePath("/admin/abonnements/offres");
  return ok({ planId: result.data.planId }, "Offre officielle publiée : le site affiche ces tarifs. Aucun abonnement existant n'est modifié.");
}

const commissionSchema = z.object({ amountEuros: z.string().trim().min(1, "Indiquez un montant.").max(12) });

/** La commission standard d'un commercial, par nouvelle pharmacie activée. Ne modifie aucun commercial existant. */
export async function saveStandardCommissionAction(payload: z.input<typeof commissionSchema>): Promise<ActionResult<{ amountCents: number }>> {
  const session = await requirePlatformSession();
  const parsed = commissionSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Montant invalide.");
  const euros = Number(parsed.data.amountEuros.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(euros) || euros <= 0) return fail("Indiquez un montant en euros, par exemple 250.");
  const cents = Math.round(euros * 100);
  if (cents > STANDARD_COMMISSION_MAX_CENTS) return fail(`Au plus ${STANDARD_COMMISSION_MAX_CENTS / 100} € par pharmacie activée.`);
  const saved = await saveStandardCommission(cents, session.admin.id);
  if (!saved.ok) return fail(saved.error);
  revalidatePath("/admin/abonnements/offres");
  revalidatePath("/admin/commerciaux");
  revalidatePath("/decouvrir/commercial");
  return ok({ amountCents: saved.amountCents }, "Commission standard enregistrée. Les commerciaux existants gardent leur commission.");
}
