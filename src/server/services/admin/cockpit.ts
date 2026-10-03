import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { contractualPrice, mrrCents } from "@/core/billing/contract-price";
import { formatEuros, trialEndingSoon } from "@/core/billing/subscription";
import { DEMO_TASK_LABEL } from "@/core/sales/board";
import { contractCounters, REAL_CONTRACT } from "@/server/services/admin/contracts-admin";
import { CONFIRMED_CANCELLATION_WHERE } from "@/server/services/admin/billing-admin";
import {
  buckets,
  cancellationDates,
  connectorNeedsAttention,
  CONTRACT_EXPIRY_WINDOW_DAYS,
  countsAsIncident,
  countSeries,
  daysBefore,
  granularityOf,
  INACTIVE_AFTER_DAYS,
  isPaymentLate,
  isWithin,
  mrrSeries,
  NO_REPLY_AFTER_DAYS,
  periodRange,
  sortTodayItems,
  todayRange,
  conversionRate,
  TRIAL_ENDING_SOON_DAYS,
  upcomingDaysRange,
  type CancellationFact,
  type CockpitPeriod,
  type Granularity,
  type MrrSubscriptionFact,
  type PaymentFact,
  type PriceChangeFact,
  type SeriesPoint,
  type TodayItem,
  type TrialConversion,
} from "@/core/admin/metrics";

/**
 * Les chargeurs du cockpit dirigeant (/admin).
 *
 * Données business uniquement : abonnements, contrats, dossiers commerciaux,
 * connexions, état technique. Aucune table clinique n'est lue ici (ni
 * patients, ni ordonnances, ni analyses) : la console n'en a pas besoin et
 * n'y a pas accès.
 *
 * Les officines de démonstration sont exclues partout. Chaque chargeur lance
 * ses requêtes en parallèle ; les faits partagés (abonnements, contrats,
 * résiliations confirmées) ne sont lus qu'une fois par requête HTTP grâce à
 * `cache`.
 *
 * Chaque chiffre se retrouve tel quel dans la liste qu'il ouvre : les
 * compteurs de contrats viennent du centre des contrats (`contractCounters`),
 * les départs suivent la règle de la liste des abonnements
 * (`CONFIRMED_CANCELLATION_WHERE`).
 */

// ---------------------------------------------------------------- Hors démonstration

const REAL_SUBSCRIPTION = { organization: { pharmacies: { some: { isDemo: false } } } } satisfies Prisma.SubscriptionWhereInput;

/** Un dossier sans officine n'est pas une démonstration ; avec, il suit son officine. */
const REAL_PROSPECT = { OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] } satisfies Prisma.ProspectWhereInput;

const OPEN_PROSPECT = { status: { notIn: ["ACTIVATED", "LOST"] } } satisfies Prisma.ProspectWhereInput;

/** La prochaine action d'un dossier ne compte comme relance que s'il n'a aucune tâche ouverte (sinon, ce sont ses tâches). */
const NO_OPEN_TASK = { tasks: { none: { doneAt: null } } } satisfies Prisma.ProspectWhereInput;

const OPEN_CANCELLATION_STATUSES = ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] as const;

// ---------------------------------------------------------------- Faits partagés

type SubscriptionFact = MrrSubscriptionFact & {
  organizationId: string;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  nextInvoiceAt: Date | null;
  lastPaymentAt: Date | null;
  lastPaymentFailedAt: Date | null;
  planName: string;
  /** L'officine (hors démo) de l'organisation abonnée : la fiche vers laquelle on renvoie. */
  pharmacy: { id: string; name: string } | null;
};

