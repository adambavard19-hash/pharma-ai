import "server-only";
import { prisma } from "@/server/db/client";
import { contractualPrice, catalogDiffers, mrrCents, type PriceSource } from "@/core/billing/contract-price";
import { hasUnpaidFailure, resolveRules, type ResolvedRule } from "@/core/admin/automations";
import { CANCELLATION_STATUSES, isOpenCancellation, type CancellationStatusCode, type StatusLabel } from "@/core/admin/statuses";
import { formatEuros, formatFrenchDate, trialEndingSoon } from "@/core/billing/subscription";
import { firstCancellationByKey, isWithin, periodRange, type CockpitPeriod, type DateRange } from "@/core/admin/metrics";
import type { Prisma } from "@/generated/prisma";

/**
 * L'espace Facturation de la console, en lecture : abonnements, catalogue,
 * paiements, impayés, résiliations. Les règles de classement sont des
 * fonctions pures, exportées et testées ; les requêtes ne lisent que des
 * données business (aucune table clinique).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Seuils communs à toute la console. */
export const TRIAL_ENDING_DAYS = 7;

// ================================================================ Classement des abonnements

export const SUBSCRIPTION_FILTERS = [
  { key: "essai", label: "En essai" },
  { key: "actifs", label: "Actifs" },
  { key: "retard", label: "En retard de paiement" },
  { key: "resiliation", label: "Résiliation demandée" },
  { key: "resilies", label: "Résiliés" },
  { key: "suspendus", label: "Suspendus" },
  { key: "fin-essai", label: "Fin d'essai sous 7 jours" },
  { key: "nouveaux", label: "Nouveaux" },
] as const;

export type SubscriptionFilterKey = (typeof SUBSCRIPTION_FILTERS)[number]["key"];

/**
 * La période des filtres « Nouveaux » et « Résiliés » (`?periode=`), celle du
 * cockpit. « Nouveaux » sans période prend la période par défaut du cockpit ;
 * « Résiliés » sans période garde son sens historique (abonnement terminé).
 */
export const DEFAULT_SUBSCRIPTION_PERIOD: CockpitPeriod = { value: "30j", days: 30 };

/** Anciennes adresses encore en circulation (liens, favoris) : elles continuent de filtrer. */
export const LEGACY_SUBSCRIPTION_FILTERS = {
  impayes: { label: "En retard de paiement", alias: "retard" },
  "contrats-envoyes": { label: "Contrats envoyés", alias: null },
  "contrats-attente": { label: "Contrats en attente", alias: null },
  "contrats-signes": { label: "Contrats signés", alias: null },
  invites: { label: "Invitations envoyées", alias: null },
} as const satisfies Record<string, { label: string; alias: SubscriptionFilterKey | null }>;

export type LegacySubscriptionFilterKey = keyof typeof LEGACY_SUBSCRIPTION_FILTERS;

/** Ce qu'il faut savoir d'une officine pour la ranger dans les filtres. `status` nul : aucun abonnement. */
export type SubscriptionClassInput = {
  status: string | null;
  trialEndsAt: Date | null;
  lastPaymentAt: Date | null;
  lastPaymentFailedAt: Date | null;
  suspendedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  hasOpenCancellation: boolean;
  contractStatus: string | null;
  inviteSentAt: Date | null;
  inviteCompletedAt: Date | null;
  /** Création de l'abonnement (filtre « Nouveaux »). */
  subscriptionCreatedAt?: Date | null;
  /** Départ du client : première date entre fin chez Stripe et demande de résiliation confirmée (filtre « Résiliés » sur une période). */
  departureAt?: Date | null;
};

const ENDED = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

/** Ce que les tests de filtre lisent en plus de l'officine : l'instant, et les bornes de période calculées une fois. */
type ClassContext = { now: Date; created: DateRange; departed: DateRange | null };

function classContext(now: Date, period: CockpitPeriod | null | undefined): ClassContext {
  return { now, created: periodRange(period ?? DEFAULT_SUBSCRIPTION_PERIOD, now), departed: period ? periodRange(period, now) : null };
}

