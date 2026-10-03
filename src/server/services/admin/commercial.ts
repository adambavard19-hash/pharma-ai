import "server-only";
import { prisma } from "@/server/db/client";
import { mrrCents } from "@/core/billing/contract-price";
import { isOpenStatus, type ProspectStatusCode } from "@/core/sales/pipeline";
import { buildFollowUps, trialDaysLeft, type DayBucket, type FollowUpItem } from "@/core/sales/board";
import { todayRange } from "@/core/admin/metrics";
import type { Prisma, ProspectOrigin } from "@/generated/prisma";

/**
 * L'espace Commercial de la console : tableau du pipeline, liste des
 * dossiers, démonstrations, relances, et résultats de l'équipe.
 *
 * Données commerciales uniquement : dossiers, contrats, abonnements,
 * commissions. Aucune table clinique n'est lue ici.
 */

/** Seuil commun : un dossier ouvert sans contact depuis 14 jours est « sans réponse ». */
export const NO_REPLY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = ["ACTIVATED", "LOST"] as const;

/** `commercial=console` désigne les dossiers tenus par la console, sans commercial. */
export const CONSOLE_REP = "console";

function repWhere(commercial: string | null | undefined): Prisma.ProspectWhereInput | null {
  if (!commercial) return null;
  return commercial === CONSOLE_REP ? { salesRepId: null } : { salesRepId: commercial };
}

function searchWhere(q: string | null | undefined): Prisma.ProspectWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  return { OR: [{ name: { contains: text, mode: "insensitive" } }, { ownerName: { contains: text, mode: "insensitive" } }, { city: { contains: text, mode: "insensitive" } }, { email: { contains: text, mode: "insensitive" } }] };
}

function cityWhere(ville: string | null | undefined): Prisma.ProspectWhereInput | null {
  const text = ville?.trim();
  return text ? { city: { contains: text, mode: "insensitive" } } : null;
}

const and = (...parts: (Prisma.ProspectWhereInput | null)[]): Prisma.ProspectWhereInput => {
  const kept = parts.filter((part): part is Prisma.ProspectWhereInput => part !== null);
  return kept.length === 0 ? {} : { AND: kept };
};

// ---- Liste des dossiers ----------------------------------------------------------

export const PROSPECT_FILTERS = ["sans-reponse", "a-relancer"] as const;
export type ProspectFilterKey = (typeof PROSPECT_FILTERS)[number];

/** `origine=` dans l'adresse : des mots lisibles plutôt que les codes de la base. */
export const ORIGIN_PARAMS: { value: string; origin: ProspectOrigin; label: string }[] = [
  { value: "site", origin: "SELF_SERVICE_SITE", label: "Site" },
  { value: "console", origin: "SUPER_ADMIN", label: "Console" },
  { value: "commercial", origin: "COMMERCIAL", label: "Commercial" },
];

export function parseOriginParam(value: string | null | undefined): ProspectOrigin | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return ORIGIN_PARAMS.find((o) => o.value === v || o.origin.toLowerCase() === v)?.origin ?? null;
}

export function parseProspectFilter(value: string | null | undefined): ProspectFilterKey | null {
  return PROSPECT_FILTERS.find((f) => f === value) ?? null;
}

export type ProspectListFilter = {
  filtre: ProspectFilterKey | null;
  statut: ProspectStatusCode | null;
  commercial: string | null;
  origine: ProspectOrigin | null;
  q: string | null;
};

/**
 * Le filtre de la liste, traduit pour la base. Les définitions suivent le
 * contrat des adresses de la console :
 *   - sans-reponse : dossier ouvert, sans contact depuis 14 jours (dernier
 *     contact plus ancien, ou aucun contact et dossier créé il y a plus de 14 j) ;
 *   - a-relancer : dossier ouvert dont la prochaine action est en retard,
 *     c'est-à-dire tombée un jour de Paris déjà passé (même définition que le
 *     marqueur de la liste, le cockpit et les relances).
 */