/** Les abonnements hors démo, leurs premiers paiements encaissés et leurs changements de tarif. */
const loadSubscriptionFacts = cache(async (): Promise<{ subscriptions: SubscriptionFact[]; payments: PaymentFact[]; priceChanges: PriceChangeFact[] }> => {
  const [rows, firstPayments, priceChanges] = await Promise.all([
    prisma.subscription.findMany({
      where: REAL_SUBSCRIPTION,
      select: {
        id: true,
        organizationId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        trialEndsAt: true,
        canceledAt: true,
        endedAt: true,
        cancelAtPeriodEnd: true,
        contractPriceCents: true,
        nextInvoiceAt: true,
        lastPaymentAt: true,
        lastPaymentFailedAt: true,
        plan: { select: { name: true, monthlyPriceCents: true } },
        organization: { select: { pharmacies: { where: { isDemo: false }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true } } } },
      },
    }),
    // Le premier paiement encaissé de chaque abonnement suffit au MRR reconstitué.
    prisma.billingPayment.groupBy({ by: ["subscriptionId"], where: { status: "PAID", paidAt: { not: null }, subscription: REAL_SUBSCRIPTION }, _min: { paidAt: true } }),
    prisma.subscriptionPriceChange.findMany({ where: { subscription: REAL_SUBSCRIPTION }, select: { subscriptionId: true, previousCents: true, effectiveAt: true } }),
  ]);
  return {
    subscriptions: rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      trialEndsAt: row.trialEndsAt,
      canceledAt: row.canceledAt,
      endedAt: row.endedAt,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      contractPriceCents: row.contractPriceCents,
      planMonthlyPriceCents: row.plan.monthlyPriceCents,
      planName: row.plan.name,
      nextInvoiceAt: row.nextInvoiceAt,
      lastPaymentAt: row.lastPaymentAt,
      lastPaymentFailedAt: row.lastPaymentFailedAt,
      pharmacy: row.organization.pharmacies[0] ?? null,
    })),
    payments: firstPayments.flatMap((row) => (row._min.paidAt ? [{ subscriptionId: row.subscriptionId, status: "PAID", paidAt: row._min.paidAt }] : [])),
    priceChanges,
  };
});

/** Les compteurs du centre des contrats : dernière version de chaque dossier, hors démo, mêmes filtres que la liste. */
const loadContractCounters = cache((now: Date) => contractCounters(now));

/** Les officines de démonstration : un incident technique n'a pas de relation vers l'officine, le filtre se fait en mémoire. */
export const loadDemoPharmacyIds = cache(async (): Promise<Set<string>> => {
  const rows = await prisma.pharmacy.findMany({ where: { isDemo: true }, select: { id: true } });
  return new Set(rows.map((pharmacy) => pharmacy.id));
});

/** Les départs connus : fins Stripe et demandes de résiliation confirmées (non annulées), une clé par client. */
const loadCancellationFacts = cache(async (): Promise<CancellationFact[]> => {
  const [{ subscriptions }, confirmed] = await Promise.all([
    loadSubscriptionFacts(),
    prisma.cancellationRequest.findMany({ where: CONFIRMED_CANCELLATION_WHERE, select: { organizationId: true, confirmedAt: true } }),
  ]);
  return [
    ...subscriptions.filter((sub) => sub.canceledAt).map((sub) => ({ key: sub.organizationId, at: sub.canceledAt })),
    ...confirmed.map((request) => ({ key: request.organizationId, at: request.confirmedAt })),
  ];
});

// ---------------------------------------------------------------- « À traiter »

export type AttentionCounts = {
  paymentsLate: number;
  cancellationsOpen: number;
  contractsToCountersign: number;
  contractsToSign: number;
  contractsToRemind: number;
  trialsEnding: number;
  followUpsLate: number;
  prospectsNoReply: number;
  inactivePharmacies: number;
  technical: { connectors: number; posts: number; incidents: number; total: number };
  invitationsPending: number;
};

