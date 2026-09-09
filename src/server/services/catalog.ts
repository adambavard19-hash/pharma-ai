import "server-only";
import { prisma } from "@/server/db/client";
import { siblingPharmacyIds, type TenantScope } from "@/server/db/tenant";
import type { CatalogProduct, PharmacyRuleInput, ProductValidationHistory } from "@/core/ai/types";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { normalizeSearchText } from "@/core/reference/search";
import { classifyNationalDrug } from "@/core/catalog/product-vocabulary";

/**
 * Le stock est-il configuré ? Vrai dès qu'une référence existe — produit ou
 * médicament, en rayon ou à zéro. C'est ce qui distingue « rien ne correspond »
 * de « rien n'a jamais été importé ».
 */
export async function loadStockState(scope: TenantScope): Promise<{ configured: boolean; referenceCount: number }> {
  const [products, drugs] = await Promise.all([
    prisma.product.count({ where: { pharmacyId: scope.pharmacyId, deletedAt: null } }),
    prisma.pharmacyDrugStock.count({ where: { pharmacyId: scope.pharmacyId } }),
  ]);
  return { configured: products + drugs > 0, referenceCount: products + drugs };
}

/**
 * Borne du nombre de lignes de stock médicament confrontées aux règles de
 * conseil. Une officine peut en référencer des dizaines de milliers ; le
 * comptoir dispose de secondes.
 */
const NATIONAL_CANDIDATE_LIMIT = 300;

