import "server-only";
import { TIME_ZONE } from "@/config/constants";
import type { Prisma } from "@/generated/prisma";
import {
  ACCEPTED_STATUSES,
  PENDING_GRACE_HOURS,
  RHYTHM_WINDOW_DAYS,
  classifyPortfolio,
  computePerformance,
  computeSubscriptionReturn,
  monthBoundsFor,
  resolvePerformancePeriod,
} from "@/core/performance";
import type {
  AdviceRow,
  ConfirmedLineRow,
  PerformancePeriod,
  PerformanceReport,
  PortfolioInput,
  PortfolioRow,
  SubscriptionInfo,
  SubscriptionReturn,
} from "@/core/performance/types";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";

/**
 * Ce que PharmaBoost rapporte : la lecture en base.
 *
 * Ce fichier ne calcule rien d'autre que des lectures bornées. Les règles
 * (conseil proposé, accepté, vente confirmée, chiffre d'affaires, rythme,
 * retour sur abonnement, santé du portefeuille) vivent dans
 * `src/core/performance`, pures et testées ; ici on charge les lignes et on les
 * leur remet.
 *
 * Garanties de lecture :
 *  - `pharmacyId` vient toujours de l'appelant authentifié (session, ou
 *    paramètre déjà vérifié par la console) — jamais d'une requête libre ;
 *  - toute lecture filtre l'officine ET `activityScope()` (le jeu de
 *    démonstration ne se mêle jamais au réel) ;
 *  - une ligne de vente n'est attribuée que si son conseil est de CETTE
 *    officine : le filtre est dans la requête, et revérifié sur ce qui revient ;
 *  - les bornes sont `[début, fin[` ;
 *  - aucune donnée patient : ni nom, ni identifiant patient, ni texte
 *    d'ordonnance. Seule la date de suppression de l'ordonnance est lue, pour
 *    ne plus compter ses conseils.
 */

/** Les conseils de PharmaBoost : les ajouts manuels de l'équipe n'en font pas partie. */
const PHARMABOOST_ORIGINS = ["AI", "RULE"] as const;

/** Un abonnement compte pour le retour sur abonnement dans ces statuts seulement. */
const RETURN_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"];

/** Les analyses qui comptent comme « faites » pour dire qu'une officine utilise le conseil. */
const DONE_ANALYSIS_STATUSES = ["COMPLETED", "PARTIAL"] as const;
/** « Jamais démarré » se juge sur les 30 derniers jours d'analyses. */
const RECENT_ANALYSIS_DAYS = 30;

const MEDICINE_CATEGORY = "MEDICAMENT";
const OTHER_CATEGORY = "AUTRE";
const REMOVED_PRODUCT_LABEL = "Produit retiré du catalogue";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const ACCEPTED_SET = new Set<string>(ACCEPTED_STATUSES);

/**
 * `where: { pharmacyId: undefined }` ne filtre rien : Prisma ignore la clé et
 * lit TOUTES les officines. Un identifiant vide ou absent est donc une erreur,
 * jamais une lecture élargie.
 */
function assertPharmacyId(pharmacyId: unknown): asserts pharmacyId is string {
  if (typeof pharmacyId !== "string" || pharmacyId.length === 0) {
    throw new Error("Lecture des résultats refusée : aucune officine désignée.");
  }
}

function pharmacyFilter(ids: string[]): string | { in: string[] } {
  return ids.length === 1 ? ids[0] : { in: ids };
}

// ---------------------------------------------------------------- Conseils

const ADVICE_SELECT = {
  id: true,
  createdAt: true,
  origin: true,
  status: true,
  productId: true,
  presentationId: true,
  unitPriceCents: true,
  product: { select: { name: true, category: true } },
  presentation: { select: { specialty: { select: { name: true } } } },
  // La seule chose lue de l'ordonnance : a-t-elle été supprimée ?
  prescription: { select: { deletedAt: true } },
} satisfies Prisma.RecommendationSelect;