/** L'abonnement est en retard : statut Stripe d'impayé, ou échec de paiement non suivi d'un paiement réussi. */
export function isLatePayment(input: Pick<SubscriptionClassInput, "status" | "lastPaymentAt" | "lastPaymentFailedAt">): boolean {
  if (!input.status) return false;
  if (input.status === "PAST_DUE" || input.status === "UNPAID") return true;
  return hasUnpaidFailure({ status: input.status, lastPaymentAt: input.lastPaymentAt, lastPaymentFailedAt: input.lastPaymentFailedAt });
}

const SUBSCRIPTION_TESTS: Record<SubscriptionFilterKey, (input: SubscriptionClassInput, ctx: ClassContext) => boolean> = {
  essai: (r) => r.status === "TRIALING",
  actifs: (r) => r.status === "ACTIVE",
  retard: (r) => isLatePayment(r),
  // Une demande ouverte compte toujours ; une fin programmée chez Stripe, tant que l'abonnement court encore.
  resiliation: (r) => r.hasOpenCancellation || (r.cancelAtPeriodEnd && r.status !== null && !ENDED.has(r.status)),
  // Sur une période : les départs de la période, comme la tuile « Résiliations » du cockpit. Sans période : les abonnements terminés.
  resilies: (r, ctx) => (ctx.departed ? isWithin(r.departureAt, ctx.departed) : r.status !== null && ENDED.has(r.status)),
  suspendus: (r) => r.suspendedAt !== null || r.status === "SUSPENDED",
  "fin-essai": (r, ctx) => r.status === "TRIALING" && trialEndingSoon(r.trialEndsAt, ctx.now, TRIAL_ENDING_DAYS),
  // Créés sur la période, comme la tuile « Nouveaux abonnements » du cockpit.
  nouveaux: (r, ctx) => isWithin(r.subscriptionCreatedAt, ctx.created),
};

const LEGACY_TESTS: Record<Exclude<LegacySubscriptionFilterKey, "impayes">, (input: SubscriptionClassInput) => boolean> = {
  "contrats-envoyes": (r) => r.contractStatus === "SENT" || r.contractStatus === "OPENED",
  "contrats-attente": (r) => r.contractStatus === null || ["DRAFT", "SENT", "OPENED", "SIGNED_PHARMACY"].includes(r.contractStatus),
  "contrats-signes": (r) => r.contractStatus === "FINALIZED",
  invites: (r) => r.status === null && r.inviteSentAt !== null && r.inviteCompletedAt === null,
};

function classifyIn(input: SubscriptionClassInput, ctx: ClassContext): SubscriptionFilterKey[] {
  return SUBSCRIPTION_FILTERS.map((f) => f.key).filter((key) => SUBSCRIPTION_TESTS[key](input, ctx));
}

/** Tous les filtres (du contrat d'adresses) auxquels appartient une officine, pour la période des filtres datés. */
export function classifySubscription(input: SubscriptionClassInput, now: Date, period: CockpitPeriod | null = null): SubscriptionFilterKey[] {
  return classifyIn(input, classContext(now, period));
}

export type ResolvedSubscriptionFilter = { key: string; label: string; legacy: boolean };

/** La valeur de `?filtre=` : un filtre du contrat, une ancienne valeur, ou rien (inconnue = aucun filtre). */
export function resolveSubscriptionFilter(value: string | null | undefined): ResolvedSubscriptionFilter | null {
  if (!value) return null;
  const current = SUBSCRIPTION_FILTERS.find((f) => f.key === value);
  if (current) return { key: current.key, label: current.label, legacy: false };
  if (value in LEGACY_SUBSCRIPTION_FILTERS) {
    const legacy = LEGACY_SUBSCRIPTION_FILTERS[value as LegacySubscriptionFilterKey];
    if (legacy.alias) {
      const target = SUBSCRIPTION_FILTERS.find((f) => f.key === legacy.alias)!;
      return { key: target.key, label: target.label, legacy: false };
    }
    return { key: value, label: legacy.label, legacy: true };
  }
  return null;
}

