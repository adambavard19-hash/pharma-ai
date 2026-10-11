import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { calendarDay, challengeWindow, dayKeyToDate, safeTimeZone, toDayKey } from "@/core/challenges/dates";
import { VALIDATED_STATUSES } from "@/core/team/ranking";
import { listChallenges } from "@/server/services/challenges";
import { listMembers } from "@/server/services/comptoirs";
import { loadTeamChallenges, loadTeamRanking } from "@/server/services/team-ranking";
import { resolvePeriod } from "@/core/analytics/periods";
import { objectiveProgress, periodBounds, type ObjectiveInput, type ObjectiveProgress } from "@/core/personal/objectives";
import { canManageTeam, COLLABORATOR_VISIBLE_BONUS_STATUSES, nextBonusStatus, type BonusDecision, type BonusStatusCode } from "@/core/personal/bonuses";

/**
 * « Mon espace » et « Challenges » de PharmaBoost Mobile : ce que la personne connectée voit d'ELLE-MÊME, et ce que le
 * titulaire règle pour son équipe.
 *
 * Cloisonnement, sans exception :
 *  - toute lecture part de la portée de la session (`scope`) : l'officine ACTIVE et la personne connectée, jamais un
 *    identifiant reçu ;
 *  - un collaborateur ne lit que SES chiffres, SES objectifs, SES primes validées ou versées ;
 *  - les outils d'équipe vérifient en base que la personne est titulaire (OWNER) de CETTE officine, et que le
 *    collaborateur visé en fait partie ;
 *  - un compte gratuit n'a pas de portée : aucune de ces fonctions ne lui est accessible.
 */

type Scope = TenantScope;
type Clock = { timeZone: string; today: string };

async function clockOf(pharmacyId: string, now: Date): Promise<Clock> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { timezone: true } });
  const timeZone = safeTimeZone(pharmacy?.timezone);
  return { timeZone, today: calendarDay(now, timeZone) };
}

// ---------------------------------------------------------------------------------------------------------------
// Mes résultats
// ---------------------------------------------------------------------------------------------------------------

export type ResultFigures = { proposed: number; validated: number; rate: number | null };
export type PersonalResults = { today: ResultFigures; week: ResultFigures; month: ResultFigures };

function figures(proposed: number, validated: number): ResultFigures {
  return { proposed, validated, rate: proposed > 0 ? validated / proposed : null };
}

/**
 * Mes conseils proposés et validés, aujourd'hui, cette semaine, ce mois — la règle du classement de l'équipe
 * (« Mon équipe »), restreinte à la personne connectée DANS la requête : les chiffres des autres ne sont jamais lus.
 */
