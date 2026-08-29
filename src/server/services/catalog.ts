import "server-only";
import { prisma } from "@/server/db/client";
import { siblingPharmacyIds, type TenantScope } from "@/server/db/tenant";
import type { CatalogProduct, PharmacyRuleInput, ProductValidationHistory } from "@/core/ai/types";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";

/**
 * Chargement du catalogue pour le moteur de recommandation.
 *
 * Le moteur ne connaît que des `CatalogProduct` : il ne voit jamais un modèle
 * Prisma, ce qui garde le domaine indépendant de la couche de persistance.
 */
export async function loadCatalogSnapshot(
  scope: TenantScope,
  options: { includeSiblingAvailability?: boolean } = {},
): Promise<CatalogProduct[]> {
  const products = await prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true },
    include: { stockItem: true },
  });

  let siblingEans = new Set<string>();
  if (options.includeSiblingAvailability) {
    const siblings = await siblingPharmacyIds(scope);
    if (siblings.length > 0) {
      const available = await prisma.product.findMany({
        where: {
          pharmacyId: { in: siblings },
          deletedAt: null,
          isActive: true,
          ean: { not: null },
          stockItem: { quantity: { gt: 0 } },
        },
        select: { ean: true },
      });
      siblingEans = new Set(
        available.map((p) => p.ean).filter((ean): ean is string => Boolean(ean)),
      );
    }
  }

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    reference: product.reference,
    ean: product.ean,
    imageUrl: product.imageUrl,
    description: product.description,
    commercialClaims: product.commercialClaims,
    precautions: product.precautions,
    matchingTags: product.matchingTags,
    contraindications: product.contraindications,
    salePriceCents: product.salePriceCents,
    purchasePriceCents: product.purchasePriceCents,
    vatRate: product.vatRate,
    stockQuantity: product.stockItem?.quantity ?? 0,
    alertThreshold: product.stockItem?.alertThreshold ?? 0,
    availableInSiblingPharmacy: product.ean ? siblingEans.has(product.ean) : false,
    isActive: product.isActive,
  }));
}

export async function loadPharmacyRules(scope: TenantScope): Promise<PharmacyRuleInput[]> {
  const rules = await prisma.pharmacyRule.findMany({
    where: { pharmacyId: scope.pharmacyId, isActive: true },
  });

  return rules.map((rule) => ({
    id: rule.id,
    type: rule.type,
    productId: rule.productId,
    category: rule.category,
    context: (rule.context ?? {}) as PharmacyRuleInput["context"],
    weight: rule.weight,
  }));
}

/** Historique d'acceptation par produit, propre à l'officine. */
export async function loadValidationHistory(
  scope: TenantScope,
): Promise<ProductValidationHistory> {
  const rows = await prisma.recommendation.groupBy({
    by: ["productId", "status"],
    where: { pharmacyId: scope.pharmacyId, productId: { not: null } },
    _count: true,
  });

  const ACCEPTED = new Set([
    "ACCEPTED",
    "MODIFIED",
    "REPLACED",
    "PRESENTED",
    "PURCHASED",
    "DECLINED",
  ]);

  const history: ProductValidationHistory = {};
  for (const row of rows) {
    if (!row.productId) continue;
    const entry = (history[row.productId] ??= { proposed: 0, accepted: 0, purchased: 0 });
    entry.proposed += row._count;
    if (ACCEPTED.has(row.status)) entry.accepted += row._count;
    if (row.status === "PURCHASED") entry.purchased += row._count;
  }
  return history;
}

/**
 * Une ligne « à surveiller » : en rupture, ou sous le seuil d'alerte.
 *
 * Deux écrans affichent ce compteur ; la règle est écrite ici pour qu'ils ne
 * puissent pas donner deux nombres différents de la même chose.
 */
export function needsAttention(line: { quantity: number; alertThreshold: number }): boolean {
  return line.quantity <= 0 || line.quantity <= line.alertThreshold;
}

export type StockOverviewCounts = {
  alerts: number;
  items: number;
  catalog: number | null;
  movements: number;
};

/** Les compteurs de la barre d'onglets du stock, pour l'écran qui ne les a pas déjà. */
export async function stockOverviewCounts(
  pharmacyId: string,
  includeCatalog: boolean,
): Promise<StockOverviewCounts> {
  const [lines, movements, catalog] = await Promise.all([
    prisma.stockItem.findMany({
      where: { pharmacyId, product: { deletedAt: null, isActive: true } },
      select: { quantity: true, alertThreshold: true },
    }),
    prisma.stockMovement.count({ where: { pharmacyId } }),
    includeCatalog
      ? prisma.product.count({ where: { pharmacyId, deletedAt: null } })
      : Promise.resolve(null),
  ]);

  return {
    alerts: lines.filter(needsAttention).length,
    items: lines.length,
    catalog,
    movements,
  };
}

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function stockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= threshold) return "LOW_STOCK";
  return "IN_STOCK";
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "En stock",
  LOW_STOCK: "Stock faible",
  OUT_OF_STOCK: "Rupture",
};

export { PRODUCT_CATEGORY_LABELS };

/**
 * Applique un mouvement de stock et met à jour la quantité, dans une seule
 * transaction : la quantité et son historique ne peuvent pas diverger.
 */
export async function applyStockMovement(params: {
  scope: TenantScope;
  productId: string;
  quantityDelta: number;
  type: "PURCHASE" | "SALE" | "ADJUSTMENT" | "LOSS" | "RETURN" | "INVENTORY" | "IMPORT";
  reason?: string | null;
  saleId?: string | null;
}): Promise<{ quantityAfter: number }> {
  return prisma.$transaction(async (tx) => {
    const stockItem = await tx.stockItem.findUnique({
      where: { productId: params.productId },
    });

    const product = await tx.product.findUnique({
      where: { id: params.productId },
      select: { pharmacyId: true },
    });
    if (!product || product.pharmacyId !== params.scope.pharmacyId) {
      throw new Error("Produit introuvable dans cette officine.");
    }

    const current = stockItem?.quantity ?? 0;
    const quantityAfter =
      params.type === "INVENTORY"
        ? params.quantityDelta
        : Math.max(0, current + params.quantityDelta);

    if (stockItem) {
      await tx.stockItem.update({
        where: { id: stockItem.id },
        data: {
          quantity: quantityAfter,
          lastCountedAt: params.type === "INVENTORY" ? new Date() : undefined,
        },
      });
    } else {
      await tx.stockItem.create({
        data: {
          pharmacyId: params.scope.pharmacyId,
          productId: params.productId,
          quantity: quantityAfter,
        },
      });
    }

    await tx.stockMovement.create({
      data: {
        pharmacyId: params.scope.pharmacyId,
        productId: params.productId,
        type: params.type,
        quantityDelta:
          params.type === "INVENTORY" ? quantityAfter - current : params.quantityDelta,
        quantityAfter,
        reason: params.reason ?? null,
        userId: params.scope.userId,
        saleId: params.saleId ?? null,
      },
    });

    return { quantityAfter };
  });
}
