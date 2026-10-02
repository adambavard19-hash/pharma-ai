import "server-only";
import { prisma } from "@/server/db/client";
import { estimateCommission, type CommissionEstimate } from "@/core/partners/commission";
import type { ContractType, PublicationStatus } from "@/core/partners/status";
import { brandReach, reachPharmacies, REACH_SELECT } from "./brands";

/**
 * Statistiques PharmaBoost Partenaires : des agrégats, jamais une ligne
 * nominative ni une donnée patient. Diffusion (où la marque est visible,
 * masquée, refusée), ouvertures attribuées, leads, commandes et montants.
 *
 * Les officines de démonstration sont exclues de tous les chiffres. Les
 * commandes annulées ou en échec ne comptent pas. L'estimation de commission
 * est INDICATIVE : rien n'est facturé à partir de ces écrans.
 */

export type StatsPeriod = "30j" | "90j" | "12m" | "tout";

export const STATS_PERIODS: { key: StatsPeriod; label: string; days: number | null }[] = [
  { key: "30j", label: "30 derniers jours", days: 30 },
  { key: "90j", label: "90 derniers jours", days: 90 },
  { key: "12m", label: "12 derniers mois", days: 365 },
  { key: "tout", label: "Depuis le début", days: null },
];

export function isStatsPeriod(value: string | undefined | null): value is StatsPeriod {
  return STATS_PERIODS.some((period) => period.key === value);
}

export type Activity = {
  viewsCounter: number;
  viewsCatalog: number;
  viewsBrandPage: number;
  leads: number;
  orders: number;
  /** Commandes dont le montant n'est pas connu (prix non renseignés) : comptées, non additionnées. */
  ordersWithoutAmount: number;
  units: number;
  amountCents: number;
};

export type ReachTotals = { visible: number; hidden: number; refused: number };

export type BrandStats = {
  id: string;
  name: string;
  status: PublicationStatus;
  partnerId: string;
  partnerName: string;
  reach: ReachTotals;
  activity: Activity;
};

export type ContractEstimateRow = {
  id: string;
  type: ContractType;
  startsAt: string | null;
  endsAt: string | null;
  volume: { orders: number; units: number; amountCents: number };
  estimate: CommissionEstimate;
};

export type PartnerStats = {
  id: string;
  name: string;
  status: PublicationStatus;
  brands: number;
  reach: ReachTotals;
  activity: Activity;
  contracts: ContractEstimateRow[];
};

export type PartnerStatistics = {
  since: string | null;
  realPharmacies: number;
  /** Officines qui voient au moins une marque partenaire. */
  reachedPharmacies: number;
  totals: Activity;
  partners: PartnerStats[];
  brands: BrandStats[];
};

const emptyActivity = (): Activity => ({ viewsCounter: 0, viewsCatalog: 0, viewsBrandPage: 0, leads: 0, orders: 0, ordersWithoutAmount: 0, units: 0, amountCents: 0 });

function addActivity(target: Activity, source: Activity) {
  for (const key of Object.keys(target) as (keyof Activity)[]) target[key] += source[key];
}

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Les commandes qui comptent : ni annulées ni en échec, hors démonstration. */
const COUNTED_ORDER = { status: { notIn: ["CANCELLED", "FAILED"] as ("CANCELLED" | "FAILED")[] }, pharmacy: { isDemo: false } };