export function prospectListWhere(filter: ProspectListFilter, now: Date): Prisma.ProspectWhereInput {
  const cutoff = new Date(now.getTime() - NO_REPLY_DAYS * DAY_MS);
  const open: Prisma.ProspectWhereInput = { status: { notIn: [...CLOSED_STATUSES] } };
  const special: Prisma.ProspectWhereInput | null =
    filter.filtre === "sans-reponse"
      ? { AND: [open, { OR: [{ lastContactAt: { lt: cutoff } }, { lastContactAt: null, createdAt: { lt: cutoff } }] }] }
      : filter.filtre === "a-relancer"
        ? { AND: [open, { nextActionAt: { lt: todayRange(now).start } }] }
        : null;
  return and(special, filter.statut ? { status: filter.statut } : null, repWhere(filter.commercial), filter.origine ? { origin: filter.origine } : null, searchWhere(filter.q));
}

const LIST_SELECT = {
  id: true,
  name: true,
  city: true,
  status: true,
  origin: true,
  lastContactAt: true,
  nextActionAt: true,
  nextActionLabel: true,
  demoAt: true,
  demoDoneAt: true,
  createdAt: true,
  blockedAt: true,
  salesRep: { select: { id: true, firstName: true, lastName: true } },
  contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
} satisfies Prisma.ProspectSelect;