/** Nombre de lignes de stock médicament lues pour y chercher des candidats. */
const DRUG_STOCK_SCAN_LIMIT = 2000;

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
 *    tout le catalogue national. La lecture est bornée (boîtes en rayon
 *    d'abord) et seules les boîtes que le dictionnaire d'usage ou les mots des
 *    règles relient à un conseil deviennent candidates.
 * 3. **Rien de soumis à prescription.** Le filtre est appliqué ici ET dans le
 *    moteur de sécurité : une règle de cette importance mérite deux verrous.
 */
export async function loadNationalDrugCandidates(
  scope: TenantScope,
): Promise<CatalogProduct[]> {
  // Le stock médicament de l'officine est lu tel quel, boîtes en rayon
  // d'abord, et c'est le dictionnaire d'usage qui dit lesquelles peuvent
  // répondre à une règle de conseil. On ne présélectionne plus sur les mots
  // des règles : « ULTRA-LEVURE » ne contient pas « probiotique », et c'était
  // précisément ce qui empêchait un médicament conseil d'être proposé.
  const lines = await prisma.pharmacyDrugStock.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      presentation: { withdrawnAt: null },
    },
    select: {
      quantity: true,
      alertThreshold: true,
      priceCents: true,
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
              administrationRoutes: true,
              compositions: { where: { nature: "SA" }, select: { substanceLabel: true } },
              prescriptionConditions: { select: { label: true } },
            },
          },
        },
      },
    },
    // Les boîtes en rayon d'abord ; celles à zéro restent chargées pour que le
    // moteur puisse dire « adapté mais en rupture » — jamais les proposer.
    orderBy: { quantity: "desc" },
    take: DRUG_STOCK_SCAN_LIMIT,
  });

  const terms = [
    ...new Set(ADVICE_RULES.flatMap((rule) => rule.matchingTags).map(normalizeSearchText)),
  ].filter((term) => term.length >= 4);

  const candidates: CatalogProduct[] = [];
  for (const line of lines) {
    if (line.presentation.specialty.prescriptionConditions.length > 0) continue;
    const { presentation } = line;
    const substances = [...new Set(presentation.specialty.compositions.map((c) => c.substanceLabel))];
    // Le catalogue national ne classe pas les médicaments dans les catégories
    // de l'officine : c'est le dictionnaire d'usage (substances, forme, voie,
    // nom) qui le fait, avec le même vocabulaire fermé que pour les produits.
    const understood = classifyNationalDrug({
      name: presentation.specialty.name,
      substances,
      form: presentation.specialty.pharmaceuticalForm,
      routes: presentation.specialty.administrationRoutes,
      label: presentation.label,
    });
    const haystack = normalizeSearchText([presentation.specialty.name, ...substances].join(" "));
    const termHit = terms.some((term) => haystack.includes(term));
    // Une boîte que ni le dictionnaire ni les mots des règles ne relient à un
    // conseil n'est pas candidate : elle n'encombre pas le moteur.
    if (!understood?.tags.length && !termHit) continue;
    candidates.push({
        id: `presentation:${presentation.id}`,
        origin: "NATIONAL_DRUG" as const,
        presentationId: presentation.id,
        substances,
        prescriptionConditions: [],
        name: presentation.specialty.name,
        brand: null,
        category: understood?.category ?? ("AUTRE" as const),
        subCategory: presentation.specialty.pharmaceuticalForm,
        reference: presentation.cip13,
        ean: presentation.cip13,
        imageUrl: null,
        description: presentation.label,
        // Aucune allégation commerciale : la source n'en publie pas, et en
        // inventer une serait exactement ce que le produit s'interdit.
        commercialClaims: [],
        precautions: [],
        matchingTags: [...(understood?.tags ?? []), ...substances, presentation.specialty.name],
        contraindications: [],
        // Le prix de l'officine prime sur le prix public quand elle l'a fixé.
        salePriceCents: line.priceCents ?? presentation.priceCents ?? 0,
        // Prix d'achat inconnu : la dimension commerciale restera neutre.
        purchasePriceCents: 0,
        vatRate: 0,
        stockQuantity: line.quantity,
        alertThreshold: line.alertThreshold,
        availableInSiblingPharmacy: false,
        isActive: true,
      });
    if (candidates.length >= NATIONAL_CANDIDATE_LIMIT) break;
  }
  return candidates;
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
  // Une vente ne décompte un produit qu'une seule fois. Double clic,
  // rafraîchissement, deux collaborateurs : si le mouvement de cette vente
  // pour ce produit existe déjà, on rend l'état courant sans rien réécrire.
  if (params.saleId) {
    const existing = await prisma.stockMovement.findUnique({
      where: { saleId_productId: { saleId: params.saleId, productId: params.productId } },
      select: { quantityAfter: true },
    });
    if (existing) return { quantityAfter: existing.quantityAfter };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: params.productId },
        select: { pharmacyId: true },
      });
      if (!product || product.pharmacyId !== params.scope.pharmacyId) {
        throw new Error("Produit introuvable dans cette officine.");
      }

      // La ligne de stock existe toujours avant le calcul : la mise à jour
      // atomique ci-dessous ne peut pas se faire sur une ligne absente.
      const item = await tx.stockItem.upsert({
        where: { productId: params.productId },
        create: { pharmacyId: params.scope.pharmacyId, productId: params.productId, quantity: 0 },
        update: {},
        select: { id: true, quantity: true },
      });

      // Le calcul se fait dans la base, pas en mémoire : deux ventes
      // simultanées lisent et écrivent la même ligne sans se marcher dessus.
      const [updated] =
        params.type === "INVENTORY"
          ? await tx.$queryRaw<{ quantity: number }[]>`
              UPDATE "stock_items" SET "quantity" = ${params.quantityDelta}, "lastCountedAt" = NOW(), "updatedAt" = NOW()
              WHERE "id" = ${item.id} RETURNING "quantity"`
          : await tx.$queryRaw<{ quantity: number }[]>`
              UPDATE "stock_items" SET "quantity" = GREATEST(0, "quantity" + ${params.quantityDelta}), "updatedAt" = NOW()
              WHERE "id" = ${item.id} RETURNING "quantity"`;
      const quantityAfter = updated.quantity;

      await tx.stockMovement.create({
        data: {
          pharmacyId: params.scope.pharmacyId,
          productId: params.productId,
          type: params.type,
          quantityDelta: params.type === "INVENTORY" ? quantityAfter - item.quantity : params.quantityDelta,
          quantityAfter,
          reason: params.reason ?? null,
          userId: params.scope.userId,
          saleId: params.saleId ?? null,
        },
      });

      return { quantityAfter };
    });
  } catch (error) {
    // Course perdue : un autre appel a enregistré ce même mouvement de vente
    // entre notre vérification et notre écriture. La contrainte d'unicité a
    // annulé la transaction — la quantité n'a donc PAS été décomptée deux
    // fois. On rend l'état écrit par l'autre.
    if (params.saleId && isUniqueViolation(error)) {
      const existing = await prisma.stockMovement.findUnique({
        where: { saleId_productId: { saleId: params.saleId, productId: params.productId } },
        select: { quantityAfter: true },
      });
      if (existing) return { quantityAfter: existing.quantityAfter };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