export function matchesSubscriptionFilter(filterKey: string, input: SubscriptionClassInput, now: Date, period: CockpitPeriod | null = null): boolean {
  const resolved = resolveSubscriptionFilter(filterKey);
  if (!resolved) return true;
  if (resolved.key in SUBSCRIPTION_TESTS) return SUBSCRIPTION_TESTS[resolved.key as SubscriptionFilterKey](input, classContext(now, period));
  if (resolved.key in LEGACY_TESTS) return LEGACY_TESTS[resolved.key as keyof typeof LEGACY_TESTS](input);
  return true;
}

/** Compteurs par filtre, sur la liste déjà cherchée : le chiffre dit ce qu'on trouvera. */
export function countSubscriptionFilters(inputs: SubscriptionClassInput[], now: Date, period: CockpitPeriod | null = null): Record<SubscriptionFilterKey, number> {
  const counts = Object.fromEntries(SUBSCRIPTION_FILTERS.map((f) => [f.key, 0])) as Record<SubscriptionFilterKey, number>;
  const ctx = classContext(now, period);
  for (const input of inputs) for (const key of classifyIn(input, ctx)) counts[key] += 1;
  return counts;
}

// ================================================================ Petites règles d'affichage

/** L'état du paiement, en une pastille : échec non régularisé, dernier paiement réussi, ou rien encore. */
export function paymentState(input: { status: string | null; lastPaymentAt: Date | null; lastPaymentCents: number | null; lastPaymentFailedAt: Date | null }): StatusLabel & { detail: string | null } {
  if (input.status && hasUnpaidFailure({ status: input.status, lastPaymentAt: input.lastPaymentAt, lastPaymentFailedAt: input.lastPaymentFailedAt })) {
    return { label: "Échec non régularisé", tone: "danger", detail: `depuis le ${formatFrenchDate(input.lastPaymentFailedAt!)}` };
  }
  if (input.lastPaymentAt) {
    return { label: "À jour", tone: "success", detail: `${input.lastPaymentCents ? `${formatEuros(input.lastPaymentCents)} ` : ""}le ${formatFrenchDate(input.lastPaymentAt)}` };
  }
  return { label: "Aucun paiement", tone: "neutral", detail: null };
}

/** Jours entiers écoulés depuis une date (0 le jour même). */
export function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

/** Écart entre tarif contractuel et tarif catalogue : en centimes et en pourcentage du catalogue. */
export function priceGap(contractCents: number, catalogCents: number): { diffCents: number; percent: number | null } {
  const diffCents = contractCents - catalogCents;
  return { diffCents, percent: catalogCents > 0 ? Math.round((diffCents / catalogCents) * 1000) / 10 : null };
}

/** Recherche tolérante : sans accents, sans casse, chaque mot doit se retrouver quelque part. */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesQuery(query: string | null | undefined, fields: (string | null | undefined)[]): boolean {
  const q = query ? normalizeSearch(query) : "";
  if (!q) return true;
  const haystack = normalizeSearch(fields.filter(Boolean).join(" "));
  return q.split(" ").every((word) => haystack.includes(word));
}

// ---------------------------------------------------------------- Paiements

export const PAYMENT_FILTERS = [
  { key: "paye", label: "Payées", statuses: ["PAID"] },
  { key: "echoue", label: "Échouées", statuses: ["FAILED", "UNCOLLECTIBLE"] },
  { key: "en-attente", label: "En attente", statuses: ["OPEN", "DRAFT"] },
] as const;

export function paymentFilterStatuses(value: string | null | undefined): string[] | null {
  const filter = PAYMENT_FILTERS.find((f) => f.key === value);
  return filter ? [...filter.statuses] : null;
}

