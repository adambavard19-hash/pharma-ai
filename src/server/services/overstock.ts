import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { parisDayKey } from "@/core/sales/board";
import { belongsToFamily, familyKey } from "@/core/associations/families";
import { atcKey } from "@/core/ai/engines/associations";
import type { OverstockInput } from "@/core/ai/engines/overstock";
import type { CatalogProduct } from "@/core/ai/types";
import { campaignDraftError, campaignEnd, tiedUpCents, type CampaignDraft } from "@/core/overstock/campaign";
import type { TenantScope } from "@/server/db/tenant";
import { loadTriggerFamilies, resolveLineTriggers, type LineForAssociations } from "./product-associations";

/**
 * Les campagnes de surstock (fondateur, 25 oct. 2026) : ce que le moteur en reçoit à chaque vente, et l'écran « Surstock ».
 * Voir `core/ai/engines/overstock.ts` pour ce que le moteur en fait.
 */

const dayKey = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Les campagnes arrivées au bout s'arrêtent d'elles-mêmes : stock à l'objectif, ou date de fin passée. Rejouable ; une
 * campagne arrêtée ne se relance jamais seule.
 */
async function closeFinishedCampaigns(pharmacyId: string, now: Date): Promise<void> {
  const active = await prisma.overstockCampaign.findMany({
    where: { pharmacyId, isActive: true },
    select: { id: true, targetQuantity: true, endsOn: true, product: { select: { deletedAt: true, stockItem: { select: { quantity: true } } } } },
  });
  const today = parisDayKey(now);
  for (const campaign of active) {
    const end = campaign.product.deletedAt ? "DATE" : campaignEnd({ targetQuantity: campaign.targetQuantity, endsOn: dayKey(campaign.endsOn) }, campaign.product.stockItem?.quantity ?? 0, today);
    if (!end) continue;
    await prisma.overstockCampaign.updateMany({ where: { id: campaign.id, isActive: true }, data: { isActive: false, endedAt: now, endedReason: end } });
  }
}

