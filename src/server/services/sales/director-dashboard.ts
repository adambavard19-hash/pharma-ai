import "server-only";
import { prisma } from "@/server/db/client";
import { listRunningChallengeSummaries } from "./challenges";
import { countByRep, firstActivationByProspect, firstDemoDoneByProspect } from "./first-events";
import { UNASSIGNED_PROSPECT_WHERE } from "./director-team";
import { describeChallengeGoal } from "@/core/sales/director/challenge";
import { ACTIVITY_EVENT_TYPES } from "@/core/sales/director/team";
import { conversionRate, describeEventActor, describeProspectEvent, rankTeam, resolveDirectorPeriod, summarizeTeam, type DirectorPeriod, type DirectorPeriodKey, type RankedMember, type TeamMemberStats } from "@/core/sales/director/dashboard";

/**
 * Les chiffres du tableau de bord du directeur commercial.
 *
 * Tout se compte sur les dossiers réels, jamais sur une saisie. Le directeur ne
 * voit que l'équipe commerciale : des commerciaux, des dossiers (nom de
 * l'officine, ville, étape), des commissions et des factures. Jamais un contrat,
 * une pièce, une note ou une donnée patient : l'activité récente cite le TYPE
 * de l'événement, pas son texte.
 *
 * « L'équipe » = les commerciaux ACTIFS. Un dossier appartient au commercial qui
 * le suit aujourd'hui (réaffecter un dossier déplace son crédit), et un dossier
 * sans commercial ne compte pour personne. Les règles de comptage sont celles
 * des challenges (`challenges.ts`) : un chiffre du tableau de bord et celui d'un
 * challenge de même période ne se contredisent pas.
 */

const CLOSED_STATUSES = ["ACTIVATED", "LOST"] as const;
/** Arrivé à la signature, ou plus loin : même définition que `salesRepStats`. */
const SIGNED_STATUSES = ["CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"] as const;
const FEED_SIZE = 20;

export type MoneyToHandle = { count: number; amountCents: number };

export type DashboardChallenge = {
  id: string;
  title: string;
  /** « 5 démonstrations réalisées par commercial ». */
  goal: string;
  endsAt: Date;
  participants: number;
  reached: number;
  /** De 0 à 1. */
  share: number;
};

export type DashboardEvent = {
  id: string;
  at: Date;
  /** Ce qui s'est passé, en quelques mots. */
  what: string;
  /** Qui, en toutes lettres. */
  who: string;
  /** Le commercial, quand c'est lui : pour ouvrir sa fiche. */
  whoRepId: string | null;
  prospectName: string;
  city: string | null;
};

export type DirectorDashboard = {
  period: DirectorPeriod;
  summary: string;
  team: { activeReps: number };
  totals: {
    opened: number;
    demos: number;
    contractsSigned: number;
    activated: number;
    /** Dossiers en cours en ce moment, quelle que soit la période. */
    openNow: number;
    /** Les dossiers ouverts sur la période arrivés à la signature, sur ceux qui ont été ouverts. `null` : aucun dossier ouvert. */
    conversion: { rate: number | null; signed: number; opened: number };
  };
  todo: {
    applicationsToReview: number;
    unassignedProspects: number;
    commissionsToValidate: MoneyToHandle;
    commissionsToPay: MoneyToHandle;
    invoicesToValidate: MoneyToHandle;
  };
  challenges: DashboardChallenge[];
  ranking: RankedMember[];
  /** Les commerciaux actifs qui n'ont rien enregistré sur la période. */
  quietCount: number;
  feed: DashboardEvent[];
};

type Counts = Map<string, number>;
const bump = (counts: Counts, repId: string | null | undefined) => {
  if (repId) counts.set(repId, (counts.get(repId) ?? 0) + 1);
};

/**
 * Les dossiers dont la PREMIÈRE signature (ou activation) tombe dans la période,
 * par commercial. Un dossier réactivé ou refait en nouvelle version ne se
 * recompte pas.
 */
async function countFirstSignatures(repIds: string[], window: { gte: Date; lte: Date }): Promise<Counts> {
  const counts: Counts = new Map();
  const signed = await prisma.contract.findMany({ where: { pharmacySignedAt: window, prospect: { salesRepId: { in: repIds } } }, select: { prospectId: true, prospect: { select: { salesRepId: true } } } });
  const owners = new Map(signed.map((row) => [row.prospectId, row.prospect.salesRepId]));
  if (owners.size === 0) return counts;
  const firsts = await prisma.contract.groupBy({ by: ["prospectId"], where: { prospectId: { in: [...owners.keys()] }, pharmacySignedAt: { not: null } }, _min: { pharmacySignedAt: true } });
  for (const first of firsts) {
    const at = first._min.pharmacySignedAt;
    if (at && at.getTime() >= window.gte.getTime()) bump(counts, owners.get(first.prospectId));
  }
  return counts;
}

async function countOpenedProspects(repIds: string[], window: { gte: Date; lte: Date }): Promise<Counts> {
  const counts: Counts = new Map();
  const rows = await prisma.prospect.groupBy({ by: ["salesRepId"], where: { salesRepId: { in: repIds }, createdAt: window }, _count: { _all: true } });
  for (const row of rows) if (row.salesRepId) counts.set(row.salesRepId, row._count._all);
  return counts;
}