/** Les totaux d'une période : encaissé (payées), en échec (échouées, irrécouvrables), en attente. */
export function paymentTotals(rows: { status: string; amountCents: number }[]): { paidCents: number; failedCents: number; openCents: number; paidCount: number; failedCount: number; openCount: number } {
  const totals = { paidCents: 0, failedCents: 0, openCents: 0, paidCount: 0, failedCount: 0, openCount: 0 };
  for (const row of rows) {
    if (row.status === "PAID") {
      totals.paidCents += row.amountCents;
      totals.paidCount += 1;
    } else if (row.status === "FAILED" || row.status === "UNCOLLECTIBLE") {
      totals.failedCents += row.amountCents;
      totals.failedCount += 1;
    } else if (row.status === "OPEN" || row.status === "DRAFT") {
      totals.openCents += row.amountCents;
      totals.openCount += 1;
    }
  }
  return totals;
}

// ---------------------------------------------------------------- Résiliations

export const CANCELLATION_FILTERS = [
  { key: "ouvertes", label: "Ouvertes", statuses: ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] },
  { key: "recues", label: "Reçues", statuses: ["RECEIVED"] },
  { key: "en-traitement", label: "En traitement", statuses: ["IN_PROGRESS"] },
  { key: "confirmees", label: "Confirmées", statuses: ["CONFIRMED"] },
  { key: "annulees", label: "Annulées", statuses: ["CANCELED"] },
  { key: "terminees", label: "Terminées", statuses: ["COMPLETED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly CancellationStatusCode[] }[];

export function cancellationFilterStatuses(value: string | null | undefined): CancellationStatusCode[] | null {
  const filter = CANCELLATION_FILTERS.find((f) => f.key === value);
  return filter ? [...filter.statuses] : null;
}

export function countCancellationFilters(statuses: string[]): Record<string, number> {
  return Object.fromEntries(CANCELLATION_FILTERS.map((f) => [f.key, statuses.filter((s) => (f.statuses as readonly string[]).includes(s)).length]));
}

export function isCancellationStatus(value: string): value is CancellationStatusCode {
  return (CANCELLATION_STATUSES as readonly string[]).includes(value);
}

// ================================================================ Lectures

const OPEN_CANCELLATION_STATUSES: CancellationStatusCode[] = ["RECEIVED", "IN_PROGRESS", "CONFIRMED"];

/**
 * Les demandes de résiliation qui valent départ : confirmées ou terminées,
 * datées, hors démonstration. Le cockpit (tuile « Résiliations ») lit la même
 * règle.
 */
export const CONFIRMED_CANCELLATION_WHERE = {
  status: { in: ["CONFIRMED", "COMPLETED"] },
  confirmedAt: { not: null },
  pharmacy: { isDemo: false },
} satisfies Prisma.CancellationRequestWhereInput;

function adminName(admin: { firstName: string; lastName: string } | undefined | null): string | null {
  return admin ? `${admin.firstName} ${admin.lastName}`.trim() : null;
}

/** Les noms des administrateurs cités dans une page, en une requête. */
export async function adminNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const admins = await prisma.platformAdmin.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(admins.map((a) => [a.id, adminName(a) ?? a.id]));
}

const LIST_SELECT = {
  id: true,
  name: true,
  city: true,
  isActive: true,
  organizationId: true,
  organization: {
    select: {
      subscription: {
        select: {
          id: true, status: true, contractPriceCents: true, trialStartsAt: true, trialEndsAt: true, nextInvoiceAt: true, currentPeriodEnd: true,
          cancelAtPeriodEnd: true, suspendedAt: true, lastPaymentAt: true, lastPaymentCents: true, lastPaymentFailedAt: true, createdAt: true, canceledAt: true, stripeSubscriptionId: true,
          plan: { select: { id: true, name: true, monthlyPriceCents: true } },
        },
      },
    },
  },
  contracts: { orderBy: { version: "desc" as const }, take: 1, select: { status: true } },
  prospect: { select: { contracts: { orderBy: { version: "desc" as const }, take: 1, select: { status: true } } } },
  subscriptionInvites: { orderBy: { createdAt: "desc" as const }, take: 1, select: { sentAt: true, completedAt: true } },
  memberships: { where: { role: "OWNER" as const, isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } },
  cancellationRequests: { where: { status: { in: OPEN_CANCELLATION_STATUSES } }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, status: true } },
} satisfies Prisma.PharmacySelect;

