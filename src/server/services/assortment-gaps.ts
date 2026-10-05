import "server-only";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import { partnerCatalog, type PartnerScope } from "@/server/services/partners/pharmacy-partners";
import { brandKey, brandLabelOf } from "@/core/catalog/brand";
import { summarizeGaps, universesForCategory, type AssortmentSummary, type GapGroup } from "@/core/assortment/gaps";

/**
 * « Votre assortiment » : ce que le stock de l'officine n'a pas couvert, et ce qui
 * existe chez les laboratoires partenaires de PharmaBoost.
 *
 * Lu sur la DERNIÈRE analyse de chaque ordonnance de la période (une ordonnance
 * réanalysée ne compte qu'une fois). Réservé au titulaire : la page vérifie la
 * permission, ce service ne lit que l'officine de la session.
 *
 * Les suggestions viennent du catalogue partenaire VISIBLE pour l'officine (statut,
 * audience, choix de l'officine : `partnerCatalog`), jamais d'une liste libre, et
 * seulement les marques que l'officine ne référence pas encore. Elles ne passent
 * jamais par le moteur de conseil.
 */
export type MarketBrand = { id: string; slug: string; name: string; partnerName: string; logoUrl: string | null };
export type GapView = GapGroup & { market: MarketBrand[] };
export type AssortmentView = Omit<AssortmentSummary, "groups"> & {
  days: number;
  since: Date;
  analysedPrescriptions: number;
  /** Combien d'analyses de la période ne portent pas encore l'information (analyses antérieures à cette fonction). */
  withoutCoverage: number;
  groups: GapView[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 20_000;
const MARKET_PER_GAP = 4;

export async function loadAssortment(scope: PartnerScope, days: number, now: Date = new Date()): Promise<AssortmentView> {
  const since = new Date(now.getTime() - days * DAY_MS);
  // La dernière analyse de chaque ordonnance de la période.
  const runs = await prisma.analysisRun.findMany({
    where: { pharmacyId: scope.pharmacyId, startedAt: { gte: since }, status: { in: ["COMPLETED", "PARTIAL"] }, ...activityScope() },
    orderBy: { startedAt: "desc" },
    distinct: ["prescriptionId"],
    select: { id: true },
  });
  const rows = runs.length
    ? await prisma.adviceOpportunity.findMany({
        where: { analysisRunId: { in: runs.map((run) => run.id) }, isBlocked: false },
        select: { analysisRunId: true, title: true, category: true, ruleKey: true, needKey: true, coverage: true, answer: true },
        take: MAX_ROWS,
      })
    : [];

  const summary = summarizeGaps(rows);
  const runsWithCoverage = new Set(rows.filter((row) => row.coverage !== null).map((row) => row.analysisRunId));
  const market = summary.groups.length > 0 ? await marketFor(scope, summary.groups) : new Map<string, MarketBrand[]>();

  return {
    ...summary,
    days,
    since,
    analysedPrescriptions: runs.length,
    withoutCoverage: runs.filter((run) => !runsWithCoverage.has(run.id)).length,
    groups: summary.groups.map((group) => ({ ...group, market: market.get(group.key) ?? [] })),
  };
}

/** Pour chaque manque, les marques partenaires visibles de l'univers qui y répond et que l'officine ne référence pas. */
async function marketFor(scope: PartnerScope, groups: GapGroup[]): Promise<Map<string, MarketBrand[]>> {
  const catalog = await partnerCatalog(scope);
  const brands = new Map(catalog.groups.flatMap((group) => group.brands.map((brand) => [brand.id, brand] as const)));
  const [partnerKeys, stock] = await Promise.all([
    brands.size ? prisma.partnerBrand.findMany({ where: { id: { in: [...brands.keys()] } }, select: { id: true, brandKey: true } }) : Promise.resolve([]),
    prisma.product.findMany({ where: { pharmacyId: scope.pharmacyId, isActive: true, deletedAt: null }, select: { name: true, brand: true } }),
  ]);
  const stocked = new Set(stock.map((product) => brandLabelOf(product.name, product.brand)).filter((label): label is string => Boolean(label)).map(brandKey));
  const keyById = new Map(partnerKeys.map((row) => [row.id, row.brandKey]));

  const byUniverse = new Map<string, MarketBrand[]>();
  for (const group of catalog.groups) {
    const list = group.brands
      .filter((brand) => !stocked.has(keyById.get(brand.id) ?? ""))
      .map((brand) => ({ id: brand.id, slug: brand.slug, name: brand.name, partnerName: brand.partnerName, logoUrl: brand.logoUrl }));
    byUniverse.set(group.key, list);
  }

  const result = new Map<string, MarketBrand[]>();
  for (const gap of groups) {
    const seen = new Set<string>();
    const list: MarketBrand[] = [];
    for (const universe of universesForCategory(gap.category)) {
      for (const brand of byUniverse.get(universe) ?? []) {
        if (seen.has(brand.id)) continue;
        seen.add(brand.id);
        list.push(brand);
      }
    }
    result.set(gap.key, list.slice(0, MARKET_PER_GAP));
  }
  return result;
}
