import "server-only";
import { activityScope } from "@/server/db/demo-scope";
import { prisma } from "@/server/db/client";
import { dayRange, type PeriodRange } from "@/core/analytics/periods";
import { percentChange } from "@/lib/utils";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Calcul des indicateurs.
 *
 * ATTRIBUTION DU CHIFFRE D'AFFAIRES PHARMA.AI — définition retenue :
 * une ligne de vente est attribuée à Pharma.ai si et seulement si elle est
 * rattachée à une `Recommendation`. La colonne `Sale.attributedCents` est
 * calculée à l'enregistrement de la vente à partir de ces lignes ; on ne
 * « déduit » jamais une attribution a posteriori. Les conseils ajoutés
 * manuellement par le pharmacien depuis l'écran de validation comptent comme
 * assistés par l'outil (`origin = MANUAL`) et sont distingués des propositions
 * du moteur (`origin = AI`) dans le détail.
 */

export type RevenueSummary = {
  totalCents: number;
  attributedCents: number;
  attributedMarginCents: number;
  salesCount: number;
  attributedSalesCount: number;
  /** Variation du CA additionnel vs période précédente, en points de %. */
  attributedDelta: number | null;
  totalDelta: number | null;
};

export async function getRevenueSummary(
  scope: TenantScope,
  period: PeriodRange,
): Promise<RevenueSummary> {
  const [current, previous, attributedCount] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        createdAt: { gte: period.start, lte: period.end },
      },
      _sum: {
        totalCents: true,
        attributedCents: true,
        attributedMarginCents: true,
      },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        createdAt: { gte: period.previousStart, lt: period.previousEnd },
      },
      _sum: { totalCents: true, attributedCents: true },
    }),
    prisma.sale.count({
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        createdAt: { gte: period.start, lte: period.end },
        attributedCents: { gt: 0 },
      },
    }),
  ]);

  return {
    totalCents: current._sum.totalCents ?? 0,
    attributedCents: current._sum.attributedCents ?? 0,
    attributedMarginCents: current._sum.attributedMarginCents ?? 0,
    salesCount: current._count,
    attributedSalesCount: attributedCount,
    attributedDelta: percentChange(
      current._sum.attributedCents ?? 0,
      previous._sum.attributedCents ?? 0,
    ),
    totalDelta: percentChange(
      current._sum.totalCents ?? 0,
      previous._sum.totalCents ?? 0,
    ),
  };
}

export type RecommendationFunnel = {
  generated: number;
  aiGenerated: number;
  manuallyAdded: number;
  accepted: number;
  presented: number;
  purchased: number;
  declined: number;
  removed: number;
  /** accepté / proposé */
  acceptanceRate: number;
  /** acheté / présenté */
  conversionRate: number;
  /** acheté / proposé */
  endToEndRate: number;
};

export async function getRecommendationFunnel(
  scope: TenantScope,
  period: PeriodRange,
): Promise<RecommendationFunnel> {
  const where = {
    pharmacyId: scope.pharmacyId,
    ...activityScope(),
    createdAt: { gte: period.start, lte: period.end },
  };

  const [byStatus, byOrigin] = await Promise.all([
    prisma.recommendation.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    prisma.recommendation.groupBy({
      by: ["origin"],
      where,
      _count: true,
    }),
  ]);

  const statusCount = (status: string) =>
    byStatus.find((row) => row.status === status)?._count ?? 0;
  const generated = byStatus.reduce((sum, row) => sum + row._count, 0);
  const aiGenerated = byOrigin.find((row) => row.origin === "AI")?._count ?? 0;
  const manuallyAdded = byOrigin.find((row) => row.origin === "MANUAL")?._count ?? 0;

  // Une recommandation acceptée puis présentée puis achetée a changé de statut :
  // on additionne donc les statuts « aval » pour reconstituer chaque étape.
  const purchased = statusCount("PURCHASED");
  const presented = statusCount("PRESENTED") + purchased + statusCount("DECLINED");
  const accepted =
    statusCount("ACCEPTED") + statusCount("MODIFIED") + statusCount("REPLACED") + presented;
  const declined = statusCount("DECLINED");
  const removed = statusCount("REMOVED");

  return {
    generated,
    aiGenerated,
    manuallyAdded,
    accepted,
    presented,
    purchased,
    declined,
    removed,
    acceptanceRate: generated > 0 ? accepted / generated : 0,
    conversionRate: presented > 0 ? purchased / presented : 0,
    endToEndRate: generated > 0 ? purchased / generated : 0,
  };
}