export async function loadAttention(now: Date): Promise<AttentionCounts> {
  const today = todayRange(now);
  const noReplySince = daysBefore(now, NO_REPLY_AFTER_DAYS);
  const inactiveSince = daysBefore(now, INACTIVE_AFTER_DAYS);

  const [facts, contractCounts, cancellationsOpen, prospectsNoReply, lateProspects, lateTasks, inactivePharmacies, connections, failingPosts, openIncidents, demoIds, invitationsPending] = await Promise.all([
    loadSubscriptionFacts(),
    // À signer, à contresigner, à relancer (signalé après relances, ou lien qui expire sous 7 jours) : les filtres du centre des contrats.
    loadContractCounters(now),
    prisma.cancellationRequest.count({ where: { status: { in: [...OPEN_CANCELLATION_STATUSES] }, pharmacy: { isDemo: false } } }),
    prisma.prospect.count({ where: { AND: [REAL_PROSPECT, OPEN_PROSPECT, { OR: [{ lastContactAt: { lt: noReplySince } }, { lastContactAt: null, createdAt: { lt: noReplySince } }] }] } }),
    // Relances en retard : prévues avant aujourd'hui (celles du jour sont dans « Aujourd'hui »).
    // Un dossier qui a des tâches ouvertes est suivi par ses tâches : sa prochaine action n'est pas comptée en plus.
    prisma.prospect.count({ where: { AND: [REAL_PROSPECT, OPEN_PROSPECT, NO_OPEN_TASK, { nextActionAt: { lt: today.start } }] } }),
    prisma.salesTask.count({ where: { doneAt: null, dueAt: { lt: today.start }, prospect: { AND: [REAL_PROSPECT, OPEN_PROSPECT] } } }),
    prisma.pharmacy.count({ where: { isActive: true, isDemo: false, memberships: { none: { isActive: true, user: { deletedAt: null, lastLoginAt: { gte: inactiveSince } } } } } }),
    prisma.stockConnection.findMany({ where: { pharmacy: { isDemo: false }, status: { not: "PENDING" } }, select: { status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } }),
    prisma.counterPost.count({ where: { revokedAt: null, lastExportError: { not: null }, pharmacy: { isDemo: false } } }),
    // Un incident n'a pas de relation vers l'officine : le filtre démo se fait en mémoire (même règle que l'état technique).
    prisma.platformIncident.findMany({ where: { resolvedAt: null }, select: { pharmacyId: true } }),
    loadDemoPharmacyIds(),
    // En attente : ni complétée ni révoquée (à envoyer, en échec, expirée ou valide), comme la liste des accès.
    prisma.pharmacyInvitation.count({ where: { completedAt: null, revokedAt: null, prospect: REAL_PROSPECT } }),
  ]);

  const connectors = connections.filter((connection) => connectorNeedsAttention(connection, now)).length;
  const incidents = openIncidents.filter((incident) => countsAsIncident(incident, demoIds)).length;

  return {
    paymentsLate: facts.subscriptions.filter(isPaymentLate).length,
    cancellationsOpen,
    contractsToCountersign: contractCounts["a-contresigner"],
    contractsToSign: contractCounts["a-signer"],
    contractsToRemind: contractCounts.relance,
    trialsEnding: facts.subscriptions.filter((sub) => sub.status === "TRIALING" && trialEndingSoon(sub.trialEndsAt, now, TRIAL_ENDING_SOON_DAYS)).length,
    followUpsLate: lateProspects + lateTasks,
    prospectsNoReply,
    inactivePharmacies,
    technical: { connectors, posts: failingPosts, incidents, total: connectors + failingPosts + incidents },
    invitationsPending,
  };
}

// ---------------------------------------------------------------- « Aujourd'hui »

function repName(rep: { firstName: string; lastName: string } | null): string | null {
  return rep ? `${rep.firstName} ${rep.lastName}`.trim() : null;
}

function joinDetail(...parts: (string | null | undefined)[]): string | undefined {
  const text = parts.filter((part) => part && part.trim()).join(" · ");
  return text || undefined;
}