/** Les dossiers du filtre, les plus récemment modifiés d'abord ; `truncated` si la limite coupe la liste. */
export async function listProspectRows(filter: ProspectListFilter, now: Date, limit = 300) {
  const rows = await prisma.prospect.findMany({ where: prospectListWhere(filter, now), select: LIST_SELECT, orderBy: [{ updatedAt: "desc" }], take: limit + 1 });
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** Les compteurs des pastilles : chacun calculé avec les autres filtres en place. */
export async function prospectListCounts(filter: ProspectListFilter, now: Date) {
  const [all, noReply, toFollow, byStatus, byOrigin, byRep] = await Promise.all([
    prisma.prospect.count({ where: prospectListWhere({ ...filter, filtre: null }, now) }),
    prisma.prospect.count({ where: prospectListWhere({ ...filter, filtre: "sans-reponse" }, now) }),
    prisma.prospect.count({ where: prospectListWhere({ ...filter, filtre: "a-relancer" }, now) }),
    prisma.prospect.groupBy({ by: ["status"], where: prospectListWhere({ ...filter, statut: null }, now), _count: { _all: true } }),
    prisma.prospect.groupBy({ by: ["origin"], where: prospectListWhere({ ...filter, origine: null }, now), _count: { _all: true } }),
    prisma.prospect.groupBy({ by: ["salesRepId"], where: prospectListWhere({ ...filter, commercial: null }, now), _count: { _all: true } }),
  ]);
  return {
    filtre: { all, "sans-reponse": noReply, "a-relancer": toFollow } as Record<"all" | ProspectFilterKey, number>,
    statut: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Partial<Record<ProspectStatusCode, number>>,
    origine: Object.fromEntries(byOrigin.map((row) => [row.origin, row._count._all])) as Partial<Record<ProspectOrigin, number>>,
    commercial: Object.fromEntries(byRep.map((row) => [row.salesRepId ?? CONSOLE_REP, row._count._all])) as Record<string, number>,
  };
}

/** Les commerciaux, pour les filtres et les formulaires. */
export async function listRepOptions() {
  return prisma.salesRep.findMany({ orderBy: [{ isActive: "desc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, isActive: true } });
}

/** Les dossiers ouverts, pour choisir celui d'une démo ou d'une relance. */
export async function listOpenProspectOptions() {
  const rows = await prisma.prospect.findMany({
    where: { status: { notIn: [...CLOSED_STATUSES] } },
    orderBy: [{ name: "asc" }],
    take: 1000,
    select: { id: true, name: true, city: true, status: true, salesRep: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, city: row.city, status: row.status, repName: row.salesRep ? `${row.salesRep.firstName} ${row.salesRep.lastName}` : null }));
}

// ---- Tableau du pipeline --------------------------------------------------------

/** Une carte du tableau, prête à passer au navigateur (dates en ISO). */
export type BoardCardData = {
  id: string;
  name: string;
  city: string | null;
  status: ProspectStatusCode;
  salesRepName: string | null;
  nextActionAt: string | null;
  nextActionLabel: string | null;
  demoAt: string | null;
  demoDoneAt: string | null;
  contractStatus: string | null;
  /** Jours d'essai restants si l'officine liée est en essai ; sinon `null`. */
  trialDaysLeft: number | null;
  monthlyPriceCents: number | null;
  blocked: boolean;
  updatedAt: string;
};

export type BoardFilter = { commercial: string | null; q: string | null; ville: string | null };

/** Les dossiers clos (activés, perdus) sans mouvement depuis ce nombre de jours quittent le tableau (ils restent dans la liste). */
export const BOARD_CLOSED_DAYS = 90;
/** Au plus ce nombre de cartes sur le tableau, les plus récemment modifiées ; au-delà, la liste prend le relais. */
export const BOARD_CARD_LIMIT = 1500;

/** Ce que le tableau affiche : les dossiers ouverts et les dossiers clos récents. */
export function boardWhere(filter: BoardFilter, now: Date): Prisma.ProspectWhereInput {
  const closedBefore = new Date(now.getTime() - BOARD_CLOSED_DAYS * DAY_MS);
  return and(repWhere(filter.commercial), cityWhere(filter.ville), searchWhere(filter.q), { OR: [{ status: { notIn: [...CLOSED_STATUSES] } }, { updatedAt: { gte: closedBefore } }] });
}

/** Les dossiers clos depuis longtemps, hors du tableau : comptés pour le dire et renvoyer vers la liste. */
export function boardHiddenClosedWhere(filter: BoardFilter, now: Date): Prisma.ProspectWhereInput {
  const closedBefore = new Date(now.getTime() - BOARD_CLOSED_DAYS * DAY_MS);
  return and(repWhere(filter.commercial), cityWhere(filter.ville), searchWhere(filter.q), { status: { in: [...CLOSED_STATUSES] } }, { updatedAt: { lt: closedBefore } });
}

const BOARD_SELECT = {
  id: true,
  name: true,
  city: true,
  status: true,
  monthlyPriceCents: true,
  nextActionAt: true,
  nextActionLabel: true,
  demoAt: true,
  demoDoneAt: true,
  blockedAt: true,
  updatedAt: true,
  salesRep: { select: { firstName: true, lastName: true } },
  contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
  pharmacy: { select: { isDemo: true, organization: { select: { subscription: { select: { status: true, trialEndsAt: true } } } } } },
} satisfies Prisma.ProspectSelect;

/**
 * Les cartes du tableau, bornées côté base : les dossiers clos (activés,
 * perdus) sans mouvement depuis `BOARD_CLOSED_DAYS` jours n'y figurent pas
 * (`hiddenClosed` les compte), et au plus `BOARD_CARD_LIMIT` cartes sont
 * lues (`truncated` le signale).
 */
export async function loadBoardCards(filter: BoardFilter, now: Date): Promise<{ cards: BoardCardData[]; hiddenClosed: number; truncated: boolean }> {
  const [found, hiddenClosed] = await Promise.all([
    prisma.prospect.findMany({ where: boardWhere(filter, now), orderBy: [{ updatedAt: "desc" }], take: BOARD_CARD_LIMIT + 1, select: BOARD_SELECT }),
    prisma.prospect.count({ where: boardHiddenClosedWhere(filter, now) }),
  ]);
  const rows = found.slice(0, BOARD_CARD_LIMIT);
  const cards = rows.map((row) => {
    const subscription = row.pharmacy?.organization.subscription ?? null;
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      status: row.status as ProspectStatusCode,
      salesRepName: row.salesRep ? `${row.salesRep.firstName} ${row.salesRep.lastName}` : null,
      nextActionAt: row.nextActionAt?.toISOString() ?? null,
      nextActionLabel: row.nextActionLabel,
      demoAt: row.demoAt?.toISOString() ?? null,
      demoDoneAt: row.demoDoneAt?.toISOString() ?? null,
      contractStatus: row.contracts[0]?.status ?? null,
      trialDaysLeft: subscription?.status === "TRIALING" ? trialDaysLeft(subscription.trialEndsAt, now) : null,
      monthlyPriceCents: row.monthlyPriceCents,
      blocked: Boolean(row.blockedAt),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  return { cards, hiddenClosed, truncated: found.length > BOARD_CARD_LIMIT };
}

// ---- Relances ------------------------------------------------------------------------

/** Au plus ce nombre de relances lues pour une vue ; « voir tout » relève la borne à `FOLLOW_UP_ALL_LIMIT`. */
export const FOLLOW_UP_LIMIT = 500;
export const FOLLOW_UP_ALL_LIMIT = 2000;

/** Une vue de la liste des relances : un jour de Paris, ou `null` pour « à traiter » (en retard et du jour). */
export type FollowUpView = DayBucket | null;

/** Les échéances d'une vue, aux bornes des jours de Paris (mêmes définitions que `dayBucket`). */
export function followUpDueRange(view: FollowUpView, now: Date): { gte?: Date; lt?: Date } {
  const today = todayRange(now);
  if (view === "retard") return { lt: today.start };
  if (view === "aujourdhui") return { gte: today.start, lt: today.end };
  if (view === "a-venir") return { gte: today.end };
  return { lt: today.end };
}

const OPEN_PROSPECT: Prisma.ProspectWhereInput = { status: { notIn: [...CLOSED_STATUSES] } };

/** Les relances ouvertes des agendas (dossiers ouverts), pour un commercial ou tous ; aucune pour la console. */
function followUpTaskWhere(commercial: string | null, due: { gte?: Date; lt?: Date }): Prisma.SalesTaskWhereInput | null {
  if (commercial === CONSOLE_REP) return null;
  return { doneAt: null, prospect: OPEN_PROSPECT, dueAt: due, ...(commercial ? { salesRepId: commercial } : {}) };
}

/** La prochaine action des dossiers ouverts qui n'ont aucune relance ouverte (dossiers de la console, demandes du site). */
function followUpDossierWhere(commercial: string | null, due: { gte?: Date; lt?: Date }): Prisma.ProspectWhereInput {
  return and(OPEN_PROSPECT, { nextActionAt: { not: null, ...due } }, { tasks: { none: { doneAt: null } } }, repWhere(commercial));
}

/** Le nombre de relances par jour de Paris (en retard, du jour, à venir), comptées par la base. */
export async function followUpCounts(filter: { commercial: string | null }, now: Date): Promise<Record<DayBucket, number>> {
  const buckets: DayBucket[] = ["retard", "aujourdhui", "a-venir"];
  const counted = await Promise.all(
    buckets.map(async (bucket) => {
      const due = followUpDueRange(bucket, now);
      const taskWhere = followUpTaskWhere(filter.commercial, due);
      const [tasks, dossiers] = await Promise.all([taskWhere ? prisma.salesTask.count({ where: taskWhere }) : Promise.resolve(0), prisma.prospect.count({ where: followUpDossierWhere(filter.commercial, due) })]);
      return [bucket, tasks + dossiers] as const;
    }),
  );
  return Object.fromEntries(counted) as Record<DayBucket, number>;
}

/**
 * Les relances d'une vue, tous commerciaux (et dossiers de la console), de la
 * plus ancienne échéance à la plus lointaine. Bornées côté base : au plus
 * `limit` relances, `truncated` si la vue en compte davantage.
 */
export async function loadFollowUps(filter: { commercial: string | null; view?: FollowUpView }, now: Date, limit: number = FOLLOW_UP_LIMIT): Promise<{ items: FollowUpItem[]; truncated: boolean }> {
  const due = followUpDueRange(filter.view ?? null, now);
  const taskWhere = followUpTaskWhere(filter.commercial, due);
  const [tasks, dossiers] = await Promise.all([
    taskWhere
      ? prisma.salesTask.findMany({
          where: taskWhere,
          orderBy: { dueAt: "asc" },
          take: limit + 1,
          select: { id: true, label: true, dueAt: true, salesRep: { select: { id: true, firstName: true, lastName: true } }, prospect: { select: { id: true, name: true, city: true, status: true } } },
        })
      : Promise.resolve([]),
    prisma.prospect.findMany({
      where: followUpDossierWhere(filter.commercial, due),
      orderBy: { nextActionAt: "asc" },
      take: limit + 1,
      select: { id: true, name: true, city: true, status: true, nextActionAt: true, nextActionLabel: true, salesRep: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  const items = buildFollowUps(
    {
      tasks,
      dossiers: dossiers.filter((d) => d.nextActionAt).map((d) => ({ ...d, nextActionAt: d.nextActionAt as Date, hasOpenTask: false })),
    },
    now,
  );
  return { items: items.slice(0, limit), truncated: items.length > limit };
}

// ---- Démonstrations ---------------------------------------------------------------

/** Démonstrations passées affichées : les plus récentes ; « voir tout » relève la borne. */
export const PAST_DEMOS_LIMIT = 150;
export const PAST_DEMOS_ALL_LIMIT = 1000;
/** Démonstrations à venir lues au plus (elles se programment au plus un an à l'avance). */
export const UPCOMING_DEMOS_LIMIT = 500;

const DEMO_SELECT = { id: true, name: true, city: true, status: true, demoAt: true, demoDoneAt: true, ownerName: true, salesRep: { select: { id: true, firstName: true, lastName: true } } } satisfies Prisma.ProspectSelect;

/**
 * Les démonstrations, bornées côté base : celles d'aujourd'hui et à venir
 * (jour de Paris), puis les `pastLimit` passées les plus récentes. Les
 * compteurs des passées et des démos à confirmer viennent de la base.
 */
export async function loadDemos(filter: { commercial: string | null }, now: Date, options: { pastLimit?: number } = {}) {
  const todayStart = todayRange(now).start;
  const pastLimit = options.pastLimit ?? PAST_DEMOS_LIMIT;
  const base = and({ demoAt: { not: null } }, repWhere(filter.commercial));
  const pastWhere = and(base, { demoAt: { lt: todayStart } });
  const [upcoming, past, pastCount, toConfirm] = await Promise.all([
    prisma.prospect.findMany({ where: and(base, { demoAt: { gte: todayStart } }), orderBy: { demoAt: "asc" }, take: UPCOMING_DEMOS_LIMIT + 1, select: DEMO_SELECT }),
    prisma.prospect.findMany({ where: pastWhere, orderBy: { demoAt: "desc" }, take: pastLimit, select: DEMO_SELECT }),
    prisma.prospect.count({ where: pastWhere }),
    prisma.prospect.count({ where: and(pastWhere, { demoDoneAt: null }) }),
  ]);
  return { upcoming: upcoming.slice(0, UPCOMING_DEMOS_LIMIT), upcomingTruncated: upcoming.length > UPCOMING_DEMOS_LIMIT, past, pastCount, toConfirm };
}

/**
 * Une démonstration réalisée, lue dans le journal d'audit (`sales.demo_done`,
 * une entrée par démo) : le dossier, le commercial qui le suivait alors, et
 * l'instant. Le journal ne s'écrase pas : programmer une nouvelle démo sur le
 * dossier (qui remet sa date de démo réalisée à vide) ne retire rien.
 */
export type DemoDoneFact = { prospectId: string | null; salesRepId: string | null; at: Date };

/** Le commercial noté dans l'entrée d'audit ; `null` pour un dossier de la console. */
export function demoDoneRep(metadata: unknown): string | null {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).salesRepId : null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Les démonstrations réalisées dans la fenêtre (sans début : depuis toujours). */
export async function loadDemoDoneLog(window: { start: Date | null; end?: Date | null }): Promise<DemoDoneFact[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: "sales.demo_done", entityType: "Prospect", createdAt: { ...(window.start ? { gte: window.start } : {}), ...(window.end ? { lte: window.end } : {}) } },
    select: { entityId: true, createdAt: true, metadata: true },
  });
  return rows.map((row) => ({ prospectId: row.entityId, salesRepId: demoDoneRep(row.metadata), at: row.createdAt }));
}

/** Les démos réalisées d'un commercial (`console` : dossiers sans commercial ; `null` : toutes). */
export function demoDoneFor(facts: DemoDoneFact[], commercial: string | null): DemoDoneFact[] {
  if (!commercial) return facts;
  return facts.filter((fact) => (commercial === CONSOLE_REP ? fact.salesRepId === null : fact.salesRepId === commercial));
}

/** Démonstrations marquées réalisées depuis `since`, comptées dans le journal (pas sur le dossier, dont la date s'écrase). */
export async function countDemosDoneSince(since: Date, commercial: string | null): Promise<number> {
  return demoDoneFor(await loadDemoDoneLog({ start: since }), commercial).length;
}

// ---- Résultats de l'équipe --------------------------------------------------------

export const COMMERCIAL_PERIODS = [
  { value: "30j", label: "30 jours", days: 30 },
  { value: "3m", label: "3 mois", days: 91 },
  { value: "12m", label: "12 mois", days: 365 },
  { value: "tout", label: "Depuis le début", days: null },
] as const;

export type CommercialPeriod = (typeof COMMERCIAL_PERIODS)[number];

export function resolveCommercialPeriod(value: string | null | undefined): CommercialPeriod {
  return COMMERCIAL_PERIODS.find((p) => p.value === value) ?? COMMERCIAL_PERIODS[0];
}

/** La fenêtre de la période : des `days` derniers jours jusqu'à maintenant ; sans début pour « depuis le début ». */
export type MetricsWindow = { start: Date | null; end: Date };

export function metricsWindow(period: CommercialPeriod, now: Date): MetricsWindow {
  return { start: period.days === null ? null : new Date(now.getTime() - period.days * DAY_MS), end: now };
}

/** Ce qu'il faut d'un dossier pour compter les résultats de son commercial. */
export type RepMetricsRow = {
  status: string;
  demoAt: Date | null;
  contracts: { sentAt: Date | null; finalizedAt: Date | null }[];
  pharmacy: {
    id: string;
    isDemo: boolean;
    subscription: { id: string; status: string; createdAt: Date; contractPriceCents: number | null; planMonthlyPriceCents: number; cancelAtPeriodEnd: boolean } | null;
  } | null;
};

export type RepMetrics = {
  /** Dossiers attribués (tous) et encore ouverts. */
  prospects: number;
  openProspects: number;
  /** Démonstrations réalisées dans la période, lues dans le journal (`sales.demo_done`) ; et celles encore à venir. */
  demosDone: number;
  upcomingDemos: number;
  /** Officines de ses dossiers en essai, aujourd'hui. */
  trials: number;
  /** Contrats envoyés et contrats finalisés dans la période. */
  contractsSent: number;
  signatures: number;
  /** Abonnements nés dans la période pour les officines de ses dossiers. */
  subscriptionsCreated: number;
  /** MRR de ses officines : tarifs contractuels des abonnements payants, hors démonstration et résiliation programmée. */
  mrrCents: number;
  /** Officines réelles (hors démonstration) issues de ses dossiers. */
  clients: number;
  commissions: { forecastCents: number; earnedCents: number; payableCents: number; paidCents: number };
};

function inWindow(date: Date | null | undefined, window: MetricsWindow): boolean {
  if (!date) return false;
  const t = date.getTime();
  return (window.start === null || t >= window.start.getTime()) && t <= window.end.getTime();
}

/**
 * Les résultats d'un commercial sur une période. Fonction pure : les
 * abonnements sont comptés une fois chacun (deux dossiers peuvent mener à une
 * même organisation), les officines de démonstration sont écartées, et le
 * MRR repose sur les tarifs contractuels (`mrrCents`). Les démos réalisées
 * viennent du journal (`demosDone`, une date par démo), pas du dossier : sa
 * date de démo réalisée s'efface quand une nouvelle démo est programmée. Pas
 * d'objectif : il n'en existe aucun en base, la console n'en invente pas.
 */
export function computeRepMetrics(rows: RepMetricsRow[], commissions: { status: string; amountCents: number }[], window: MetricsWindow, demosDone: Date[] = []): RepMetrics {
  const subscriptions = new Map<string, NonNullable<NonNullable<RepMetricsRow["pharmacy"]>["subscription"]>>();
  const clients = new Set<string>();
  let upcomingDemos = 0;
  let contractsSent = 0;
  let signatures = 0;
  for (const row of rows) {
    if (row.demoAt && row.demoAt.getTime() > window.end.getTime()) upcomingDemos += 1;
    for (const contract of row.contracts) {
      if (inWindow(contract.sentAt, window)) contractsSent += 1;
      if (inWindow(contract.finalizedAt, window)) signatures += 1;
    }
    if (row.pharmacy && !row.pharmacy.isDemo) {
      clients.add(row.pharmacy.id);
      if (row.pharmacy.subscription) subscriptions.set(row.pharmacy.subscription.id, row.pharmacy.subscription);
    }
  }
  const subs = [...subscriptions.values()];
  const sum = (status: string) => commissions.filter((c) => c.status === status).reduce((total, c) => total + c.amountCents, 0);
  return {
    prospects: rows.length,
    openProspects: rows.filter((row) => isOpenStatus(row.status as ProspectStatusCode)).length,
    demosDone: demosDone.filter((at) => inWindow(at, window)).length,
    upcomingDemos,
    trials: subs.filter((s) => s.status === "TRIALING").length,
    contractsSent,
    signatures,
    subscriptionsCreated: subs.filter((s) => inWindow(s.createdAt, window)).length,
    mrrCents: mrrCents(subs.map((s) => ({ status: s.status, contractPriceCents: s.contractPriceCents, planMonthlyPriceCents: s.planMonthlyPriceCents, cancelAtPeriodEnd: s.cancelAtPeriodEnd }))),
    clients: clients.size,
    commissions: { forecastCents: sum("FORECAST"), earnedCents: sum("EARNED"), payableCents: sum("PAYABLE"), paidCents: sum("PAID") },
  };
}

const METRIC_ROW_SELECT = {
  salesRepId: true,
  status: true,
  demoAt: true,
  contracts: { select: { sentAt: true, finalizedAt: true } },
  pharmacy: {
    select: {
      id: true,
      isDemo: true,
      organization: { select: { subscription: { select: { id: true, status: true, createdAt: true, contractPriceCents: true, cancelAtPeriodEnd: true, plan: { select: { monthlyPriceCents: true } } } } } },
    },
  },
} satisfies Prisma.ProspectSelect;

type MetricRowRecord = Prisma.ProspectGetPayload<{ select: typeof METRIC_ROW_SELECT }>;

function toMetricsRow(record: MetricRowRecord): RepMetricsRow {
  const subscription = record.pharmacy?.organization.subscription ?? null;
  return {
    status: record.status,
    demoAt: record.demoAt,
    contracts: record.contracts,
    pharmacy: record.pharmacy
      ? {
          id: record.pharmacy.id,
          isDemo: record.pharmacy.isDemo,
          subscription: subscription ? { id: subscription.id, status: subscription.status, createdAt: subscription.createdAt, contractPriceCents: subscription.contractPriceCents, planMonthlyPriceCents: subscription.plan.monthlyPriceCents, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
        }
      : null,
  };
}

/** Les résultats de chaque commercial, des dossiers de la console et de l'ensemble : quatre requêtes, quel que soit l'effectif. */
export async function teamMetrics(period: CommercialPeriod, now: Date = new Date()) {
  const window = metricsWindow(period, now);
  const [reps, records, commissionSums, demosDone] = await Promise.all([
    prisma.salesRep.findMany({
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, zone: true, isActive: true, invitedAt: true, lastLoginAt: true, commissionType: true, commissionValue: true },
    }),
    prisma.prospect.findMany({ select: METRIC_ROW_SELECT }),
    prisma.commission.groupBy({ by: ["salesRepId", "status"], _sum: { amountCents: true } }),
    loadDemoDoneLog(window),
  ]);
  const doneDates = (facts: DemoDoneFact[]) => facts.map((fact) => fact.at);
  const byRep = new Map<string, RepMetricsRow[]>();
  const repRows: RepMetricsRow[] = [];
  const consoleRows: RepMetricsRow[] = [];
  for (const record of records) {
    const row = toMetricsRow(record);
    if (!record.salesRepId) {
      consoleRows.push(row);
      continue;
    }
    repRows.push(row);
    byRep.set(record.salesRepId, [...(byRep.get(record.salesRepId) ?? []), row]);
  }
  const sums = commissionSums.map((row) => ({ salesRepId: row.salesRepId, status: row.status, amountCents: row._sum.amountCents ?? 0 }));
  return {
    window,
    reps: reps.map((rep) => ({ rep, metrics: computeRepMetrics(byRep.get(rep.id) ?? [], sums.filter((s) => s.salesRepId === rep.id), window, doneDates(demoDoneFor(demosDone, rep.id))) })),
    /** L'équipe commerciale : les dossiers suivis par un commercial. */
    team: computeRepMetrics(repRows, sums, window, doneDates(demosDone.filter((fact) => fact.salesRepId !== null))),
    /** Les dossiers tenus par la console, sans commercial (pas de commission). */
    console: computeRepMetrics(consoleRows, [], window, doneDates(demoDoneFor(demosDone, CONSOLE_REP))),
  };
}

/** Les résultats d'un commercial sur la période. */
export async function repMetrics(repId: string, period: CommercialPeriod, now: Date = new Date()): Promise<RepMetrics> {
  const window = metricsWindow(period, now);
  const [records, commissionSums, demosDone] = await Promise.all([
    prisma.prospect.findMany({ where: { salesRepId: repId }, select: METRIC_ROW_SELECT }),
    prisma.commission.groupBy({ by: ["status"], where: { salesRepId: repId }, _sum: { amountCents: true } }),
    loadDemoDoneLog(window),
  ]);
  return computeRepMetrics(records.map(toMetricsRow), commissionSums.map((row) => ({ status: row.status, amountCents: row._sum.amountCents ?? 0 })), window, demoDoneFor(demosDone, repId).map((fact) => fact.at));
}

/** Le portefeuille d'un commercial : ses dossiers, ses clients, ses commissions, l'activité récente. */
export async function repPortfolio(repId: string) {
  const [prospects, commissions, events] = await Promise.all([
    prisma.prospect.findMany({
      where: { salesRepId: repId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        nextActionAt: true,
        nextActionLabel: true,
        demoAt: true,
        demoDoneAt: true,
        monthlyPriceCents: true,
        updatedAt: true,
        contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
        pharmacy: {
          select: {
            id: true,
            name: true,
            city: true,
            isDemo: true,
            isActive: true,
            organization: { select: { subscription: { select: { status: true, trialEndsAt: true, contractPriceCents: true, cancelAtPeriodEnd: true, plan: { select: { name: true, monthlyPriceCents: true } } } } } },
          },
        },
      },
    }),
    prisma.commission.findMany({ where: { salesRepId: repId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, type: true, amountCents: true, status: true, dueAt: true, paidAt: true, note: true, createdAt: true, prospect: { select: { id: true, name: true } } } }),
    prisma.prospectEvent.findMany({ where: { prospect: { salesRepId: repId } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, type: true, summary: true, actorLabel: true, createdAt: true, prospect: { select: { id: true, name: true } } } }),
  ]);
  return { prospects, commissions, events };
}