export type DailyPoint = { label: string; value: number; secondaryValue: number };

/** Série journalière : CA total et CA additionnel Pharma.ai. */
export async function getDailyRevenueSeries(
  scope: TenantScope,
  period: PeriodRange,
): Promise<DailyPoint[]> {
  const sales = await prisma.sale.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      ...activityScope(),
      createdAt: { gte: period.start, lte: period.end },
    },
    select: { createdAt: true, totalCents: true, attributedCents: true },
  });

  const buckets = new Map<string, { total: number; attributed: number }>();
  for (const day of dayRange(period.start, period.end)) {
    buckets.set(day.toISOString().slice(0, 10), { total: 0, attributed: 0 });
  }

  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += sale.totalCents;
    bucket.attributed += sale.attributedCents;
  }

  const formatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });

  return [...buckets.entries()].map(([iso, values]) => ({
    label: formatter.format(new Date(iso)),
    value: values.total,
    secondaryValue: values.attributed,
  }));
}

export type ProductPerformance = {
  productId: string;
  name: string;
  brand: string | null;
  category: string;
  proposed: number;
  accepted: number;
  purchased: number;
  revenueCents: number;
  marginCents: number;
};

export async function getProductPerformance(
  scope: TenantScope,
  period: PeriodRange,
  limit = 10,
): Promise<ProductPerformance[]> {
  const [recommendations, saleLines] = await Promise.all([
    prisma.recommendation.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        createdAt: { gte: period.start, lte: period.end },
        productId: { not: null },
      },
      select: {
        productId: true,
        status: true,
        product: { select: { name: true, brand: true, category: true } },
      },
    }),
    prisma.saleLine.findMany({
      where: {
        sale: {
          pharmacyId: scope.pharmacyId,
          ...activityScope(),
          createdAt: { gte: period.start, lte: period.end },
        },
        recommendationId: { not: null },
        productId: { not: null },
      },
      select: {
        productId: true,
        quantity: true,
        totalCents: true,
        marginCents: true,
        product: { select: { name: true, brand: true, category: true } },
      },
    }),
  ]);

  const map = new Map<string, ProductPerformance>();

  const ensure = (
    productId: string,
    product: { name: string; brand: string | null; category: string } | null,
  ): ProductPerformance => {
    const existing = map.get(productId);
    if (existing) return existing;
    const created: ProductPerformance = {
      productId,
      name: product?.name ?? "Produit supprimé",
      brand: product?.brand ?? null,
      category: product?.category ?? "AUTRE",
      proposed: 0,
      accepted: 0,
      purchased: 0,
      revenueCents: 0,
      marginCents: 0,
    };
    map.set(productId, created);
    return created;
  };

  const ACCEPTED_STATUSES = new Set([
    "ACCEPTED",
    "MODIFIED",
    "REPLACED",
    "PRESENTED",
    "PURCHASED",
    "DECLINED",
  ]);

  for (const recommendation of recommendations) {
    if (!recommendation.productId) continue;
    const entry = ensure(recommendation.productId, recommendation.product);
    entry.proposed += 1;
    if (ACCEPTED_STATUSES.has(recommendation.status)) entry.accepted += 1;
    if (recommendation.status === "PURCHASED") entry.purchased += 1;
  }

  for (const line of saleLines) {
    if (!line.productId) continue;
    const entry = ensure(line.productId, line.product);
    entry.revenueCents += line.totalCents;
    entry.marginCents += line.marginCents;
  }

  return [...map.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents || b.proposed - a.proposed)
    .slice(0, limit);
}