type AdviceRecord = Prisma.RecommendationGetPayload<{ select: typeof ADVICE_SELECT }>;

function toAdviceRow(row: AdviceRecord): AdviceRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    origin: row.origin,
    status: row.status,
    productId: row.productId,
    presentationId: row.presentationId,
    label: row.product?.name ?? row.presentation?.specialty.name ?? REMOVED_PRODUCT_LABEL,
    category: row.product?.category ?? (row.presentationId ? MEDICINE_CATEGORY : OTHER_CATEGORY),
    unitPriceCents: row.unitPriceCents,
    prescriptionDeleted: row.prescription.deletedAt !== null,
  };
}

/** Les conseils créés dans `[start, end[`, ajouts manuels et ordonnances supprimées compris (le calcul les écarte et les compte à part). */
async function readAdvice(pharmacyId: string, start: Date, end: Date): Promise<AdviceRow[]> {
  const rows = await prisma.recommendation.findMany({
    where: { pharmacyId, ...activityScope(), createdAt: { gte: start, lt: end } },
    select: ADVICE_SELECT,
  });
  return rows.map(toAdviceRow);
}

/**
 * Les conseils des `RHYTHM_WINDOW_DAYS` derniers jours, pour le rythme : quelle
 * que soit la période choisie, car le rythme d'une semaine ne dit rien. Seuls
 * les vrais conseils PharmaBoost (hors ajouts manuels, hors ordonnances
 * supprimées) entrent dans cette lecture.
 */
async function readRhythmAdvice(pharmacyId: string, now: Date): Promise<AdviceRow[]> {
  const since = new Date(now.getTime() - RHYTHM_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.recommendation.findMany({
    where: {
      pharmacyId,
      ...activityScope(),
      origin: { in: [...PHARMABOOST_ORIGINS] },
      prescription: { deletedAt: null },
      createdAt: { gte: since, lt: now },
    },
    select: ADVICE_SELECT,
  });
  return rows.map(toAdviceRow);
}

// ---------------------------------------------------------------- Ventes confirmées

const LINE_SELECT = {
  id: true,
  recommendationId: true,
  productId: true,
  presentationId: true,
  label: true,
  quantity: true,
  unitPriceCents: true,
  totalCents: true,
  vatRate: true,
  product: { select: { category: true } },
  recommendation: {
    select: {
      pharmacyId: true,
      origin: true,
      product: { select: { category: true } },
      // La seule chose lue de l'ordonnance : a-t-elle été supprimée ?
      prescription: { select: { deletedAt: true } },
    },
  },
} satisfies Prisma.SaleLineSelect;

type Window = { start: Date; end: Date };
type PharmacyLine = { pharmacyId: string; line: ConfirmedLineRow };

/**
 * Une ligne de vente « confirmée » : rattachée à un conseil d'une des
 * officines lues, hors démonstration, dont l'ordonnance n'a pas été supprimée
 * (le conseil n'est plus compté comme proposé : sa vente ne doit pas non plus
 * faire du chiffre d'affaires, sinon CA et entonnoir ne parlent plus de la même
 * population). `onlyPharmaBoost` écarte les ajouts manuels dès la requête
 * (retour sur abonnement, portefeuille).
 */
function confirmedLineWhere(ids: string[], onlyPharmaBoost: boolean): Prisma.SaleLineWhereInput {
  return {
    recommendationId: { not: null },
    recommendation: {
      is: {
        pharmacyId: pharmacyFilter(ids),
        ...activityScope(),
        prescription: { deletedAt: null },
        ...(onlyPharmaBoost ? { origin: { in: [...PHARMABOOST_ORIGINS] } } : {}),
      },
    },
  };
}

/**
 * Les ventes de l'officine (ou des officines) datées dans les fenêtres, puis
 * leurs lignes rattachées à un conseil de la MÊME officine. L'origine du conseil
 * est lue sur la `Recommendation` ; une ligne dont le conseil a disparu n'est
 * pas attribuée.
 */
async function readConfirmedLines(
  ids: string[],
  windows: Window[],
  onlyPharmaBoost: boolean,
): Promise<PharmacyLine[]> {
  if (windows.length === 0) return [];
  const lineWhere = confirmedLineWhere(ids, onlyPharmaBoost);
  const dates: Prisma.SaleWhereInput =
    windows.length === 1
      ? { createdAt: { gte: windows[0].start, lt: windows[0].end } }
      : { OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) };

  const sales = await prisma.sale.findMany({
    where: { pharmacyId: pharmacyFilter(ids), ...activityScope(), ...dates, lines: { some: lineWhere } },
    select: {
      id: true,
      pharmacyId: true,
      createdAt: true,
      lines: { where: lineWhere, select: LINE_SELECT },
    },
  });

  const allowed = new Set(ids);
  const rows: PharmacyLine[] = [];
  for (const sale of sales) {
    if (!allowed.has(sale.pharmacyId)) continue;
    for (const line of sale.lines) {
      const advice = line.recommendation;
      // Garde de fond, au cas où le filtre de la requête serait un jour contourné :
      // un conseil d'une autre officine n'attribue jamais une vente.
      if (!line.recommendationId || !advice || advice.pharmacyId !== sale.pharmacyId) continue;
      // Idem pour une ordonnance supprimée : le conseil ne compte plus, sa vente non plus.
      if (advice.prescription.deletedAt !== null) continue;
      if (onlyPharmaBoost && !isPharmaBoostOrigin(advice.origin)) continue;
      rows.push({
        pharmacyId: sale.pharmacyId,
        line: {
          saleId: sale.id,
          saleCreatedAt: sale.createdAt,
          lineId: line.id,
          recommendationId: line.recommendationId,
          origin: advice.origin,
          productId: line.productId,
          presentationId: line.presentationId,
          label: line.label,
          category: line.presentationId
            ? MEDICINE_CATEGORY
            : (line.product?.category ?? advice.product?.category ?? OTHER_CATEGORY),
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
          vatRate: line.vatRate,
        },
      });
    }
  }
  return rows;
}