/** Démonstrations, relances, échéances de contrat, fins d'essai et factures du jour. */
export async function loadToday(now: Date): Promise<TodayItem[]> {
  const today = todayRange(now);
  const week = upcomingDaysRange(now, CONTRACT_EXPIRY_WINDOW_DAYS);
  const repSelect = { select: { firstName: true, lastName: true } } as const;

  const [facts, demos, actions, tasks, contracts] = await Promise.all([
    loadSubscriptionFacts(),
    prisma.prospect.findMany({
      where: { AND: [REAL_PROSPECT, { demoAt: { gte: today.start, lt: today.end } }] },
      select: { id: true, name: true, city: true, demoAt: true, demoDoneAt: true, salesRep: repSelect },
      orderBy: { demoAt: "asc" },
      take: 50,
    }),
    prisma.prospect.findMany({
      where: { AND: [REAL_PROSPECT, OPEN_PROSPECT, NO_OPEN_TASK, { nextActionAt: { gte: today.start, lt: today.end } }] },
      select: { id: true, name: true, nextActionAt: true, nextActionLabel: true, salesRep: repSelect },
      orderBy: { nextActionAt: "asc" },
      take: 50,
    }),
    prisma.salesTask.findMany({
      where: { doneAt: null, dueAt: { gte: today.start, lt: today.end }, prospect: { AND: [REAL_PROSPECT, OPEN_PROSPECT] } },
      select: { id: true, label: true, dueAt: true, prospect: { select: { id: true, name: true } }, salesRep: repSelect },
      orderBy: { dueAt: "asc" },
      take: 50,
    }),
    prisma.contract.findMany({
      where: { AND: [REAL_CONTRACT, { status: { in: ["SENT", "OPENED"] } }, { expiresAt: { gte: today.start, lt: week.end } }] },
      select: { id: true, version: true, status: true, expiresAt: true, prospectId: true, pharmacyId: true, pharmacySignerName: true, prospect: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
      take: 50,
    }),
  ]);

  const items: TodayItem[] = [];
  // Une démonstration du jour a sa ligne « Démo » : la tâche « Démonstration » de l'agenda, ou la
  // prochaine action du dossier qui la reprend, ne s'y ajoute pas une seconde fois en relance.
  const demoToday = new Set(demos.filter((demo) => demo.demoAt).map((demo) => demo.id));
  const echoesDemo = (prospectId: string, label: string | null) => label?.trim() === DEMO_TASK_LABEL && demoToday.has(prospectId);

  for (const demo of demos) {
    if (!demo.demoAt) continue;
    items.push({ id: `demo-${demo.id}`, kind: "demo", at: demo.demoAt, precision: "time", title: demo.name, detail: joinDetail(demo.city, repName(demo.salesRep)), status: demo.demoDoneAt ? "Réalisée" : undefined, href: `/admin/dossiers/${demo.id}` });
  }
  for (const prospect of actions) {
    if (!prospect.nextActionAt || echoesDemo(prospect.id, prospect.nextActionLabel)) continue;
    items.push({ id: `action-${prospect.id}`, kind: "relance", at: prospect.nextActionAt, precision: "time", title: prospect.nextActionLabel?.trim() || "Relance prévue", detail: joinDetail(prospect.name, repName(prospect.salesRep)), href: `/admin/dossiers/${prospect.id}` });
  }
  for (const task of tasks) {
    if (echoesDemo(task.prospect.id, task.label)) continue;
    items.push({ id: `task-${task.id}`, kind: "relance", at: task.dueAt, precision: "time", title: task.label, detail: joinDetail(task.prospect.name, repName(task.salesRep)), href: `/admin/dossiers/${task.prospect.id}` });
  }
  for (const contract of contracts) {
    if (!contract.expiresAt) continue;
    items.push({
      id: `contract-${contract.id}`,
      kind: "contrat",
      at: contract.expiresAt,
      precision: "day",
      title: `Lien de signature : ${contract.prospect.name}`,
      detail: joinDetail(`Contrat v${contract.version}`, contract.status === "OPENED" ? "consulté, non signé" : "envoyé, non consulté", contract.pharmacySignerName),
      href: contract.pharmacyId ? `/admin/pharmacies/${contract.pharmacyId}?onglet=contrats` : `/admin/dossiers/${contract.prospectId}`,
    });
  }
  // `isWithin` inclut ses deux bornes : on s'arrête juste avant minuit.
  const todayInclusive = { start: today.start, end: new Date(today.end.getTime() - 1) };
  for (const sub of facts.subscriptions) {
    const href = sub.pharmacy ? `/admin/pharmacies/${sub.pharmacy.id}?onglet=abonnement` : "/admin/abonnements";
    const name = sub.pharmacy?.name ?? "Officine";
    const price = `${formatEuros(contractualPrice(sub, { monthlyPriceCents: sub.planMonthlyPriceCents }).cents)} HT/mois`;
    const trialEndsToday = sub.status === "TRIALING" && sub.trialEndsAt !== null && isWithin(sub.trialEndsAt, todayInclusive);
    // Une résiliation programmée n'aura pas de prochaine facture, même si Stripe en annonçait une.
    const invoiceToday = sub.nextInvoiceAt !== null && isWithin(sub.nextInvoiceAt, todayInclusive) && !sub.cancelAtPeriodEnd && sub.status !== "CANCELED" && sub.status !== "INCOMPLETE_EXPIRED";
    if (trialEndsToday && sub.trialEndsAt) {
      // La fin d'essai déclenche la première facture : une seule ligne, qui dit les deux.
      items.push({ id: `trial-${sub.id}`, kind: "essai", at: sub.trialEndsAt, precision: "day", title: `Fin d'essai : ${name}`, detail: joinDetail(sub.planName, invoiceToday ? `première facture annoncée, ${price}` : price), href });
    } else if (invoiceToday && sub.nextInvoiceAt) {
      items.push({ id: `invoice-${sub.id}`, kind: "facture", at: sub.nextInvoiceAt, precision: "day", title: `Facture annoncée : ${name}`, detail: joinDetail(sub.planName, `tarif contractuel ${price}`), href });
    }
  }

  return sortTodayItems(items);
}

// ---------------------------------------------------------------- Indicateurs

export type CockpitKpis = {
  activePharmacies: number;
  trials: number;
  trialsEnding: number;
  activeSubscriptions: number;
  mrrCents: number;
  /** Abonnements comptés au MRR sans tarif contractuel figé (tarif catalogue repris). */
  mrrCatalogFallback: number;
  newSubscriptions: number;
  cancellations: number;
  conversion: TrialConversion;
  /** Dernière version de chaque dossier, hors démo : « En attente » = brouillons + à signer + à contresigner (filtre `en-attente` du centre des contrats). */
  contracts: { pending: number; drafts: number; toSign: number; toCountersign: number };
  paymentsLate: number;
};

export async function loadKpis(period: CockpitPeriod, now: Date): Promise<CockpitKpis> {
  const range = periodRange(period, now);
  const [facts, contractCounts, cancellationFacts, activePharmacies] = await Promise.all([
    loadSubscriptionFacts(),
    loadContractCounters(now),
    loadCancellationFacts(),
    prisma.pharmacy.count({ where: { isActive: true, isDemo: false } }),
  ]);
  const subs = facts.subscriptions;
  const mrrRows = subs.map((sub) => ({ status: sub.status, contractPriceCents: sub.contractPriceCents, planMonthlyPriceCents: sub.planMonthlyPriceCents, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }));
  const counted = mrrRows.filter((row) => (row.status === "ACTIVE" || row.status === "PAST_DUE") && !row.cancelAtPeriodEnd);

  return {
    activePharmacies,
    trials: subs.filter((sub) => sub.status === "TRIALING").length,
    trialsEnding: subs.filter((sub) => sub.status === "TRIALING" && trialEndingSoon(sub.trialEndsAt, now, TRIAL_ENDING_SOON_DAYS)).length,
    activeSubscriptions: subs.filter((sub) => sub.status === "ACTIVE").length,
    mrrCents: mrrCents(mrrRows),
    mrrCatalogFallback: counted.filter((row) => row.contractPriceCents === null).length,
    newSubscriptions: subs.filter((sub) => isWithin(sub.createdAt, range)).length,
    cancellations: cancellationDates(cancellationFacts, range).length,
    conversion: conversionRate(subs, range, now),
    contracts: { pending: contractCounts["en-attente"], drafts: contractCounts.brouillon, toSign: contractCounts["a-signer"], toCountersign: contractCounts["a-contresigner"] },
    paymentsLate: subs.filter(isPaymentLate).length,
  };
}

// ---------------------------------------------------------------- Graphiques

export type CockpitSeries = {
  granularity: Granularity;
  mrr: SeriesPoint[];
  newSubscriptions: SeriesPoint[];
  cancellations: SeriesPoint[];
};

export async function loadSeries(period: CockpitPeriod, now: Date): Promise<CockpitSeries> {
  const list = buckets(period, now);
  const range = periodRange(period, now);
  const [facts, cancellationFacts] = await Promise.all([loadSubscriptionFacts(), loadCancellationFacts()]);
  return {
    granularity: granularityOf(period),
    mrr: mrrSeries(facts.subscriptions, facts.payments, list, facts.priceChanges),
    newSubscriptions: countSeries(facts.subscriptions.map((sub) => sub.createdAt), list),
    cancellations: countSeries(cancellationDates(cancellationFacts, range), list),
  };
}

// ---------------------------------------------------------------- Tout le cockpit

export type Cockpit = { now: Date; attention: AttentionCounts; today: TodayItem[]; kpis: CockpitKpis; series: CockpitSeries };

/** Le cockpit entier, à un même instant : « maintenant » n'est lu qu'une fois, ici. */
export async function loadCockpit(period: CockpitPeriod): Promise<Cockpit> {
  const now = new Date();
  const [attention, today, kpis, series] = await Promise.all([loadAttention(now), loadToday(now), loadKpis(period, now), loadSeries(period, now)]);
  return { now, attention, today, kpis, series };
}