export type CategoryPerformance = {
  category: string;
  proposed: number;
  purchased: number;
  revenueCents: number;
};

export async function getCategoryPerformance(
  scope: TenantScope,
  period: PeriodRange,
): Promise<CategoryPerformance[]> {
  const products = await getProductPerformance(scope, period, 500);
  const map = new Map<string, CategoryPerformance>();

  for (const product of products) {
    const entry = map.get(product.category) ?? {
      category: product.category,
      proposed: 0,
      purchased: 0,
      revenueCents: 0,
    };
    entry.proposed += product.proposed;
    entry.purchased += product.purchased;
    entry.revenueCents += product.revenueCents;
    map.set(product.category, entry);
  }

  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export type TeamPerformance = {
  userId: string;
  fullName: string;
  initials: string;
  role: string;
  prescriptionsHandled: number;
  recommendationsDecided: number;
  recommendationsAccepted: number;
  salesCount: number;
  attributedCents: number;
  acceptanceRate: number;
};

/**
 * Performance par collaborateur.
 *
 * ⚠️ Ces indicateurs nominatifs relèvent du suivi de l'activité des salariés.
 * Leur mise en œuvre suppose information préalable des personnes, consultation
 * des représentants du personnel le cas échéant, proportionnalité et durée de
 * conservation limitée. Voir docs/RGPD.md § Suivi de l'équipe.
 */
export async function getTeamPerformance(
  scope: TenantScope,
  period: PeriodRange,
): Promise<TeamPerformance[]> {
  const memberships = await prisma.membership.findMany({
    where: { pharmacyId: scope.pharmacyId, isActive: true },
    select: {
      role: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const window = { gte: period.start, lte: period.end };

  const [prescriptions, decisions, sales] = await Promise.all([
    prisma.prescription.groupBy({
      by: ["createdByUserId"],
      where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window },
      _count: true,
    }),
    prisma.recommendation.groupBy({
      by: ["decidedByUserId", "status"],
      where: {
        pharmacyId: scope.pharmacyId,
        ...activityScope(),
        createdAt: window,
        decidedByUserId: { not: null },
      },
      _count: true,
    }),
    prisma.sale.groupBy({
      by: ["userId"],
      where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window },
      _count: true,
      _sum: { attributedCents: true },
    }),
  ]);

  const ACCEPTED = new Set(["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED", "DECLINED"]);

  return memberships
    .map((membership): TeamPerformance => {
      const userId = membership.user.id;
      const userDecisions = decisions.filter((d) => d.decidedByUserId === userId);
      const decided = userDecisions.reduce((sum, d) => sum + d._count, 0);
      const acceptedCount = userDecisions
        .filter((d) => ACCEPTED.has(d.status))
        .reduce((sum, d) => sum + d._count, 0);
      const userSales = sales.find((s) => s.userId === userId);

      return {
        userId,
        fullName: `${membership.user.firstName} ${membership.user.lastName}`,
        initials: `${membership.user.firstName.at(0) ?? ""}${membership.user.lastName.at(0) ?? ""}`.toUpperCase(),
        role: membership.role,
        prescriptionsHandled:
          prescriptions.find((p) => p.createdByUserId === userId)?._count ?? 0,
        recommendationsDecided: decided,
        recommendationsAccepted: acceptedCount,
        salesCount: userSales?._count ?? 0,
        attributedCents: userSales?._sum.attributedCents ?? 0,
        acceptanceRate: decided > 0 ? acceptedCount / decided : 0,
      };
    })
    .sort((a, b) => b.attributedCents - a.attributedCents);
}

/**
 * Ce qu'un conseil devient une fois la carte tranchée au comptoir.
 *
 * ACCEPTÉ regroupe tous les états postérieurs à un « oui » du patient : la
 * recommandation a pu être ajustée, remplacée, imprimée sur la fiche puis
 * achetée — elle reste un oui. REFUSÉ ne compte que le « non » explicite.
 * RETIRÉ (jugement du pharmacien) et IGNORÉ (jamais tranché) n'entrent dans
 * aucun des deux : les mélanger fabriquerait un taux flatteur ou injuste.
 */
const PATIENT_SAID_YES = new Set(["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"]);
const PATIENT_SAID_NO = new Set(["DECLINED"]);

export type CounterScore = {
  /** Conseils tranchés : acceptés + refusés. Le dénominateur du taux. */
  decided: number;
  accepted: number;
  declined: number;
  /** accepté / tranché. Zéro conseil tranché ⇒ null, pas 0 %. */
  acceptanceRate: number | null;
  /** CA additionnel : uniquement les lignes de vente issues d'un conseil. */
  attributedCents: number;
  /** Nombre de délivrances ayant généré du CA additionnel. */
  attributedSalesCount: number;
  /** Panier additionnel moyen. Null si aucune vente additionnelle. */
  averageBasketCents: number | null;
};

export type CollaboratorScore = CounterScore & {
  userId: string;
  fullName: string;
  initials: string;
  role: string;
};

export type CounterPerformance = {
  global: CounterScore & {
    /** Conseils proposés par le moteur, tranchés ou non. */
    proposed: number;
    /** Proposés mais jamais tranchés au comptoir. */
    undecided: number;
  };
  collaborators: CollaboratorScore[];
};

/**
 * Le tableau du titulaire : ce que le comptoir a produit, au global et par
 * collaborateur.
 *
 * ATTRIBUTION — deux rattachements distincts, tous deux nominatifs et posés à
 * l'instant du geste, jamais reconstitués après coup :
 *   • la décision du patient est attribuée à qui a tranché la carte
 *     (`Recommendation.decidedByUserId`) ;
 *   • le CA additionnel est attribué à qui a enregistré la délivrance
 *     (`Sale.userId`), sur la colonne `attributedCents` calculée à la vente.
 * Au comptoir c'est la même personne ; les garder séparés évite d'inventer une
 * attribution le jour où ce ne sera plus le cas.
 *
 * ⚠️ Indicateurs nominatifs : information préalable des personnes, consultation
 * des représentants du personnel, proportionnalité. Voir docs/RGPD.md.
 */
export async function getCounterPerformance(
  scope: TenantScope,
  period: PeriodRange,
): Promise<CounterPerformance> {
  const window = { gte: period.start, lte: period.end };

  const [memberships, decisions, allStatuses, sales] = await Promise.all([
    prisma.membership.findMany({
      where: { pharmacyId: scope.pharmacyId, isActive: true },
      select: {
        role: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.recommendation.groupBy({
      by: ["decidedByUserId", "status"],
      where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window, decidedByUserId: { not: null } },
      _count: true,
    }),
    prisma.recommendation.groupBy({
      by: ["status"],
      where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window },
      _count: true,
    }),
    prisma.sale.groupBy({
      by: ["userId"],
      where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window, attributedCents: { gt: 0 } },
      _count: true,
      _sum: { attributedCents: true },
    }),
  ]);

  const score = (
    rows: { status: string; _count: number }[],
    revenue: { count: number; cents: number },
  ): CounterScore => {
    const accepted = rows
      .filter((row) => PATIENT_SAID_YES.has(row.status))
      .reduce((sum, row) => sum + row._count, 0);
    const declined = rows
      .filter((row) => PATIENT_SAID_NO.has(row.status))
      .reduce((sum, row) => sum + row._count, 0);
    const decided = accepted + declined;

    return {
      decided,
      accepted,
      declined,
      acceptanceRate: decided > 0 ? accepted / decided : null,
      attributedCents: revenue.cents,
      attributedSalesCount: revenue.count,
      averageBasketCents: revenue.count > 0 ? Math.round(revenue.cents / revenue.count) : null,
    };
  };

  const globalRevenue = sales.reduce(
    (totals, row) => ({
      count: totals.count + row._count,
      cents: totals.cents + (row._sum.attributedCents ?? 0),
    }),
    { count: 0, cents: 0 },
  );

  const proposed = allStatuses.reduce((sum, row) => sum + row._count, 0);
  const globalScore = score(allStatuses, globalRevenue);

  const collaborators = memberships
    .map((membership): CollaboratorScore => {
      const userId = membership.user.id;
      const userSales = sales.find((row) => row.userId === userId);

      return {
        userId,
        fullName: `${membership.user.firstName} ${membership.user.lastName}`,
        initials:
          `${membership.user.firstName.at(0) ?? ""}${membership.user.lastName.at(0) ?? ""}`.toUpperCase(),
        role: membership.role,
        ...score(
          decisions.filter((row) => row.decidedByUserId === userId),
          {
            count: userSales?._count ?? 0,
            cents: userSales?._sum.attributedCents ?? 0,
          },
        ),
      };
    })
    .sort((a, b) => b.attributedCents - a.attributedCents || b.accepted - a.accepted);

  return {
    global: {
      ...globalScore,
      proposed,
      undecided: proposed - globalScore.decided,
    },
    collaborators,
  };
}

export type ActivitySummary = {
  prescriptionsAnalyzed: number;
  recommendationsGenerated: number;
  documentsGenerated: number;
  patientsSeen: number;
  averageBasketCents: number;
  averageRevenuePerPrescriptionCents: number;
};

export async function getActivitySummary(
  scope: TenantScope,
  period: PeriodRange,
): Promise<ActivitySummary> {
  const window = { gte: period.start, lte: period.end };

  const [prescriptionsAnalyzed, recommendationsGenerated, documents, patients, attributed] =
    await Promise.all([
      prisma.prescription.count({
        where: {
          pharmacyId: scope.pharmacyId,
          ...activityScope(),
          createdAt: window,
          status: { in: ["ANALYZED", "VALIDATED", "DELIVERED"] },
        },
      }),
      prisma.recommendation.count({
        where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window },
      }),
      prisma.patientDocument.count({
        where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window },
      }),
      prisma.prescription.findMany({
        where: { pharmacyId: scope.pharmacyId, ...activityScope(), createdAt: window, patientId: { not: null } },
        select: { patientId: true },
        distinct: ["patientId"],
      }),
      prisma.sale.aggregate({
        where: {
          pharmacyId: scope.pharmacyId,
          ...activityScope(),
          createdAt: window,
          attributedCents: { gt: 0 },
        },
        _sum: { attributedCents: true },
        _count: true,
      }),
    ]);

  const attributedTotal = attributed._sum.attributedCents ?? 0;

  return {
    prescriptionsAnalyzed,
    recommendationsGenerated,
    documentsGenerated: documents,
    patientsSeen: patients.length,
    averageBasketCents:
      attributed._count > 0 ? Math.round(attributedTotal / attributed._count) : 0,
    averageRevenuePerPrescriptionCents:
      prescriptionsAnalyzed > 0 ? Math.round(attributedTotal / prescriptionsAnalyzed) : 0,
  };
}

export type DeclinedRecommendation = {
  id: string;
  productName: string;
  reason: string;
  status: string;
  createdAt: Date;
  decidedBy: string | null;
};

export async function getDeclinedRecommendations(
  scope: TenantScope,
  period: PeriodRange,
  limit = 15,
): Promise<DeclinedRecommendation[]> {
  const rows = await prisma.recommendation.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      ...activityScope(),
      createdAt: { gte: period.start, lte: period.end },
      status: { in: ["REMOVED", "DECLINED", "REPLACED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      createdAt: true,
      pharmacistNote: true,
      justification: true,
      product: { select: { name: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    productName: row.product?.name ?? "Produit supprimé",
    reason: row.pharmacistNote ?? "Aucun motif renseigné",
    status: row.status,
    createdAt: row.createdAt,
    decidedBy: row.decidedBy
      ? `${row.decidedBy.firstName} ${row.decidedBy.lastName}`
      : null,
  }));
}