const total = (counts: Counts) => [...counts.values()].reduce((sum, value) => sum + value, 0);

/**
 * Le tableau de bord de la période. `directorId` vient de la SESSION : il est
 * revérifié en base (un compte désactivé ne lit rien, même avec une session
 * qui n'aurait pas encore expiré).
 */
export async function getDirectorDashboard(directorId: string, periodKey: DirectorPeriodKey, now: Date = new Date()): Promise<DirectorDashboard> {
  const director = await prisma.salesDirector.findFirst({ where: { id: directorId, isActive: true }, select: { id: true } });
  if (!director) throw new Error("Accès au tableau de bord refusé.");

  const period = resolveDirectorPeriod(periodKey, now);
  const window = { gte: period.start, lte: period.end };
  const reps = await prisma.salesRep.findMany({ where: { isActive: true }, select: { id: true, firstName: true, lastName: true } });
  const repIds = reps.map((rep) => rep.id);
  const empty: Counts = new Map();

  const [opened, demos, contracts, activations, signedFromOpened, openNow, applications, unassigned, commissions, invoices, running, events] = await Promise.all([
    repIds.length ? countOpenedProspects(repIds, window) : empty,
    repIds.length ? firstDemoDoneByProspect(repIds, window).then(countByRep) : empty,
    repIds.length ? countFirstSignatures(repIds, window) : empty,
    repIds.length ? firstActivationByProspect(repIds, window).then(countByRep) : empty,
    repIds.length ? prisma.prospect.count({ where: { salesRepId: { in: repIds }, createdAt: window, status: { in: [...SIGNED_STATUSES] } } }) : 0,
    repIds.length ? prisma.prospect.count({ where: { salesRepId: { in: repIds }, status: { notIn: [...CLOSED_STATUSES] } } }) : 0,
    prisma.salesApplication.count({ where: { status: "NEW" } }),
    prisma.prospect.count({ where: UNASSIGNED_PROSPECT_WHERE }),
    // Une commission déjà réclamée par une facture se règle par la facture : elle ne compte pas deux fois dans « à traiter ».
    prisma.commission.groupBy({ by: ["status"], where: { status: { in: ["EARNED", "PAYABLE"] }, invoiceId: null }, _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.salesInvoice.aggregate({ where: { status: "RECEIVED" }, _sum: { amountCents: true }, _count: { _all: true } }),
    listRunningChallengeSummaries(now),
    prisma.prospectEvent.findMany({
      // Les mêmes événements que l'onglet « Ce qu'il a fait » : jamais un contrat, un e-mail, une signature ni un PDF.
      where: { type: { in: [...ACTIVITY_EVENT_TYPES] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FEED_SIZE,
      select: { id: true, type: true, actorType: true, actorId: true, actorLabel: true, metadata: true, createdAt: true, prospect: { select: { name: true, city: true } } },
    }),
  ]);

  const members: TeamMemberStats[] = reps.map((rep) => ({
    salesRepId: rep.id,
    name: `${rep.firstName} ${rep.lastName}`.trim(),
    opened: opened.get(rep.id) ?? 0,
    demos: demos.get(rep.id) ?? 0,
    contractsSigned: contracts.get(rep.id) ?? 0,
    activated: activations.get(rep.id) ?? 0,
  }));
  const { ranked, quiet } = rankTeam(members);

  const totals = { opened: total(opened), demos: total(demos), contractsSigned: total(contracts), activated: total(activations) };
  const money = (status: string): MoneyToHandle => {
    const row = commissions.find((entry) => entry.status === status);
    return { count: row?._count._all ?? 0, amountCents: row?._sum.amountCents ?? 0 };
  };

  return {
    period,
    summary: summarizeTeam({ phrase: period.phrase, teamSize: reps.length, opened: totals.opened, demos: totals.demos, activated: totals.activated }),
    team: { activeReps: reps.length },
    totals: { ...totals, openNow, conversion: { rate: conversionRate(signedFromOpened, totals.opened), signed: signedFromOpened, opened: totals.opened } },
    todo: {
      applicationsToReview: applications,
      unassignedProspects: unassigned,
      commissionsToValidate: money("EARNED"),
      commissionsToPay: money("PAYABLE"),
      invoicesToValidate: { count: invoices._count._all, amountCents: invoices._sum.amountCents ?? 0 },
    },
    challenges: running.map((challenge) => ({
      id: challenge.id,
      title: challenge.title,
      goal: `${describeChallengeGoal(challenge.metric, challenge.target)} par commercial`,
      endsAt: challenge.endsAt,
      participants: challenge.totals.participants,
      reached: challenge.totals.reached,
      share: challenge.totals.reachedShare,
    })),
    ranking: ranked,
    quietCount: quiet.length,
    feed: events.map((event) => ({
      id: event.id,
      at: event.createdAt,
      what: describeProspectEvent(event.type, event.metadata),
      who: describeEventActor(event.actorType, event.actorLabel),
      whoRepId: event.actorType === "SALES" ? event.actorId : null,
      prospectName: event.prospect.name,
      city: event.prospect.city,
    })),
  };
}
