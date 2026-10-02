"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { VIGILANCE_LEVELS, VIGILANCE_POPULATIONS } from "@/config/vigilances";
import { deleteProductVigilance, saveProductVigilance } from "@/server/services/product-vigilances";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Déclarer une vigilance patient sur un produit de l'officine : un acte
 * pharmaceutique, réservé à ceux qui gèrent les règles de conseil.
 */

const schema = z.object({
  productId: z.string().min(1),
  population: z.enum(VIGILANCE_POPULATIONS.map((p) => p.key) as [string, ...string[]]),
  level: z.enum(VIGILANCE_LEVELS),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function saveProductVigilanceAction(payload: z.input<typeof schema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la vigilance saisie.", zodFieldErrors(parsed.error.issues));
  const result = await saveProductVigilance(session.scope, { ...parsed.data, note: parsed.data.note || null });
  if (!result.ok) return fail(result.error);
  await recordAudit({
    action: "vigilance.product_saved",
    entityType: "ProductVigilance",
    entityId: result.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { productId: parsed.data.productId, population: parsed.data.population, level: parsed.data.level },
  });
  revalidatePath(`/stock/${parsed.data.productId}`);
  return ok(null, "Vigilance enregistrée.");
}

export async function deleteProductVigilanceAction(id: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const result = await deleteProductVigilance(session.scope, id);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "vigilance.product_deleted", entityType: "ProductVigilance", entityId: id, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId });
  revalidatePath(`/stock/${result.productId}`);
  return ok(null, "Vigilance retirée.");
}