type ListPharmacy = Prisma.PharmacyGetPayload<{ select: typeof LIST_SELECT }>;

export type SubscriptionListRow = {
  pharmacyId: string;
  pharmacyName: string;
  city: string | null;
  isActive: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  subscription: {
    id: string;
    status: string;
    planName: string;
    price: { cents: number; source: PriceSource };
    catalogCents: number;
    differs: boolean;
    startedAt: Date;
    trialEndsAt: Date | null;
    nextInvoiceAt: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeLinked: boolean;
  } | null;
  payment: ReturnType<typeof paymentState>;
  openCancellation: { id: string; status: string } | null;
  classInput: SubscriptionClassInput;
};

function toListRow(p: ListPharmacy, departures: Map<string, Date>): SubscriptionListRow {
  const sub = p.organization.subscription;
  const owner = p.memberships[0]?.user ?? null;
  const contractStatus = p.contracts[0]?.status ?? p.prospect?.contracts[0]?.status ?? null;
  const invite = p.subscriptionInvites[0] ?? null;
  const openCancellation = p.cancellationRequests[0] ?? null;
  const classInput: SubscriptionClassInput = {
    status: sub?.status ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
    lastPaymentAt: sub?.lastPaymentAt ?? null,
    lastPaymentFailedAt: sub?.lastPaymentFailedAt ?? null,
    suspendedAt: sub?.suspendedAt ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    hasOpenCancellation: openCancellation !== null,
    contractStatus,
    inviteSentAt: invite?.sentAt ?? null,
    inviteCompletedAt: invite?.completedAt ?? null,
    subscriptionCreatedAt: sub?.createdAt ?? null,
    departureAt: departures.get(p.organizationId) ?? null,
  };
  return {
    pharmacyId: p.id,
    pharmacyName: p.name,
    city: p.city,
    isActive: p.isActive,
    ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
    ownerEmail: owner?.email ?? null,
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          planName: sub.plan.name,
          price: contractualPrice(sub, sub.plan),
          catalogCents: sub.plan.monthlyPriceCents,
          differs: catalogDiffers(sub, sub.plan),
          startedAt: sub.trialStartsAt ?? sub.createdAt,
          trialEndsAt: sub.trialEndsAt,
          nextInvoiceAt: sub.status === "CANCELED" ? null : sub.nextInvoiceAt,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          stripeLinked: Boolean(sub.stripeSubscriptionId),
        }
      : null,
    payment: paymentState({ status: sub?.status ?? null, lastPaymentAt: sub?.lastPaymentAt ?? null, lastPaymentCents: sub?.lastPaymentCents ?? null, lastPaymentFailedAt: sub?.lastPaymentFailedAt ?? null }),
    openCancellation,
    classInput,
  };
}

/**
 * Toutes les officines réelles (hors démonstration), avec leur abonnement s'il
 * existe, et la date de départ de leur organisation : fin chez Stripe ou
 * demande confirmée, la première des deux, comme au cockpit (une officine
 * a sa propre organisation).
 */
export async function listSubscriptionRows(): Promise<SubscriptionListRow[]> {
  const [pharmacies, confirmed] = await Promise.all([
    prisma.pharmacy.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: LIST_SELECT }),
    prisma.cancellationRequest.findMany({ where: CONFIRMED_CANCELLATION_WHERE, select: { organizationId: true, confirmedAt: true } }),
  ]);
  const departures = firstCancellationByKey([
    ...pharmacies.flatMap((p) => (p.organization.subscription?.canceledAt ? [{ key: p.organizationId, at: p.organization.subscription.canceledAt }] : [])),
    ...confirmed.map((request) => ({ key: request.organizationId, at: request.confirmedAt })),
  ]);
  return pharmacies.map((p) => toListRow(p, departures));
}