export async function partnerStatistics(period: StatsPeriod, now = new Date()): Promise<PartnerStatistics> {
  const days = STATS_PERIODS.find((entry) => entry.key === period)?.days ?? null;
  const since = days === null ? null : new Date(now.getTime() - days * 24 * 3600 * 1000);
  const createdAt = since ? { createdAt: { gte: since } } : {};

  const [partners, brands, pharmacies, views, leads, orders, contracts] = await Promise.all([
    prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
    prisma.partnerBrand.findMany({ orderBy: [{ partner: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, partnerId: true, ...REACH_SELECT } }),
    reachPharmacies(),
    prisma.partnerAttribution.groupBy({ by: ["partnerId", "brandId", "source"], where: { kind: "VIEW", pharmacy: { isDemo: false }, ...createdAt }, _count: { _all: true } }),
    prisma.partnerLead.groupBy({ by: ["partnerId", "brandId"], where: { pharmacy: { isDemo: false }, ...createdAt }, _count: { _all: true } }),
    // Toutes les commandes comptées, sans borne de période : les contrats ont leur propre période.
    prisma.partnerOrder.findMany({ where: COUNTED_ORDER, select: { partnerId: true, brandId: true, totalCents: true, createdAt: true, lines: { select: { quantity: true } } } }),
    prisma.partnerContract.findMany({
      where: { OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, partnerId: true, type: true, startsAt: true, endsAt: true, fixedAmountCents: true, commissionPercent: true, commissionPerUnitCents: true, minimumCents: true },
    }),
  ]);

  // Activité par marque (et « sans marque » au niveau du partenaire).
  const brandActivity = new Map<string, Activity>();
  const partnerActivity = new Map<string, Activity>();
  const bucket = (map: Map<string, Activity>, key: string) => {
    let activity = map.get(key);
    if (!activity) map.set(key, (activity = emptyActivity()));
    return activity;
  };
  const record = (partnerId: string, brandId: string | null, apply: (activity: Activity) => void) => {
    apply(bucket(partnerActivity, partnerId));
    if (brandId) apply(bucket(brandActivity, brandId));
  };

  for (const row of views) {
    const count = row._count._all;
    record(row.partnerId, row.brandId, (activity) => {
      if (row.source === "COUNTER_CARD") activity.viewsCounter += count;
      else if (row.source === "CATALOG") activity.viewsCatalog += count;
      else activity.viewsBrandPage += count;
    });
  }
  for (const row of leads) record(row.partnerId, row.brandId, (activity) => (activity.leads += row._count._all));

  const orderVolume = (order: (typeof orders)[number]) => ({ units: order.lines.reduce((sum, line) => sum + line.quantity, 0), amountCents: order.totalCents });
  for (const order of orders) {
    if (since && order.createdAt < since) continue;
    const { units, amountCents } = orderVolume(order);
    record(order.partnerId, order.brandId, (activity) => {
      activity.orders += 1;
      activity.units += units;
      if (amountCents === null) activity.ordersWithoutAmount += 1;
      else activity.amountCents += amountCents;
    });
  }

  // Diffusion : la règle des officines elles-mêmes, sur les vraies officines.
  const reachByBrand = new Map(brands.map((brand) => [brand.id, brandReach(brand, pharmacies)]));
  const reached = new Set<string>();
  for (const reach of reachByBrand.values()) for (const id of reach.catalogIds) reached.add(id);

  const brandStats: BrandStats[] = brands.map((brand) => {
    const reach = reachByBrand.get(brand.id)!;
    return {
      id: brand.id,
      name: brand.name,
      status: brand.status,
      partnerId: brand.partnerId,
      partnerName: brand.partner.name,
      reach: { visible: reach.catalogIds.length, hidden: reach.hiddenIds.length, refused: reach.refusedIds.length },
      activity: brandActivity.get(brand.id) ?? emptyActivity(),
    };
  });

  const partnerStats: PartnerStats[] = partners.map((partner) => {
    const own = brands.filter((brand) => brand.partnerId === partner.id);
    const union = { visible: new Set<string>(), hidden: new Set<string>(), refused: new Set<string>() };
    for (const brand of own) {
      const reach = reachByBrand.get(brand.id)!;
      reach.catalogIds.forEach((id) => union.visible.add(id));
      reach.hiddenIds.forEach((id) => union.hidden.add(id));
      reach.refusedIds.forEach((id) => union.refused.add(id));
    }
    const partnerContracts = contracts
      .filter((contract) => contract.partnerId === partner.id)
      .map((contract) => {
        // Le volume du contrat : ses commandes depuis son début, jusqu'à aujourd'hui.
        const counted = orders.filter((order) => order.partnerId === partner.id && (!contract.startsAt || order.createdAt >= contract.startsAt) && order.createdAt <= now);
        const volume = counted.reduce(
          (sum, order) => {
            const { units, amountCents } = orderVolume(order);
            return { orders: sum.orders + 1, units: sum.units + units, amountCents: sum.amountCents + (amountCents ?? 0) };
          },
          { orders: 0, units: 0, amountCents: 0 },
        );
        const estimate = estimateCommission(
          {
            type: contract.type,
            fixedAmountCents: contract.fixedAmountCents,
            commissionPercent: decimalToNumber(contract.commissionPercent),
            commissionPerUnitCents: contract.commissionPerUnitCents,
            minimumCents: contract.minimumCents,
          },
          { amountCents: volume.amountCents, units: volume.units },
        );
        return { id: contract.id, type: contract.type, startsAt: contract.startsAt?.toISOString() ?? null, endsAt: contract.endsAt?.toISOString() ?? null, volume, estimate };
      });
    return {
      id: partner.id,
      name: partner.name,
      status: partner.status,
      brands: own.length,
      reach: { visible: union.visible.size, hidden: union.hidden.size, refused: union.refused.size },
      activity: partnerActivity.get(partner.id) ?? emptyActivity(),
      contracts: partnerContracts,
    };
  });

  const totals = emptyActivity();
  for (const partner of partnerStats) addActivity(totals, partner.activity);

  return {
    since: since?.toISOString() ?? null,
    realPharmacies: pharmacies.length,
    reachedPharmacies: reached.size,
    totals,
    partners: partnerStats,
    brands: brandStats,
  };
}
