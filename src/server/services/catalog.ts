import "server-only";
import { prisma } from "@/server/db/client";
import { siblingPharmacyIds, type TenantScope } from "@/server/db/tenant";
import type { CatalogProduct, PharmacyRuleInput, ProductValidationHistory } from "@/core/ai/types";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { normalizeSearchText } from "@/core/reference/search";

/**
 * Borne du nombre de lignes de stock médicament confrontées aux règles de
 * conseil. Une officine peut en référencer des dizaines de milliers ; le
 * comptoir dispose de secondes.
 */
const NATIONAL_CANDIDATE_LIMIT = 300;

/** Borne de la résolution préalable des spécialités et substances concernées. */
const SPECIALTY_MATCH_LIMIT = 4000;

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
    origin: "PHARMACY_CATALOG" as const,
    presentationId: null,
    // Un produit de parapharmacie ne déclare ni substance ni condition de
    // délivrance : ces deux champs n'ont de sens que pour un médicament.
    substances: [],
    prescriptionConditions: [],
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

/**
 * Les médicaments de l'officine susceptibles d'être conseillés.
 *
 * Trois précautions, chacune imposée par une contrainte du produit.
 *
 * 1. **On ne part jamais du stock.** Cette fonction ne cherche pas « quoi
 *    vendre » : elle restreint le stock aux références qui pourraient répondre
 *    à l'une des règles de conseil existantes. C'est le besoin, détecté plus
 *    loin dans le pipeline, qui décidera si l'une d'elles est retenue — ou
 *    aucune.
 * 2. **On ne charge pas 20 000 lignes.** Une grosse officine peut référencer
 *    tout le catalogue national. La sélection est donc filtrée en base sur les
 *    termes des règles et bornée, pour tenir le budget de temps du comptoir.
 * 3. **Rien de soumis à prescription.** Le filtre est appliqué ici ET dans le
 *    moteur de sécurité : une règle de cette importance mérite deux verrous.
 */
export async function loadNationalDrugCandidates(
  scope: TenantScope,
): Promise<CatalogProduct[]> {
  const terms = [
    ...new Set(ADVICE_RULES.flatMap((rule) => rule.matchingTags).map(normalizeSearchText)),
  ].filter((term) => term.length >= 4);

  if (terms.length === 0) return [];

  // Les spécialités concernées sont résolues AVANT d'interroger le stock.
  // Mesuré : la même recherche exprimée en branches `OR` traversant la
  // jointure stock → présentation → spécialité coûte 474 ms, contre 58 ms en
  // deux passes indexées. Au comptoir, c'est un demi-battement de cœur gagné
  // sur chaque analyse.
  const [byName, substances] = await Promise.all([
    prisma.drugSpecialty.findMany({
      where: { withdrawnAt: null, OR: terms.map((term) => ({ searchName: { contains: term } })) },
      select: { id: true },
      take: SPECIALTY_MATCH_LIMIT,
    }),
    prisma.drugSubstance.findMany({
      where: { OR: terms.map((term) => ({ searchLabel: { contains: term } })) },
      select: { id: true },
      take: SPECIALTY_MATCH_LIMIT,
    }),
  ]);

  const bySubstance =
    substances.length > 0
      ? await prisma.drugComposition.findMany({
          where: { substanceId: { in: substances.map((substance) => substance.id) } },
          select: { specialtyId: true },
          distinct: ["specialtyId"],
          take: SPECIALTY_MATCH_LIMIT,
        })
      : [];

  const specialtyIds = [
    ...new Set([
      ...byName.map((specialty) => specialty.id),
      ...bySubstance.map((composition) => composition.specialtyId),
    ]),
  ];

  if (specialtyIds.length === 0) return [];

  const lines = await prisma.pharmacyDrugStock.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      // Une boîte à zéro n'est pas candidate : Pharma.ai ne conseille pas ce
      // qu'il ne peut pas délivrer aujourd'hui.
      quantity: { gt: 0 },
      presentation: { withdrawnAt: null, specialtyId: { in: specialtyIds } },
    },
    select: {
      quantity: true,
      alertThreshold: true,
      presentation: {
        select: {
          id: true,
          cip13: true,
          label: true,
          priceCents: true,
          specialty: {
            select: {
              name: true,
              pharmaceuticalForm: true,
              compositions: { where: { nature: "SA" }, select: { substanceLabel: true } },
              prescriptionConditions: { select: { label: true } },
            },
          },
        },
      },
    },
    take: NATIONAL_CANDIDATE_LIMIT,
  });

  return lines
    .filter((line) => line.presentation.specialty.prescriptionConditions.length === 0)
    .map((line) => {
      const { presentation } = line;
      const substances = [
        ...new Set(presentation.specialty.compositions.map((c) => c.substanceLabel)),
      ];
      return {
        id: `presentation:${presentation.id}`,
        origin: "NATIONAL_DRUG" as const,
        presentationId: presentation.id,
        substances,
        prescriptionConditions: [],
        name: presentation.specialty.name,
        brand: null,
        // Le catalogue national ne classe pas les médicaments dans les
        // catégories de l'officine. L'appariement se fera donc uniquement sur
        // les termes, jamais sur une catégorie devinée.
        category: "AUTRE" as const,
        subCategory: presentation.specialty.pharmaceuticalForm,
        reference: presentation.cip13,
        ean: presentation.cip13,
        imageUrl: null,
        description: presentation.label,
        // Aucune allégation commerciale : la source n'en publie pas, et en
        // inventer une serait exactement ce que le produit s'interdit.
        commercialClaims: [],
        precautions: [],
        matchingTags: [...substances, presentation.specialty.name],
        contraindications: [],
        salePriceCents: presentation.priceCents ?? 0,
        // Prix d'achat inconnu : la dimension commerciale restera neutre.
        purchasePriceCents: 0,
        vatRate: 0,
        stockQuantity: line.quantity,
        alertThreshold: line.alertThreshold,
        availableInSiblingPharmacy: false,
        isActive: true,
      };
    });
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
