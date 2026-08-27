import "server-only";
import { prisma } from "@/server/db/client";
import { nextReference } from "./references";
import { applyStockMovement } from "./catalog";
import { recordAudit } from "@/server/audit/log";
import { recordInteraction } from "./patients";
import { refreshStockNotifications } from "./notifications";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Enregistrement d'une vente et ATTRIBUTION du chiffre d'affaires.
 *
 * L'attribution se joue ici, une fois pour toutes : une ligne rattachée à une
 * `Recommendation` alimente `attributedCents`. C'est ce qui permet d'affirmer,
 * chiffres à l'appui, ce que Pharma.ai a réellement généré — et de ne jamais
 * s'attribuer une vente qui n'en découle pas.
 */

export type SaleLineInput = {
  productId: string;
  recommendationId?: string | null;
  quantity: number;
  /** Prix unitaire en centimes. Reprend le prix catalogue si absent. */
  unitPriceCents?: number;
};

export async function recordSale(params: {
  scope: TenantScope;
  patientId?: string | null;
  prescriptionId?: string | null;
  lines: SaleLineInput[];
  note?: string | null;
  isDemo?: boolean;
}): Promise<{ saleId: string; totalCents: number; attributedCents: number }> {
  if (params.lines.length === 0) {
    throw new Error("Une vente doit comporter au moins une ligne.");
  }

  const productIds = params.lines.map((line) => line.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, pharmacyId: params.scope.pharmacyId },
    include: { stockItem: true },
  });

  if (products.length !== new Set(productIds).size) {
    throw new Error("Un produit de la vente n'appartient pas à cette officine.");
  }

  const productById = new Map(products.map((p) => [p.id, p]));

  // Les recommandations citées doivent appartenir à l'officine : sans ce
  // contrôle, une requête forgée pourrait s'attribuer une vente d'un tiers.
  const recommendationIds = params.lines
    .map((line) => line.recommendationId)
    .filter((id): id is string => Boolean(id));

  const recommendations =
    recommendationIds.length > 0
      ? await prisma.recommendation.findMany({
          where: { id: { in: recommendationIds }, pharmacyId: params.scope.pharmacyId },
          select: { id: true },
        })
      : [];
  const validRecommendationIds = new Set(recommendations.map((r) => r.id));

  const computed = params.lines.map((line) => {
    const product = productById.get(line.productId)!;
    const unitPriceCents = line.unitPriceCents ?? product.salePriceCents;
    const quantity = Math.max(1, Math.trunc(line.quantity));
    const totalCents = unitPriceCents * quantity;
    const marginCents = (unitPriceCents - product.purchasePriceCents) * quantity;
    const recommendationId =
      line.recommendationId && validRecommendationIds.has(line.recommendationId)
        ? line.recommendationId
        : null;

    return {
      product,
      recommendationId,
      quantity,
      unitPriceCents,
      totalCents,
      marginCents,
      vatRate: product.vatRate,
    };
  });

  const totalCents = computed.reduce((sum, line) => sum + line.totalCents, 0);
  const totalMarginCents = computed.reduce((sum, line) => sum + line.marginCents, 0);
  const attributedCents = computed
    .filter((line) => line.recommendationId)
    .reduce((sum, line) => sum + line.totalCents, 0);
  const attributedMarginCents = computed
    .filter((line) => line.recommendationId)
    .reduce((sum, line) => sum + line.marginCents, 0);

  const reference = await nextReference("sale", params.scope.pharmacyId);

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        pharmacyId: params.scope.pharmacyId,
        patientId: params.patientId ?? null,
        prescriptionId: params.prescriptionId ?? null,
        reference,
        channel: attributedCents > 0 ? "PHARMA_AI_ADVICE" : "COUNTER",
        totalCents,
        totalMarginCents,
        attributedCents,
        attributedMarginCents,
        userId: params.scope.userId,
        note: params.note ?? null,
        isDemo: params.isDemo ?? false,
        lines: {
          create: computed.map((line) => ({
            productId: line.product.id,
            recommendationId: line.recommendationId,
            label: line.product.name,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            marginCents: line.marginCents,
            vatRate: line.vatRate,
          })),
        },
      },
    });

    for (const line of computed) {
      if (!line.recommendationId) continue;
      await tx.recommendation.update({
        where: { id: line.recommendationId },
        data: { status: "PURCHASED", quantity: line.quantity },
      });
      await tx.recommendationEvent.create({
        data: {
          recommendationId: line.recommendationId,
          type: "PURCHASED",
          userId: params.scope.userId,
          metadata: {
            saleId: created.id,
            quantity: line.quantity,
            totalCents: line.totalCents,
          } as never,
        },
      });
    }

    return created;
  });

  // Le mouvement de stock est appliqué hors transaction principale afin que
  // l'échec d'un décrément (produit sans fiche stock) n'annule pas la vente.
  for (const line of computed) {
    await applyStockMovement({
      scope: params.scope,
      productId: line.product.id,
      quantityDelta: -line.quantity,
      type: "SALE",
      reason: `Vente ${reference}`,
      saleId: sale.id,
    }).catch((error) => {
      console.error("[sales] mouvement de stock impossible", line.product.id, error);
    });
  }

  await refreshStockNotifications(params.scope.pharmacyId);

  if (params.patientId) {
    await recordInteraction({
      patientId: params.patientId,
      scope: params.scope,
      type: "SALE_RECORDED",
      summary: `Vente ${reference} enregistrée (${computed.length} produit(s)).`,
      metadata: { saleId: sale.id, attributedCents },
    });
  }

  await recordAudit({
    action: "sale.created",
    entityType: "Sale",
    entityId: sale.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: {
      reference,
      lines: computed.length,
      totalCents,
      attributedCents,
    },
  });

  return { saleId: sale.id, totalCents, attributedCents };
}

/** Marque les conseils non achetés, pour distinguer refus patient et oubli. */
export async function declineRecommendations(params: {
  scope: TenantScope;
  recommendationIds: string[];
  reason?: string | null;
}): Promise<number> {
  if (params.recommendationIds.length === 0) return 0;

  const owned = await prisma.recommendation.findMany({
    where: {
      id: { in: params.recommendationIds },
      pharmacyId: params.scope.pharmacyId,
      status: { in: ["PRESENTED", "ACCEPTED", "MODIFIED", "REPLACED"] },
    },
    select: { id: true },
  });

  if (owned.length === 0) return 0;
  const ids = owned.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    await tx.recommendation.updateMany({
      where: { id: { in: ids } },
      data: { status: "DECLINED" },
    });
    for (const id of ids) {
      await tx.recommendationEvent.create({
        data: {
          recommendationId: id,
          type: "DECLINED_BY_PATIENT",
          userId: params.scope.userId,
          metadata: { reason: params.reason ?? null } as never,
        },
      });
    }
  });

  return ids.length;
}
