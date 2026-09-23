"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { attachBarcodeToProduct } from "@/server/services/counter-scan";
import { fail, ok, type ActionResult } from "./types";

/** Rattacher un code-barres inconnu, lu par la douchette, à un produit du stock de l'officine. */
export async function attachBarcodeAction(payload: { lineId: string; productId: string; prescriptionId: string }): Promise<ActionResult<{ productName: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);
  const result = await attachBarcodeToProduct({ pharmacyId: session.scope.pharmacyId, userId: session.scope.userId }, payload.lineId, payload.productId);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/vente/${payload.prescriptionId}`);
  return ok({ productName: result.productName }, `${result.productName} : code ${result.code} retenu. La prochaine boîte sera reconnue directement.`);
}
