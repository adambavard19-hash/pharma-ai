"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { declineRecommendations, recordSale } from "@/server/services/sales";
import { isDemoMode } from "@/config/env";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

const saleSchema = z.object({
  prescriptionId: z.string().optional().nullable(),
  patientId: z.string().optional().nullable(),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        recommendationId: z.string().optional().nullable(),
        quantity: z.coerce.number().int().min(1).max(99),
        unitPriceCents: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1, "Sélectionnez au moins un produit"),
  declinedRecommendationIds: z.array(z.string()).default([]),
});

/**
 * Enregistre une vente complémentaire.
 *
 * Les conseils présentés mais non achetés peuvent être marqués comme refusés :
 * c'est ce qui permet de mesurer une conversion réelle, et non un taux
 * artificiellement élevé fondé sur les seuls achats.
 */
export async function recordSaleAction(
  payload: z.input<typeof saleSchema>,
): Promise<ActionResult<{ saleId: string; attributedCents: number }>> {
  const session = await requirePermission(PERMISSIONS.SALE_CREATE);
  const parsed = saleSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez la vente saisie.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;

  if (input.prescriptionId) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: input.prescriptionId },
      select: { pharmacyId: true },
    });
    if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
      return fail("Ordonnance introuvable dans cette officine.");
    }
  }

  try {
    const result = await recordSale({
      scope: session.scope,
      patientId: input.patientId ?? null,
      prescriptionId: input.prescriptionId ?? null,
      lines: input.lines,
      note: input.note ?? null,
      isDemo: isDemoMode(),
    });

    if (input.declinedRecommendationIds.length > 0) {
      await declineRecommendations({
        scope: session.scope,
        recommendationIds: input.declinedRecommendationIds,
        reason: "Non retenu par le patient",
      });
    }

    revalidatePath("/ventes");
    revalidatePath("/tableau-de-bord");
    if (input.prescriptionId) revalidatePath(`/vente/${input.prescriptionId}`);

    return ok(
      { saleId: result.saleId, attributedCents: result.attributedCents },
      "Vente enregistrée.",
    );
  } catch (error) {
    console.error("[sales] enregistrement impossible", error);
    return fail(
      error instanceof Error ? error.message : "La vente n'a pas pu être enregistrée.",
    );
  }
}

export async function declineRecommendationsAction(
  recommendationIds: string[],
): Promise<ActionResult<{ count: number }>> {
  const session = await requirePermission(PERMISSIONS.SALE_CREATE);
  const count = await declineRecommendations({
    scope: session.scope,
    recommendationIds,
    reason: "Non retenu par le patient",
  });

  revalidatePath("/ventes");
  return ok({ count }, `${count} conseil(s) marqué(s) comme non retenu(s).`);
}