/** Le MRR contractuel affiché en tête de la liste : la règle du MRR du cockpit (actifs et en retard, hors fin programmée). */
export function subscriptionListMrrCents(rows: SubscriptionListRow[]): number {
  return mrrCents(
    rows.flatMap((r) => (r.subscription ? [{ status: r.subscription.status, contractPriceCents: r.subscription.price.source === "CONTRACT" ? r.subscription.price.cents : null, planMonthlyPriceCents: r.subscription.catalogCents, cancelAtPeriodEnd: r.subscription.cancelAtPeriodEnd }] : [])),
  );
}

// ---------------------------------------------------------------- Catalogue

const ONGOING_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "UNPAID", "PAUSED", "INCOMPLETE", "SUSPENDED"] as const;

/** Par offre : abonnements en cours, et combien paient un tarif contractuel différent du catalogue. */
export async function planSubscriptionStats(): Promise<Map<string, { ongoing: number; differing: number; contracts: number }>> {
  const [subscriptions, contracts] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: [...ONGOING_STATUSES] }, organization: { pharmacies: { some: { isDemo: false } } } },
      select: { planId: true, contractPriceCents: true, plan: { select: { monthlyPriceCents: true } } },
    }),
    prisma.contract.groupBy({ by: ["planId"], _count: { _all: true } }),
  ]);
  const stats = new Map<string, { ongoing: number; differing: number; contracts: number }>();
  const entry = (planId: string) => {
    let current = stats.get(planId);
    if (!current) {
      current = { ongoing: 0, differing: 0, contracts: 0 };
      stats.set(planId, current);
    }
    return current;
  };
  for (const sub of subscriptions) {
    const e = entry(sub.planId);
    e.ongoing += 1;
    if (catalogDiffers(sub, sub.plan)) e.differing += 1;
  }
  for (const row of contracts) if (row.planId) entry(row.planId).contracts = row._count._all;
  return stats;
}

// ---------------------------------------------------------------- Fiche abonnement

/** Ce que la fiche abonnement lit en plus de `getPharmacyBilling` : tarif, résiliations, historique. */
export async function getSubscriptionDetail(pharmacyId: string, organizationId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: {
      plan: true,
      priceChanges: { orderBy: { createdAt: "desc" }, take: 30 },
      payments: { orderBy: { createdAt: "desc" }, take: 24 },
    },
  });
  const [contracts, invites, cancellations, billingEvents, accessAudits] = await Promise.all([
    prisma.contract.findMany({ where: { OR: [{ pharmacyId }, { prospect: { pharmacyId } }] }, orderBy: { version: "desc" }, include: { plan: { select: { name: true } } } }),
    prisma.subscriptionInvite.findMany({ where: { pharmacyId }, orderBy: { createdAt: "desc" }, take: 10, include: { plan: { select: { name: true } } } }),
    prisma.cancellationRequest.findMany({ where: { pharmacyId }, orderBy: { createdAt: "desc" }, include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.billingEvent.findMany({ where: { OR: [{ organizationId }, { pharmacyId }] }, orderBy: { receivedAt: "desc" }, take: 80 }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Pharmacy", entityId: pharmacyId, action: { in: ["billing.access_suspended", "billing.access_restored"] } },
          ...(subscription?.stripeSubscriptionId ? [{ entityType: "Subscription", entityId: subscription.stripeSubscriptionId, action: { in: ["billing.cancel_scheduled", "billing.cancel_revoked"] } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, createdAt: true, platformAdminId: true, metadata: true },
    }),
  ]);
  const names = await adminNames([
    ...(subscription?.priceChanges.map((c) => c.changedByAdminId) ?? []),
    ...accessAudits.map((a) => a.platformAdminId),
  ]);
  return { subscription, contracts, invites, cancellations, billingEvents, accessAudits, names };
}

// ---------------------------------------------------------------- Paiements

/** Les factures reçues sur les `days` derniers jours (créées, payées ou échouées dans la période). */
export async function listPayments(input: { statuses: string[] | null; days: number }) {
  const since = new Date(Date.now() - input.days * DAY_MS);
  const inPeriod: Prisma.BillingPaymentWhereInput = { OR: [{ createdAt: { gte: since } }, { paidAt: { gte: since } }, { failedAt: { gte: since } }] };
  const [rows, all] = await Promise.all([
    prisma.billingPayment.findMany({
      where: { AND: [inPeriod, input.statuses ? { status: { in: input.statuses } } : {}] },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { subscription: { select: { organization: { select: { pharmacies: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true, city: true } } } }, plan: { select: { name: true } } } } },
    }),
    prisma.billingPayment.findMany({ where: inPeriod, select: { status: true, amountCents: true } }),
  ]);
  return { rows, all };
}