/** Ce que le moteur reçoit : les campagnes en cours et ce que chaque ligne de la vente est. `undefined` s'il n'y en a aucune. */
export async function loadOverstockInput(scope: TenantScope, lines: LineForAssociations[], catalog: CatalogProduct[], now: Date = new Date()): Promise<OverstockInput | undefined> {
  const any = await prisma.overstockCampaign.count({ where: { pharmacyId: scope.pharmacyId, isActive: true } });
  if (any === 0) return undefined;
  await closeFinishedCampaigns(scope.pharmacyId, now);
  const rows = await prisma.overstockCampaign.findMany({
    where: { pharmacyId: scope.pharmacyId, isActive: true, product: { deletedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, productId: true, triggerAtcCodes: true, familyIds: true, sentence: true },
  });
  if (rows.length === 0) return undefined;
  const families = await loadTriggerFamilies([...new Set(rows.flatMap((row) => row.familyIds))]);
  const familyById = new Map(families.map((family) => [family.id, family]));
  // Les produits du catalogue de chaque famille : conseillés par PharmaBoost, ils cèdent la place au produit en surstock.
  const membersOf = new Map<string, Set<string>>();
  for (const family of families) {
    membersOf.set(family.id, new Set(catalog.filter((product) => belongsToFamily(family, { labels: [product.name], keys: product.ean ? [`ean:${product.ean}`] : [] })).map((product) => product.id)));
  }
  const campaigns = rows.map((row) => {
    const liveFamilies = row.familyIds.filter((id) => familyById.has(id));
    return {
      id: row.id,
      productId: row.productId,
      triggerKeys: [...row.triggerAtcCodes.map(atcKey), ...liveFamilies.map(familyKey)],
      replaceProductIds: new Set(liveFamilies.flatMap((id) => [...(membersOf.get(id) ?? [])])),
      sentence: row.sentence,
    };
  });
  const atcKeys = new Set(campaigns.flatMap((campaign) => campaign.triggerKeys.filter((key) => key.startsWith("atc:"))));
  return { campaigns, lines: await resolveLineTriggers(scope.pharmacyId, lines, { productIds: [], drugKeys: new Set(), families, atcKeys }) };
}

// ---------------------------------------------------------------------------------------------------------------
// L'écran « Surstock »
// ---------------------------------------------------------------------------------------------------------------

export type OverstockProduct = { id: string; name: string; brand: string | null; quantity: number; purchasePriceCents: number | null; salePriceCents: number | null; tiedUpCents: number | null };

export type CampaignView = {
  id: string;
  product: OverstockProduct;
  classes: string[];
  families: { id: string; name: string }[];
  sentence: string | null;
  startQuantity: number;
  targetQuantity: number;
  endsOn: string | null;
  isActive: boolean;
  endedReason: string | null;
  createdAt: Date;
  /** Conseils de ce produit vendus au comptoir depuis le lancement (déclarés « Vendu » ou bipés). */
  soldByAdvice: number;
};

export type OverstockScreen = {
  campaigns: CampaignView[];
  /** Les produits qui immobilisent le plus d'argent en rayon, hors campagne : des pistes, pas une décision. */
  suggestions: OverstockProduct[];
  families: { id: string; name: string }[];
};

const productSelect = { id: true, name: true, brand: true, purchasePriceCents: true, salePriceCents: true, stockItem: { select: { quantity: true } } } as const;

const productOf = (row: { id: string; name: string; brand: string | null; purchasePriceCents: number | null; salePriceCents: number | null; stockItem: { quantity: number } | null }): OverstockProduct => {
  const quantity = row.stockItem?.quantity ?? 0;
  return { id: row.id, name: row.name, brand: row.brand, quantity, purchasePriceCents: row.purchasePriceCents, salePriceCents: row.salePriceCents, tiedUpCents: tiedUpCents(quantity, row.purchasePriceCents) };
};

export async function loadOverstockScreen(scope: TenantScope, now: Date = new Date()): Promise<OverstockScreen> {
  await closeFinishedCampaigns(scope.pharmacyId, now);
  const [rows, families] = await Promise.all([
    prisma.overstockCampaign.findMany({
      where: { pharmacyId: scope.pharmacyId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: { id: true, triggerAtcCodes: true, familyIds: true, sentence: true, startQuantity: true, targetQuantity: true, endsOn: true, isActive: true, endedReason: true, createdAt: true, product: { select: productSelect } },
    }),
    prisma.triggerFamily.findMany({ where: { status: { not: "REMOVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const familyName = new Map(families.map((family) => [family.id, family.name]));
  const sold = await Promise.all(
    rows.map((row) =>
      prisma.recommendation.count({ where: { pharmacyId: scope.pharmacyId, productId: row.product.id, status: "PURCHASED", createdAt: { gte: row.createdAt } } }),
    ),
  );
  const campaigns: CampaignView[] = rows.map((row, index) => ({
    id: row.id,
    product: productOf(row.product),
    classes: row.triggerAtcCodes,
    families: row.familyIds.flatMap((id) => (familyName.has(id) ? [{ id, name: familyName.get(id) as string }] : [])),
    sentence: row.sentence,
    startQuantity: row.startQuantity,
    targetQuantity: row.targetQuantity,
    endsOn: dayKey(row.endsOn),
    isActive: row.isActive,
    endedReason: row.endedReason,
    createdAt: row.createdAt,
    soldByAdvice: sold[index],
  }));

  const inCampaign = new Set(campaigns.filter((campaign) => campaign.isActive).map((campaign) => campaign.product.id));
  // Les produits conseil (hors médicaments) qui pèsent le plus en rayon : stock × prix d'achat.
  const stocked = await prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true, purchasePriceCents: { gt: 0 }, stockItem: { quantity: { gt: 5 } } },
    select: productSelect,
    take: 2000,
  });
  const suggestions = stocked
    .map(productOf)
    .filter((product) => !inCampaign.has(product.id) && product.tiedUpCents !== null)
    .sort((a, b) => (b.tiedUpCents ?? 0) - (a.tiedUpCents ?? 0))
    .slice(0, 8);
  return { campaigns, suggestions, families };
}

/** La recherche d'un produit du stock à mettre en campagne : en stock seulement. */
export async function searchOverstockProducts(scope: TenantScope, query: string): Promise<OverstockProduct[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true, stockItem: { quantity: { gt: 0 } }, AND: words.map((word) => ({ OR: [{ name: { contains: word, mode: "insensitive" as const } }, { brand: { contains: word, mode: "insensitive" as const } }, { ean: word }] })) },
    select: productSelect,
    orderBy: { name: "asc" },
    take: 12,
  });
  return rows.map(productOf);
}

export async function createOverstockCampaign(scope: TenantScope, draft: CampaignDraft, now: Date = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const clean: CampaignDraft = { ...draft, atcCodes: [...new Set(draft.atcCodes)], familyIds: [...new Set(draft.familyIds)], sentence: draft.sentence.replace(/\s+/g, " ").trim() };
  const error = campaignDraftError(clean, parisDayKey(now));
  if (error) return { ok: false, error };
  const [product, families, running] = await Promise.all([
    prisma.product.findFirst({ where: { id: clean.productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true, stockItem: { select: { quantity: true } } } }),
    clean.familyIds.length ? prisma.triggerFamily.count({ where: { id: { in: clean.familyIds }, status: { not: "REMOVED" } } }) : Promise.resolve(0),
    prisma.overstockCampaign.findFirst({ where: { pharmacyId: scope.pharmacyId, productId: clean.productId, isActive: true }, select: { id: true } }),
  ]);
  if (!product) return { ok: false, error: "Produit introuvable dans votre stock." };
  if (families !== clean.familyIds.length) return { ok: false, error: "Une des familles choisies n'existe plus." };
  if (running) return { ok: false, error: "Ce produit est déjà en campagne." };
  const quantity = product.stockItem?.quantity ?? 0;
  if (quantity <= clean.targetQuantity) return { ok: false, error: `Le stock (${quantity}) est déjà à l'objectif : rien à écouler.` };
  const created = await prisma.overstockCampaign.create({
    data: {
      pharmacyId: scope.pharmacyId,
      productId: product.id,
      triggerAtcCodes: clean.atcCodes,
      familyIds: clean.familyIds,
      sentence: clean.sentence || null,
      startQuantity: quantity,
      targetQuantity: clean.targetQuantity,
      endsOn: clean.endsOn ? new Date(`${clean.endsOn}T00:00:00Z`) : null,
      createdByUserId: scope.userId,
    },
    select: { id: true },
  });
  await recordAudit({ action: "overstock.campaign_created", entityType: "OverstockCampaign", entityId: created.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { product: product.name, stock: quantity, target: clean.targetQuantity, classes: clean.atcCodes, families: clean.familyIds.length } });
  return { ok: true, id: created.id };
}

/** « Arrêter » : la campagne s'arrête tout de suite ; elle reste dans l'historique. */
export async function stopOverstockCampaign(scope: TenantScope, id: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await prisma.overstockCampaign.updateMany({ where: { id, pharmacyId: scope.pharmacyId, isActive: true }, data: { isActive: false, endedAt: now, endedReason: "MANUEL" } });
  if (result.count === 0) return { ok: false, error: "Campagne introuvable ou déjà arrêtée." };
  await recordAudit({ action: "overstock.campaign_stopped", entityType: "OverstockCampaign", entityId: id, pharmacyId: scope.pharmacyId, userId: scope.userId });
  return { ok: true };
}

/** Les produits en campagne en ce moment : la bannière les signale « Surstock » et les met en tête. */
export async function activeOverstockProductIds(pharmacyId: string): Promise<Set<string>> {
  const rows = await prisma.overstockCampaign.findMany({ where: { pharmacyId, isActive: true }, select: { productId: true } });
  return new Set(rows.map((row) => row.productId));
}