function isPharmaBoostOrigin(origin: string): boolean {
  return (PHARMABOOST_ORIGINS as readonly string[]).includes(origin);
}

async function readLinesOf(pharmacyId: string, window: Window, onlyPharmaBoost: boolean): Promise<ConfirmedLineRow[]> {
  const rows = await readConfirmedLines([pharmacyId], [window], onlyPharmaBoost);
  return rows.map((row) => row.line);
}

// ---------------------------------------------------------------- Abonnement

/**
 * Les officines ACTIVES de l'organisation, hors démonstration (hors environnement
 * démo) : de quoi savoir si l'abonnement de l'organisation est celui d'une seule
 * officine ou d'un groupe. Lu dans la même requête que l'abonnement. Une fonction,
 * pas une constante : `activityScope()` se lit à chaque requête, jamais à l'import.
 */
function activePharmaciesSelect() {
  return { where: { isActive: true, ...activityScope() }, select: { id: true } } satisfies Prisma.Organization$pharmaciesArgs;
}

/**
 * Un abonnement appartient à une ORGANISATION, qui peut avoir plusieurs
 * officines : dès qu'elle en compte plus d'une active, son prix est celui du
 * groupe et le retour sur abonnement d'une seule officine serait faux (chaque
 * officine serait comparée au prix de tout le groupe). Il est alors marqué partagé.
 */
function toSubscriptionInfo(
  subscription: { status: string; contractPriceCents: number | null } | null | undefined,
  activePharmacyCount: number,
): SubscriptionInfo | null {
  if (!subscription || !RETURN_SUBSCRIPTION_STATUSES.includes(subscription.status)) return null;
  return {
    status: subscription.status,
    monthlyPriceHtCents: subscription.contractPriceCents,
    shared: activePharmacyCount > 1,
  };
}