// ---------------------------------------------------------------- Impayés

export const PAYMENT_RULE_KEYS = ["payment.reminder_1", "payment.reminder_2", "payment.internal_alert"] as const;

export type UnpaidRow = {
  subscriptionId: string;
  pharmacyId: string | null;
  pharmacyName: string;
  city: string | null;
  status: string;
  planName: string;
  failedCents: number | null;
  failedAt: Date | null;
  daysLate: number | null;
  attemptCount: number | null;
  hostedInvoiceUrl: string | null;
  dispatches: { id: string; ruleKey: string; status: string; createdAt: Date; recipient: string | null }[];
  manualReminders: number;
  suspended: boolean;
};

/** Les impayés : statut Stripe d'impayé, ou dernier échec non suivi d'un paiement réussi. */
export async function listUnpaid(now: Date): Promise<UnpaidRow[]> {
  const candidates = await prisma.subscription.findMany({
    where: { OR: [{ status: { in: ["PAST_DUE", "UNPAID"] } }, { lastPaymentFailedAt: { not: null } }] },
    select: {
      id: true, status: true, lastPaymentAt: true, lastPaymentFailedAt: true, suspendedAt: true,
      plan: { select: { name: true } },
      organization: { select: { pharmacies: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true, city: true, isDemo: true } } } },
      payments: { where: { status: { in: ["FAILED", "OPEN", "UNCOLLECTIBLE"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { amountCents: true, failedAt: true, createdAt: true, attemptCount: true, hostedInvoiceUrl: true } },
    },
  });
  const unpaid = candidates.filter((s) => isLatePayment(s) && !s.organization.pharmacies[0]?.isDemo);
  if (unpaid.length === 0) return [];
  const pharmacyIds = unpaid.map((s) => s.organization.pharmacies[0]?.id).filter((id): id is string => Boolean(id));
  const [dispatches, manual] = await Promise.all([
    prisma.automationDispatch.findMany({ where: { ruleKey: { in: [...PAYMENT_RULE_KEYS] }, targetType: "Subscription", targetId: { in: unpaid.map((s) => s.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, ruleKey: true, status: true, createdAt: true, recipient: true, targetId: true } }),
    prisma.emailDispatch.findMany({ where: { pharmacyId: { in: pharmacyIds }, trigger: "MANUAL", templateKey: { in: ["payment.failed_reminder", "payment.unpaid_final"] } }, select: { pharmacyId: true, createdAt: true } }),
  ]);
  return unpaid
    .map((s) => {
      const pharmacy = s.organization.pharmacies[0] ?? null;
      const payment = s.payments[0] ?? null;
      const failedAt = s.lastPaymentFailedAt ?? payment?.failedAt ?? payment?.createdAt ?? null;
      return {
        subscriptionId: s.id,
        pharmacyId: pharmacy?.id ?? null,
        pharmacyName: pharmacy?.name ?? "Organisation sans officine",
        city: pharmacy?.city ?? null,
        status: s.status,
        planName: s.plan.name,
        failedCents: payment?.amountCents ?? null,
        failedAt,
        daysLate: failedAt ? daysSince(failedAt, now) : null,
        attemptCount: payment?.attemptCount ?? null,
        hostedInvoiceUrl: payment?.hostedInvoiceUrl ?? null,
        dispatches: dispatches.filter((d) => d.targetId === s.id),
        manualReminders: manual.filter((m) => m.pharmacyId === pharmacy?.id && (!failedAt || m.createdAt >= failedAt)).length,
        suspended: Boolean(s.suspendedAt),
      };
    })
    .sort((a, b) => (b.daysLate ?? -1) - (a.daysLate ?? -1));
}

/** L'état des relances automatiques de paiement : réglage en base, ou désactivées par défaut. */
export async function paymentAutomationRules(): Promise<ResolvedRule[]> {
  const stored = await prisma.automationRule.findMany({ where: { key: { in: [...PAYMENT_RULE_KEYS] } }, select: { key: true, enabled: true, offsetDays: true } });
  return resolveRules(stored).filter((rule) => (PAYMENT_RULE_KEYS as readonly string[]).includes(rule.key));
}

// ---------------------------------------------------------------- Résiliations

const CANCELLATION_LIST_INCLUDE = {
  pharmacy: { select: { id: true, name: true, city: true } },
  subscription: { select: { id: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeSubscriptionId: true, plan: { select: { name: true } } } },
} satisfies Prisma.CancellationRequestInclude;

export async function listCancellations(input: { statuses: CancellationStatusCode[] | null }) {
  const [rows, statuses] = await Promise.all([
    prisma.cancellationRequest.findMany({ where: input.statuses ? { status: { in: input.statuses } } : {}, orderBy: { requestedAt: "desc" }, take: 300, include: CANCELLATION_LIST_INCLUDE }),
    prisma.cancellationRequest.findMany({ select: { status: true } }),
  ]);
  return { rows, statuses: statuses.map((s) => s.status as string) };
}

export async function getCancellation(id: string) {
  const request = await prisma.cancellationRequest.findUnique({
    where: { id },
    include: {
      ...CANCELLATION_LIST_INCLUDE,
      subscription: { select: { id: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, cancelAt: true, stripeSubscriptionId: true, contractPriceCents: true, plan: { select: { name: true, monthlyPriceCents: true } } } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!request) return null;
  // Les e-mails de résiliation partis pour cette officine depuis la demande (manuels ou automatiques).
  const emails = await prisma.emailDispatch.findMany({
    where: { pharmacyId: request.pharmacyId, templateKey: { in: ["cancellation.received", "cancellation.confirmed"] }, createdAt: { gte: new Date(request.requestedAt.getTime() - DAY_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true, recipient: true, status: true, trigger: true, createdAt: true, sentByAdminId: true, templateKey: true },
  });
  const names = await adminNames([...request.events.map((e) => e.actorAdminId), ...emails.map((e) => e.sentByAdminId), request.createdByAdminId]);
  return { request, emails, names };
}

/** Une date en « AAAA-MM-JJ » à Paris, pour pré-remplir un champ date. */
export function dayInParis(date: Date | null | undefined): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type CancellationCandidate = { id: string; name: string; city: string | null; hasOpenRequest: boolean; hasSubscription: boolean; suggestedEndAt: string | null };

/**
 * Les officines proposées à la création d'une demande : réelles, avec la
 * mention d'une demande déjà ouverte, et la fin suggérée (fin de la période
 * en cours de leur abonnement).
 */
export async function cancellationCandidates(): Promise<CancellationCandidate[]> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isDemo: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, organization: { select: { subscription: { select: { id: true, currentPeriodEnd: true, status: true } } } }, cancellationRequests: { where: { status: { in: OPEN_CANCELLATION_STATUSES } }, take: 1, select: { id: true } } },
  });
  return pharmacies.map((p) => {
    const sub = p.organization.subscription;
    return { id: p.id, name: p.name, city: p.city, hasOpenRequest: p.cancellationRequests.length > 0, hasSubscription: Boolean(sub), suggestedEndAt: sub && !ENDED.has(sub.status) ? dayInParis(sub.currentPeriodEnd) : null };
  });
}

export { isOpenCancellation };
