"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createOverstockCampaign, searchOverstockProducts, stopOverstockCampaign, type OverstockProduct } from "@/server/services/overstock";
import { OVERSTOCK_SENTENCE_MAX } from "@/core/overstock/campaign";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les campagnes de surstock : lancer, arrêter, chercher un produit du stock. Réservé à qui décide du conseil de l'officine
 * (RECOMMENDATION_RULES_MANAGE : titulaire et pharmacien) — c'est la trésorerie de la pharmacie. L'officine vient TOUJOURS de
 * la session ; le service ne touche qu'à ses produits.
 */

const draftSchema = z.object({
  productId: z.string().min(1).max(80),
  atcCodes: z.array(z.string().max(10)).max(30),
  familyIds: z.array(z.string().max(80)).max(30),
  sentence: z.string().max(OVERSTOCK_SENTENCE_MAX * 2),
  targetQuantity: z.number().int(),
  endsOn: z.string().max(10).nullable(),
});

export async function createOverstockCampaignAction(payload: z.input<typeof draftSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) return fail("Campagne incomplète.");
  const result = await createOverstockCampaign(session.scope, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/surstock");
  return ok({ id: result.id }, "Campagne lancée : le produit passe en premier au comptoir.");
}

export async function stopOverstockCampaignAction(payload: { id: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const id = z.string().min(1).max(80).safeParse(payload.id);
  if (!id.success) return fail("Campagne introuvable.");
  const result = await stopOverstockCampaign(session.scope, id.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/surstock");
  return ok(null, "Campagne arrêtée.");
}

export async function searchOverstockProductsAction(payload: { query: string }): Promise<ActionResult<OverstockProduct[]>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  return ok(await searchOverstockProducts(session.scope, String(payload.query ?? "").slice(0, 80)));
}