export async function loadPersonalResults(scope: Scope, now = new Date()): Promise<PersonalResults> {
  const clock = await clockOf(scope.pharmacyId, now);
  const startOf = (day: string) => challengeWindow(day, day, clock.timeZone).from;
  const today = startOf(clock.today);
  const week = startOf(periodBounds("WEEK", clock.today).startsOn);
  const month = startOf(periodBounds("MONTH", clock.today).startsOn);
  const from = week < month ? week : month;
  const demo = Boolean(scope.isDemo);
  const validated = [...VALIDATED_STATUSES];
  const [row] = await prisma.$queryRaw<{ tp: number; tv: number; wp: number; wv: number; mp: number; mv: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE r."createdAt" >= ${today})::int AS "tp",
      COUNT(*) FILTER (WHERE r."createdAt" >= ${today} AND r."status"::text = ANY(${validated}))::int AS "tv",
      COUNT(*) FILTER (WHERE r."createdAt" >= ${week})::int AS "wp",
      COUNT(*) FILTER (WHERE r."createdAt" >= ${week} AND r."status"::text = ANY(${validated}))::int AS "wv",
      COUNT(*) FILTER (WHERE r."createdAt" >= ${month})::int AS "mp",
      COUNT(*) FILTER (WHERE r."createdAt" >= ${month} AND r."status"::text = ANY(${validated}))::int AS "mv"
    FROM "recommendations" r
    JOIN "prescriptions" p ON p."id" = r."prescriptionId"
    WHERE r."pharmacyId" = ${scope.pharmacyId}
      AND p."handledByUserId" = ${scope.userId}
      AND r."createdAt" >= ${from} AND r."createdAt" <= ${now}
      AND r."origin" IN ('AI', 'RULE')
      AND p."deletedAt" IS NULL
      AND (r."isDemo" = ${demo} OR ${demo} = true)`;
  const value = row ?? { tp: 0, tv: 0, wp: 0, wv: 0, mp: 0, mv: 0 };
  return { today: figures(value.tp, value.tv), week: figures(value.wp, value.wv), month: figures(value.mp, value.mv) };
}

// ---------------------------------------------------------------------------------------------------------------
// Objectifs
// ---------------------------------------------------------------------------------------------------------------

export type ObjectiveView = {
  id: string;
  userId: string;
  userName: string;
  title: string;
  metric: string;
  period: string;
  startsOn: string;
  endsOn: string;
  challengeTitle: string | null;
  progress: ObjectiveProgress;
};

type ObjectiveRecord = { id: string; userId: string; title: string; metric: string; period: string; target: number; startsOn: Date; endsOn: Date; challengeId: string | null; challenge: { title: string } | null };

const OBJECTIVE_SELECT = { id: true, userId: true, title: true, metric: true, period: true, target: true, startsOn: true, endsOn: true, challengeId: true, challenge: { select: { title: true } } } as const;

/** La valeur mesurée d'un objectif, sur SA période, pour SON collaborateur (null : objectif libre). */
async function measure(scope: Scope, record: ObjectiveRecord, clock: Clock, challengeUnits: Map<string, Map<string, number>>): Promise<number | null> {
  const window = challengeWindow(record.startsOn, record.endsOn, clock.timeZone);
  const adviceWhere = {
    pharmacyId: scope.pharmacyId,
    origin: { in: ["AI", "RULE"] as ("AI" | "RULE")[] },
    createdAt: { gte: window.from, lt: window.until },
    prescription: { handledByUserId: record.userId, deletedAt: null },
    ...(scope.isDemo ? {} : { isDemo: false }),
  };
  switch (record.metric) {
    case "ADVICE_PRESENTED":
      return prisma.recommendation.count({ where: adviceWhere });
    case "ADVICE_SOLD":
      return prisma.recommendation.count({ where: { ...adviceWhere, status: { in: [...VALIDATED_STATUSES] as never } } });
    case "UNITS_SOLD": {
      if (record.challengeId) return challengeUnits.get(record.challengeId)?.get(record.userId) ?? 0;
      const sum = await prisma.recommendation.aggregate({ where: { ...adviceWhere, status: "PURCHASED" }, _sum: { quantity: true } });
      return sum._sum.quantity ?? 0;
    }
    case "TRAININGS_COMPLETED":
      return prisma.trainingProgress.count({
        where: { userId: record.userId, status: "DONE", completedAt: { gte: window.from, lt: window.until }, OR: [{ pharmacyId: scope.pharmacyId }, { pharmacyId: null }] },
      });
    default:
      return null;
  }
}

async function viewsOf(scope: Scope, records: ObjectiveRecord[], clock: Clock, names: Map<string, string>): Promise<ObjectiveView[]> {
  const challengeUnits = new Map<string, Map<string, number>>();
  if (records.some((record) => record.metric === "UNITS_SOLD" && record.challengeId)) {
    for (const challenge of await loadTeamChallenges(scope)) {
      challengeUnits.set(challenge.id, new Map(challenge.people.map((person) => [person.userId, person.units])));
    }
  }
  return Promise.all(
    records.map(async (record) => {
      const startsOn = toDayKey(record.startsOn);
      const endsOn = toDayKey(record.endsOn);
      const value = await measure(scope, record, clock, challengeUnits);
      return {
        id: record.id,
        userId: record.userId,
        userName: names.get(record.userId) ?? "Collaborateur",
        title: record.title,
        metric: record.metric,
        period: record.period,
        startsOn,
        endsOn,
        challengeTitle: record.challenge?.title ?? null,
        progress: objectiveProgress({ metric: record.metric, target: record.target, startsOn, endsOn }, value, clock.today),
      };
    }),
  );
}

/** Mes objectifs : en cours et terminés depuis moins de 45 jours, non archivés. */
export async function loadMyObjectives(scope: Scope, now = new Date()): Promise<ObjectiveView[]> {
  const clock = await clockOf(scope.pharmacyId, now);
  const since = new Date(dayKeyToDate(clock.today).getTime() - 45 * 86_400_000);
  const records = await prisma.personalObjective.findMany({
    where: { pharmacyId: scope.pharmacyId, userId: scope.userId, archivedAt: null, endsOn: { gte: since } },
    orderBy: [{ endsOn: "asc" }, { createdAt: "asc" }],
    select: OBJECTIVE_SELECT,
  });
  return viewsOf(scope, records, clock, new Map());
}

// ---------------------------------------------------------------------------------------------------------------
// Mes primes
// ---------------------------------------------------------------------------------------------------------------

export type MyBonus = { id: string; label: string; amountCents: number; status: "VALIDATED" | "PAID"; validatedAt: Date | null; paidAt: Date | null; origin: string | null };

/** Mes primes : UNIQUEMENT celles validées ou versées par le titulaire. Le filtre est dans la requête. */
export async function loadMyBonuses(scope: Pick<Scope, "pharmacyId" | "userId">): Promise<MyBonus[]> {
  const rows = await prisma.bonusAuthorization.findMany({
    where: { pharmacyId: scope.pharmacyId, userId: scope.userId, status: { in: [...COLLABORATOR_VISIBLE_BONUS_STATUSES] } },
    orderBy: [{ validatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, label: true, amountCents: true, status: true, validatedAt: true, paidAt: true, challenge: { select: { title: true } }, objective: { select: { title: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    amountCents: row.amountCents,
    status: row.status as "VALIDATED" | "PAID",
    validatedAt: row.validatedAt,
    paidAt: row.paidAt,
    origin: row.challenge?.title ?? row.objective?.title ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Challenges vus par la personne
// ---------------------------------------------------------------------------------------------------------------

export type BoardChallenge = {
  id: string;
  title: string;
  laboratory: string;
  universe: string | null;
  state: "RUNNING" | "ENDED";
  startsOn: string;
  endsOn: string;
  daysRemaining: number;
  teamUnits: number;
  target: number | null;
  myUnits: number;
  /** Mon rang parmi ceux qui ont vendu ; null si je n'ai rien vendu. */
  myRank: number | null;
  participants: number;
  /** Les paliers en unités (jamais leurs montants : c'est l'accord commercial du titulaire). */
  milestones: { units: number; reached: boolean }[];
  unitsToNextMilestone: number | null;
};

/** Les challenges de l'officine active : en cours (ventes + déclarations du comptoir), et terminés depuis 60 jours. */
export async function loadChallengeBoard(scope: TenantScope, now = new Date()): Promise<{ running: BoardChallenge[]; ended: BoardChallenge[] }> {
  const [{ rows, today }, team] = await Promise.all([listChallenges(scope, now), loadTeamChallenges(scope)]);
  const teamById = new Map(team.map((challenge) => [challenge.id, challenge]));
  const running: BoardChallenge[] = [];
  const ended: BoardChallenge[] = [];
  const limit = dayKeyToDate(today).getTime() - 60 * 86_400_000;

  for (const row of rows) {
    const status = row.progress.effectiveStatus;
    const live = teamById.get(row.id);
    if (status === "RUNNING" && live) {
      const index = live.people.findIndex((person) => person.userId === scope.userId);
      running.push(card(row, "RUNNING", live.units, index >= 0 ? live.people[index].units : 0, index >= 0 ? index + 1 : null, live.people.length, live.daysRemaining));
    } else if (status === "ENDED" && dayKeyToDate(row.endsOn).getTime() >= limit) {
      const people = row.progress.byUser.filter((entry) => entry.key && entry.counted > 0).sort((a, b) => b.counted - a.counted);
      const index = people.findIndex((entry) => entry.key === scope.userId);
      ended.push(card(row, "ENDED", row.progress.units, index >= 0 ? people[index].counted : 0, index >= 0 ? index + 1 : null, people.length, 0));
    }
  }
  ended.sort((a, b) => b.endsOn.localeCompare(a.endsOn));
  return { running, ended };
}

function card(row: Awaited<ReturnType<typeof listChallenges>>["rows"][number], state: BoardChallenge["state"], teamUnits: number, myUnits: number, myRank: number | null, participants: number, daysRemaining: number): BoardChallenge {
  const milestones = row.tiers.map((tier) => ({ units: tier.units, reached: teamUnits >= tier.units }));
  const next = milestones.find((milestone) => !milestone.reached);
  const target = row.progress.target;
  return {
    id: row.id,
    title: row.title,
    laboratory: row.laboratory,
    universe: row.universe,
    state,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    daysRemaining,
    teamUnits,
    target,
    myUnits,
    myRank,
    participants,
    milestones,
    unitsToNextMilestone: next ? next.units - teamUnits : target !== null && teamUnits < target ? target - teamUnits : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Les outils du titulaire
// ---------------------------------------------------------------------------------------------------------------

/** Vérifié EN BASE à chaque geste : la personne est titulaire, active, de CETTE officine. */
export async function isPharmacyOwner(scope: Pick<Scope, "pharmacyId" | "userId">): Promise<boolean> {
  const membership = await prisma.membership.findFirst({ where: { pharmacyId: scope.pharmacyId, userId: scope.userId, isActive: true }, select: { role: true } });
  return canManageTeam(membership?.role);
}

async function isActiveMember(pharmacyId: string, userId: string): Promise<boolean> {
  return (await prisma.membership.count({ where: { pharmacyId, userId, isActive: true, user: { status: "ACTIVE" } } })) > 0;
}

export type TeamBonus = { id: string; userId: string; userName: string; label: string; amountCents: number; status: BonusStatusCode; createdAt: Date; validatedAt: Date | null; paidAt: Date | null; origin: string | null };

export type TeamDesk = {
  members: { id: string; name: string; role: string }[];
  /** Le mois en cours, pour chaque collaborateur : proposés, validés, taux. */
  ranking: Awaited<ReturnType<typeof loadTeamRanking>>;
  objectives: ObjectiveView[];
  bonuses: TeamBonus[];
  challenges: { id: string; title: string }[];
  today: string;
};

/** Le bureau du titulaire : son équipe, les objectifs, les primes (toutes, propositions comprises). Null si pas titulaire. */
export async function loadTeamDesk(scope: TenantScope, now = new Date()): Promise<TeamDesk | null> {
  if (!(await isPharmacyOwner(scope))) return null;
  const clock = await clockOf(scope.pharmacyId, now);
  const since = new Date(dayKeyToDate(clock.today).getTime() - 45 * 86_400_000);
  const [members, ranking, records, bonuses, team] = await Promise.all([
    listMembers(scope.pharmacyId),
    loadTeamRanking(scope, resolvePeriod("month", now)),
    prisma.personalObjective.findMany({
      where: { pharmacyId: scope.pharmacyId, archivedAt: null, endsOn: { gte: since } },
      orderBy: [{ endsOn: "asc" }, { createdAt: "asc" }],
      select: OBJECTIVE_SELECT,
    }),
    prisma.bonusAuthorization.findMany({
      where: { pharmacyId: scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, userId: true, label: true, amountCents: true, status: true, createdAt: true, validatedAt: true, paidAt: true, challenge: { select: { title: true } }, objective: { select: { title: true } } },
    }),
    loadTeamChallenges(scope),
  ]);
  const names = new Map(members.map((member) => [member.id, member.name]));
  return {
    members,
    ranking,
    objectives: await viewsOf(scope, records, clock, names),
    bonuses: bonuses.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: names.get(row.userId) ?? "Ancien collaborateur",
      label: row.label,
      amountCents: row.amountCents,
      status: row.status as BonusStatusCode,
      createdAt: row.createdAt,
      validatedAt: row.validatedAt,
      paidAt: row.paidAt,
      origin: row.challenge?.title ?? row.objective?.title ?? null,
    })),
    challenges: team.map((challenge) => ({ id: challenge.id, title: challenge.title })),
    today: clock.today,
  };
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const NOT_OWNER = "Réservé au titulaire de l'officine.";

/** Fixe un objectif à un collaborateur de l'officine (soi-même compris). */
export async function createObjective(scope: Scope, input: ObjectiveInput): Promise<Outcome<{ id: string }>> {
  if (!(await isPharmacyOwner(scope))) return { ok: false, error: NOT_OWNER };
  if (!(await isActiveMember(scope.pharmacyId, input.userId))) return { ok: false, error: "Ce collaborateur ne fait pas partie de l'officine.", fieldErrors: { userId: "Collaborateur introuvable." } };
  if (input.challengeId) {
    const challenge = await prisma.labChallenge.count({ where: { id: input.challengeId, pharmacyId: scope.pharmacyId } });
    if (challenge === 0) return { ok: false, error: "Challenge introuvable dans cette officine.", fieldErrors: { challengeId: "Challenge introuvable." } };
  }
  const created = await prisma.personalObjective.create({
    data: {
      pharmacyId: scope.pharmacyId,
      userId: input.userId,
      title: input.title,
      metric: input.metric,
      target: input.target,
      period: input.period,
      startsOn: dayKeyToDate(input.startsOn),
      endsOn: dayKeyToDate(input.endsOn),
      challengeId: input.challengeId,
      createdByUserId: scope.userId,
    },
    select: { id: true },
  });
  return { ok: true, data: created };
}

/** Archive un objectif (il disparaît des écrans ; la ligne reste). */
export async function archiveObjective(scope: Scope, id: string): Promise<Outcome<{ userId: string; title: string }>> {
  if (!(await isPharmacyOwner(scope))) return { ok: false, error: NOT_OWNER };
  const objective = await prisma.personalObjective.findFirst({ where: { id, pharmacyId: scope.pharmacyId, archivedAt: null }, select: { userId: true, title: true } });
  if (!objective) return { ok: false, error: "Objectif introuvable dans cette officine." };
  await prisma.personalObjective.updateMany({ where: { id, pharmacyId: scope.pharmacyId }, data: { archivedAt: new Date() } });
  return { ok: true, data: objective };
}

export type BonusInput = { userId: string; label: string; amountCents: number; objectiveId: string | null; challengeId: string | null; note: string | null };

/** Propose une prime : elle reste invisible du collaborateur tant que le titulaire ne l'a pas validée. */
export async function proposeBonus(scope: Scope, input: BonusInput): Promise<Outcome<{ id: string }>> {
  if (!(await isPharmacyOwner(scope))) return { ok: false, error: NOT_OWNER };
  if (!(await isActiveMember(scope.pharmacyId, input.userId))) return { ok: false, error: "Ce collaborateur ne fait pas partie de l'officine.", fieldErrors: { userId: "Collaborateur introuvable." } };
  if (input.objectiveId && (await prisma.personalObjective.count({ where: { id: input.objectiveId, pharmacyId: scope.pharmacyId, userId: input.userId } })) === 0) {
    return { ok: false, error: "Cet objectif n'est pas celui de ce collaborateur.", fieldErrors: { objectiveId: "Objectif introuvable." } };
  }
  if (input.challengeId && (await prisma.labChallenge.count({ where: { id: input.challengeId, pharmacyId: scope.pharmacyId } })) === 0) {
    return { ok: false, error: "Challenge introuvable dans cette officine.", fieldErrors: { challengeId: "Challenge introuvable." } };
  }
  const created = await prisma.bonusAuthorization.create({
    data: { pharmacyId: scope.pharmacyId, userId: input.userId, label: input.label, amountCents: input.amountCents, objectiveId: input.objectiveId, challengeId: input.challengeId, note: input.note, status: "PROPOSED", proposedByUserId: scope.userId },
    select: { id: true },
  });
  return { ok: true, data: created };
}

/**
 * Valide, marque versée ou annule une prime. La transition est vérifiée (on ne verse pas une prime non validée) et
 * appliquée « si le statut n'a pas bougé entre-temps » : deux clics simultanés n'en font qu'un.
 */
export async function decideBonus(scope: Scope, id: string, decision: BonusDecision, now = new Date()): Promise<Outcome<{ userId: string; status: BonusStatusCode; amountCents: number; previous: BonusStatusCode }>> {
  if (!(await isPharmacyOwner(scope))) return { ok: false, error: NOT_OWNER };
  const bonus = await prisma.bonusAuthorization.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { status: true, userId: true, amountCents: true } });
  if (!bonus) return { ok: false, error: "Prime introuvable dans cette officine." };
  const next = nextBonusStatus(bonus.status, decision);
  if (!next) return { ok: false, error: "Ce geste n'est plus possible sur cette prime." };
  const data =
    next === "VALIDATED"
      ? { status: next, validatedByUserId: scope.userId, validatedAt: now }
      : next === "PAID"
        ? { status: next, paidAt: now }
        : { status: next, cancelledAt: now };
  const updated = await prisma.bonusAuthorization.updateMany({ where: { id, pharmacyId: scope.pharmacyId, status: bonus.status }, data });
  if (updated.count === 0) return { ok: false, error: "La prime vient d'être modifiée : rechargez la page." };
  return { ok: true, data: { userId: bonus.userId, status: next, amountCents: bonus.amountCents, previous: bonus.status as BonusStatusCode } };
}