async function readSubscription(pharmacyId: string): Promise<SubscriptionInfo | null> {
  const subscription = await prisma.subscription.findFirst({
    where: { organization: { pharmacies: { some: { id: pharmacyId } } } },
    select: {
      status: true,
      contractPriceCents: true,
      organization: { select: { pharmacies: activePharmaciesSelect() } },
    },
  });
  return toSubscriptionInfo(subscription, subscription?.organization.pharmacies.length ?? 0);
}

// ---------------------------------------------------------------- Titulaire

/** Le rapport d'une officine sur une période, comparé à la période précédente. */
export async function loadPerformanceReport(params: {
  pharmacyId: string;
  period: PerformancePeriod;
  now?: Date;
}): Promise<PerformanceReport> {
  const { pharmacyId, period } = params;
  assertPharmacyId(pharmacyId);
  const now = params.now ?? new Date();

  const [advice, previousAdvice, rhythmAdvice, lines, previousLines] = await Promise.all([
    readAdvice(pharmacyId, period.start, period.end),
    readAdvice(pharmacyId, period.previousStart, period.previousEnd),
    readRhythmAdvice(pharmacyId, now),
    readLinesOf(pharmacyId, { start: period.start, end: period.end }, false),
    readLinesOf(pharmacyId, { start: period.previousStart, end: period.previousEnd }, false),
  ]);

  return computePerformance({
    period,
    now,
    timeZone: TIME_ZONE,
    advice,
    previousAdvice,
    lines,
    previousLines,
    rhythmAdvice,
  });
}

/** « Mon abonnement me coûte X € » : toujours le mois civil en cours, quelle que soit la période choisie. */
export async function loadSubscriptionReturn(params: { pharmacyId: string; now?: Date }): Promise<SubscriptionReturn> {
  const { pharmacyId } = params;
  assertPharmacyId(pharmacyId);
  const now = params.now ?? new Date();
  const month = monthBoundsFor(now, TIME_ZONE);

  const [subscription, monthLines] = await Promise.all([
    readSubscription(pharmacyId),
    readLinesOf(pharmacyId, { start: month.start, end: month.end }, true),
  ]);

  return computeSubscriptionReturn({ subscription, monthLines, monthLabel: month.label, now });
}

// ---------------------------------------------------------------- Console

/**
 * Console seulement : l'appelant a déjà exigé `requirePlatformSession()`. `null` si l'officine n'existe pas.
 * `pharmacy.isDemo` est rendu tel quel : pour une officine de démonstration hors
 * environnement démo, le rapport reste filtré (donc vide) et l'onglet doit pouvoir le dire.
 */
export async function loadPerformanceForPlatform(params: {
  pharmacyId: string;
  period: PerformancePeriod;
  now?: Date;
}): Promise<{
  pharmacy: { id: string; name: string; city: string | null; createdAt: Date; isDemo: boolean };
  report: PerformanceReport;
  roi: SubscriptionReturn;
} | null> {
  assertPharmacyId(params.pharmacyId);
  const now = params.now ?? new Date();

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: params.pharmacyId },
    select: { id: true, name: true, city: true, createdAt: true, isDemo: true },
  });
  if (!pharmacy) return null;

  // On lit avec l'identifiant que la base vient de confirmer, pas avec la chaîne reçue.
  const [report, roi] = await Promise.all([
    loadPerformanceReport({ pharmacyId: pharmacy.id, period: params.period, now }),
    loadSubscriptionReturn({ pharmacyId: pharmacy.id, now }),
  ]);
  return { pharmacy, report, roi };
}

type PortfolioTotals = {
  pharmacies: number;
  withConfirmedSales: number;
  confirmedTtcCents: number;
  highValue: number;
  needsSupport: number;
};

/**
 * Le portefeuille : toutes les officines (hors démonstration, sauf environnement
 * démo) en une poignée de requêtes groupées. Le nombre de requêtes ne dépend pas
 * du nombre d'officines : jamais une lecture par officine.
 */
export async function loadPortfolioForPlatform(params: { now?: Date } = {}): Promise<{
  rows: PortfolioRow[];
  totals: PortfolioTotals;
  generatedAt: Date;
}> {
  const now = params.now ?? new Date();

  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, ...activityScope() },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      createdAt: true,
      organization: {
        select: {
          subscription: { select: { status: true, contractPriceCents: true } },
          pharmacies: activePharmaciesSelect(),
        },
      },
    },
  });
  if (pharmacies.length === 0) {
    return {
      rows: [],
      totals: { pharmacies: 0, withConfirmedSales: 0, confirmedTtcCents: 0, highValue: 0, needsSupport: 0 },
      generatedAt: now,
    };
  }

  const ids = pharmacies.map((pharmacy) => pharmacy.id);
  // « Ce mois » et sa comparaison, calculés comme pour le titulaire.
  const period = resolvePerformancePeriod({ key: "month", now, timeZone: TIME_ZONE });
  const month = monthBoundsFor(now, TIME_ZONE);
  const pendingSince = new Date(now.getTime() - PENDING_GRACE_HOURS * HOUR_MS);
  const analysesSince = new Date(now.getTime() - RECENT_ANALYSIS_DAYS * DAY_MS);

  const adviceWhere = {
    pharmacyId: { in: ids },
    ...activityScope(),
    origin: { in: [...PHARMABOOST_ORIGINS] },
    prescription: { deletedAt: null },
  } satisfies Prisma.RecommendationWhereInput;

  const [byStatus, pending, lastProposals, lastSales, analyses, lines] = await Promise.all([
    prisma.recommendation.groupBy({
      by: ["pharmacyId", "status"],
      where: { ...adviceWhere, createdAt: { gte: period.start, lt: period.end } },
      _count: true,
    }),
    // Les conseils encore en attente sortent du dénominateur du taux : créés il y a STRICTEMENT moins
    // de 24 h (`gt`, comme `isPendingAdvice` : à 24 h pile le conseil est « sans réponse »), et dans le mois (`gte`).
    prisma.recommendation.groupBy({
      by: ["pharmacyId"],
      where: {
        ...adviceWhere,
        status: "PROPOSED",
        createdAt: { gte: period.start, gt: pendingSince, lt: period.end },
      },
      _count: true,
    }),
    prisma.recommendation.groupBy({ by: ["pharmacyId"], where: adviceWhere, _max: { createdAt: true } }),
    // La dernière vente confirmée : une vente qui contient une ligne issue d'un vrai conseil PharmaBoost
    // de la MÊME officine. Prisma ne compare pas deux colonnes entre elles : une branche par officine,
    // où l'officine de la vente et celle du conseil sont la même (une seule requête pour toutes).
    prisma.sale.groupBy({
      by: ["pharmacyId"],
      where: {
        pharmacyId: { in: ids },
        ...activityScope(),
        OR: ids.map((id) => ({ pharmacyId: id, lines: { some: confirmedLineWhere([id], true) } })),
      },
      _max: { createdAt: true },
    }),
    prisma.analysisRun.groupBy({
      by: ["pharmacyId"],
      where: {
        pharmacyId: { in: ids },
        ...activityScope(),
        status: { in: [...DONE_ANALYSIS_STATUSES] },
        startedAt: { gte: analysesSince, lt: now },
      },
      _count: true,
    }),
    readConfirmedLines(
      ids,
      [
        { start: period.start, end: period.end },
        { start: period.previousStart, end: period.previousEnd },
      ],
      true,
    ),
  ]);

  // Proposés et acceptés : horloge de la PROPOSITION (le conseil est créé dans le mois).
  const funnel = new Map<string, { proposed: number; accepted: number }>();
  for (const row of byStatus) {
    const entry = funnel.get(row.pharmacyId) ?? { proposed: 0, accepted: 0 };
    entry.proposed += row._count;
    if (ACCEPTED_SET.has(row.status)) entry.accepted += row._count;
    funnel.set(row.pharmacyId, entry);
  }
  const pendingBy = new Map(pending.map((row) => [row.pharmacyId, row._count]));
  const lastProposalBy = new Map(lastProposals.map((row) => [row.pharmacyId, row._max.createdAt]));
  const lastSaleBy = new Map(lastSales.map((row) => [row.pharmacyId, row._max.createdAt]));
  const analysesBy = new Map(analyses.map((row) => [row.pharmacyId, row._count]));

  const monthLines = new Map<string, ConfirmedLineRow[]>();
  const previousTtc = new Map<string, number>();
  for (const { pharmacyId, line } of lines) {
    if (line.saleCreatedAt >= period.start && line.saleCreatedAt < period.end) {
      const list = monthLines.get(pharmacyId) ?? [];
      list.push(line);
      monthLines.set(pharmacyId, list);
    } else if (line.saleCreatedAt >= period.previousStart && line.saleCreatedAt < period.previousEnd) {
      previousTtc.set(pharmacyId, (previousTtc.get(pharmacyId) ?? 0) + pricedTtc(line));
    }
  }

  const inputs: PortfolioInput[] = pharmacies.map((pharmacy) => {
    const counts = funnel.get(pharmacy.id) ?? { proposed: 0, accepted: 0 };
    const lineList = monthLines.get(pharmacy.id) ?? [];
    const subscription = toSubscriptionInfo(pharmacy.organization.subscription, pharmacy.organization.pharmacies.length);
    return {
      pharmacyId: pharmacy.id,
      name: pharmacy.name,
      city: pharmacy.city,
      createdAt: pharmacy.createdAt,
      subscription,
      proposed: counts.proposed,
      accepted: counts.accepted,
      decided: counts.proposed - (pendingBy.get(pharmacy.id) ?? 0),
      // « Conseils achetés » : conseils DISTINCTS vendus ce mois-ci, à l'horloge de la VENTE (la même
      // que le chiffre d'affaires). Les lignes sans prix ci-dessous sont des LIGNES de vente, pas des
      // conseils : deux lignes d'un même conseil font 1 conseil acheté et 2 lignes (jamais un sous-ensemble).
      purchased: new Set(lineList.map((line) => line.recommendationId)).size,
      confirmedTtcCents: lineList.reduce((sum, line) => sum + pricedTtc(line), 0),
      previousConfirmedTtcCents: previousTtc.get(pharmacy.id) ?? 0,
      unpricedConfirmedLines: lineList.filter((line) => line.unitPriceCents <= 0).length,
      recentAnalyses: analysesBy.get(pharmacy.id) ?? 0,
      lastProposalAt: lastProposalBy.get(pharmacy.id) ?? null,
      lastSaleAt: lastSaleBy.get(pharmacy.id) ?? null,
      roi: computeSubscriptionReturn({ subscription, monthLines: lineList, monthLabel: month.label, now }),
    };
  });

  const result = classifyPortfolio(inputs, now);
  return {
    rows: result,
    totals: {
      pharmacies: result.length,
      withConfirmedSales: result.filter((row) => (monthLines.get(row.pharmacyId)?.length ?? 0) > 0).length,
      confirmedTtcCents: result.reduce((sum, row) => sum + row.confirmedTtcCents, 0),
      highValue: result.filter((row) => row.health === "high_value").length,
      needsSupport: result.filter((row) => row.health === "needs_support").length,
    },
    generatedAt: now,
  };
}

/** Le chiffre d'affaires d'une ligne confirmée : son total TTC si le prix est connu, rien sinon (jamais un prix deviné). */
function pricedTtc(line: ConfirmedLineRow): number {
  return line.unitPriceCents > 0 ? line.totalCents : 0;
}
