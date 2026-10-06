import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { notifySalesRep } from "./notifications";
import { countByRep, firstActivationByProspect, firstDemoDoneByProspect } from "./first-events";
import {
  buildChallengeProgress,
  challengePeriodLabel,
  challengeState,
  describeChallengeGoal,
  describeReward,
  groupChallengesByState,
  LOCKED_FIELD_LABELS,
  lockedFieldViolations,
  lockedFieldsFor,
  validateChallengeForm,
  type ChallengeFormInput,
  type ChallengeProgress,
  type ChallengeState,
  type ChallengeTotals,
} from "@/core/sales/director/challenge";
import type { SalesChallenge } from "@/generated/prisma";

/**
 * Les challenges de l'équipe commerciale.
 *
 * Un challenge est un objectif PAR commercial sur une période [début, fin[,
 * pour tous les commerciaux actifs. L'avancement n'est jamais saisi : il se
 * compte, à chaque lecture, sur les dossiers réels (voir `countsByRep`). Un
 * dossier est attribué au commercial qui le suit AUJOURD'HUI : réaffecter un
 * dossier déplace son crédit.
 *
 * L'identité de l'acteur vient toujours de la session (directeur ou
 * administrateur), jamais d'un formulaire ; chaque geste laisse une trace dans
 * le journal d'audit.
 */

export type ChallengeActor = { type: "DIRECTOR" | "ADMIN"; id: string; label: string };
export type ChallengeRecord = SalesChallenge;

/** Les champs d'identité d'une ligne d'audit pour cet acteur. */
const auditIdentity = (actor: ChallengeActor) => (actor.type === "DIRECTOR" ? { salesDirectorId: actor.id } : { platformAdminId: actor.id });

type ParticipantRow = { id: string; firstName: string; lastName: string; createdAt: Date };

/** Les commerciaux ACTIFS, une seule lecture pour plusieurs challenges. */
async function activeReps(): Promise<ParticipantRow[]> {
  return prisma.salesRep.findMany({ where: { isActive: true }, select: { id: true, firstName: true, lastName: true, createdAt: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

/** Participent : les commerciaux actifs, présents avant la fin du challenge (un arrivé après n'a pas pu y jouer). */
const participantsOf = (challenge: Pick<ChallengeRecord, "endsAt">, reps: ParticipantRow[]) => reps.filter((rep) => rep.createdAt.getTime() < challenge.endsAt.getTime());

type Counts = Map<string, number>;

/** Ce que les dossiers réels disent, par commercial, pour la métrique et la période de ce challenge. */
async function countsByRep(challenge: Pick<ChallengeRecord, "metric" | "startsAt" | "endsAt">, repIds: string[]): Promise<Counts> {
  const counts: Counts = new Map();
  if (repIds.length === 0) return counts;
  const window = { gte: challenge.startsAt, lt: challenge.endsAt };

  switch (challenge.metric) {
    case "PROSPECTS_CREATED": {
      const rows = await prisma.prospect.groupBy({ by: ["salesRepId"], where: { salesRepId: { in: repIds }, createdAt: window }, _count: { _all: true } });
      for (const row of rows) if (row.salesRepId) counts.set(row.salesRepId, row._count._all);
      return counts;
    }

    // Une démonstration compte à la date de la PREMIÈRE démo réalisée du dossier, lue dans l'audit : reprogrammer une démo
    // remet `demoDoneAt` à zéro et ne doit pas faire disparaître une démo déjà faite du challenge.
    case "DEMOS_DONE":
      return countByRep(await firstDemoDoneByProspect(repIds, window));

    case "CONTRACTS_SIGNED": {
      // Un contrat signé par l'officine dans la période. Une officine compte une fois : seule sa PREMIÈRE signature compte
      // (un contrat refait en nouvelle version ne se recompte pas).
      const signed = await prisma.contract.findMany({ where: { pharmacySignedAt: window, prospect: { salesRepId: { in: repIds } } }, select: { prospectId: true, prospect: { select: { salesRepId: true } } } });
      const owners = new Map(signed.map((row) => [row.prospectId, row.prospect.salesRepId]));
      if (owners.size === 0) return counts;
      const firsts = await prisma.contract.groupBy({ by: ["prospectId"], where: { prospectId: { in: [...owners.keys()] }, pharmacySignedAt: { not: null } }, _min: { pharmacySignedAt: true } });
      for (const first of firsts) {
        const at = first._min.pharmacySignedAt;
        const rep = owners.get(first.prospectId);
        if (at && rep && at.getTime() >= challenge.startsAt.getTime()) counts.set(rep, (counts.get(rep) ?? 0) + 1);
      }
      return counts;
    }

    // Le passage à « Activé » est daté par l'événement du dossier (le titulaire se connecte, l'abonnement démarre, ou la console
    // change l'étape). Seule la première activation d'une officine compte.
    case "ACTIVATIONS":
      return countByRep(await firstActivationByProspect(repIds, window));
  }
}

async function progressWith(challenge: ChallengeRecord, reps: ParticipantRow[], now: Date): Promise<ChallengeProgress> {
  const participants = participantsOf(challenge, reps);
  const values = await countsByRep(challenge, participants.map((rep) => rep.id));
  return buildChallengeProgress({ challenge, reps: participants, values, now });
}

/**
 * L'avancement d'un challenge : par commercial `{ salesRepId, name, value, target, percent, reached, rank }`,
 * les totaux, le classement. Donner la ligne du challenge, ou son identifiant (`null` s'il n'existe pas).
 */
export async function challengeProgress(challenge: ChallengeRecord, now?: Date): Promise<ChallengeProgress>;
export async function challengeProgress(challengeId: string, now?: Date): Promise<ChallengeProgress | null>;
export async function challengeProgress(input: ChallengeRecord | string, now: Date = new Date()): Promise<ChallengeProgress | null> {
  const challenge = typeof input === "string" ? await prisma.salesChallenge.findUnique({ where: { id: input } }) : input;
  if (!challenge) return null;
  return progressWith(challenge, await activeReps(), now);
}

// ---- Lectures du directeur --------------------------------------------------------

export type ChallengeListItem = {
  challenge: ChallengeRecord;
  state: ChallengeState;
  /** Arrêté à la main avant la date prévue. */
  stoppedEarly: boolean;
  /** Les totaux, pour un challenge en cours ou terminé ; `null` à venir. */
  totals: ChallengeTotals | null;
};

const ENDED_LIST_LIMIT = 30;

const toItem = (challenge: ChallengeRecord, now: Date, progress: ChallengeProgress | null): ChallengeListItem => ({ challenge, state: challengeState(challenge, now), stoppedEarly: !challenge.isActive, totals: progress?.totals ?? null });

/** Tous les challenges, rangés : en cours, à venir, terminés (les 30 plus récents). */
export async function listChallenges(now: Date = new Date()): Promise<{ running: ChallengeListItem[]; upcoming: ChallengeListItem[]; ended: ChallengeListItem[]; total: number }> {
  const all = await prisma.salesChallenge.findMany({ orderBy: { startsAt: "desc" }, take: 300 });
  const groups = groupChallengesByState(all, now);
  const shownEnded = groups.ended.slice(0, ENDED_LIST_LIMIT);
  const needsProgress = groups.running.length + shownEnded.length > 0;
  const reps = needsProgress ? await activeReps() : [];
  const [running, ended] = await Promise.all([
    Promise.all(groups.running.map(async (challenge) => toItem(challenge, now, await progressWith(challenge, reps, now)))),
    Promise.all(shownEnded.map(async (challenge) => toItem(challenge, now, await progressWith(challenge, reps, now)))),
  ]);
  return { running, upcoming: groups.upcoming.map((challenge) => toItem(challenge, now, null)), ended, total: all.length };
}

/** Un challenge et son avancement, ou `null` s'il n'existe pas. */
export async function getChallengeDetail(id: string, now: Date = new Date()): Promise<{ challenge: ChallengeRecord; state: ChallengeState; stoppedEarly: boolean; progress: ChallengeProgress } | null> {
  const challenge = await prisma.salesChallenge.findUnique({ where: { id } });
  if (!challenge) return null;
  const progress = await progressWith(challenge, await activeReps(), now);
  return { challenge, state: progress.state, stoppedEarly: !challenge.isActive, progress };
}

/** Les challenges en cours, résumés (tableau de bord) : le nom, l'objectif et la part des commerciaux qui l'ont atteint. */
export async function listRunningChallengeSummaries(now: Date = new Date()): Promise<{ id: string; title: string; metric: ChallengeRecord["metric"]; target: number; endsAt: Date; totals: ChallengeTotals }[]> {
  const running = groupChallengesByState(await prisma.salesChallenge.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } }), now).running;
  if (running.length === 0) return [];
  const reps = await activeReps();
  return Promise.all(running.map(async (challenge) => ({ id: challenge.id, title: challenge.title, metric: challenge.metric, target: challenge.target, endsAt: challenge.endsAt, totals: (await progressWith(challenge, reps, now)).totals })));
}

/** Le nombre de commerciaux actifs : ceux qui participent à tout nouveau challenge et en sont prévenus. */
export async function countActiveReps(): Promise<number> {
  return (await activeReps()).length;
}

// ---- Gestes du directeur ----------------------------------------------------------

export type ChallengeWriteResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Crée un challenge et prévient chaque commercial actif. Les règles de saisie
 * sont rappelées ici : l'écran ne protège rien. Une notification qui ne part
 * pas n'annule pas le challenge : le nombre d'échecs est rendu.
 */
export async function createChallenge(input: ChallengeFormInput, actor: ChallengeActor, now: Date = new Date()): Promise<ChallengeWriteResult<{ id: string; notified: number; notifyFailed: number }>> {
  const validation = validateChallengeForm(input, { now, requireFutureEnd: true });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors };
  const value = validation.value;

  const created = await prisma.salesChallenge.create({
    data: {
      title: value.title,
      description: value.description,
      metric: value.metric,
      target: value.target,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      rewardLabel: value.rewardLabel,
      rewardCents: value.rewardCents,
      isActive: true,
      createdByType: actor.type,
      createdById: actor.id,
      createdByLabel: actor.label,
    },
  });
  await recordAudit({
    action: "sales.challenge_saved",
    entityType: "SalesChallenge",
    entityId: created.id,
    ...auditIdentity(actor),
    metadata: { change: "created", title: value.title, metric: value.metric, target: value.target, startsAt: value.startsAt.toISOString(), endsAt: value.endsAt.toISOString() },
  });

  const recipients = participantsOf(created, await activeReps());
  const reward = describeReward(created);
  const body = `Objectif : ${describeChallengeGoal(created.metric, created.target)} par commercial, ${challengePeriodLabel(created.startsAt, created.endsAt)}.${reward ? ` Récompense : ${reward}.` : ""}`;
  const outcomes = await Promise.allSettled(recipients.map((rep) => notifySalesRep({ salesRepId: rep.id, type: "CHALLENGE_CREATED", title: `Nouveau challenge : ${created.title}`, body, linkUrl: "/extranet/challenges" })));
  const notifyFailed = outcomes.filter((outcome) => outcome.status === "rejected").length;
  return { ok: true, id: created.id, notified: outcomes.length - notifyFailed, notifyFailed };
}

const FIELD_LABELS: Record<string, string> = { title: "titre", description: "description", metric: "ce qui est compté", target: "objectif", startsAt: "premier jour", endsAt: "dernier jour", rewardLabel: "récompense", rewardCents: "montant de la prime" };

/**
 * Modifie un challenge. Ce qui ne bouge plus dépend de l'état : en cours, on ne
 * change plus ce qui est compté ni le premier jour ; terminé, que les textes et
 * la récompense (voir `lockedFieldsFor`). Le serveur le rappelle : un champ
 * verrouillé qu'on essaie de changer est refusé, jamais ignoré en silence.
 */
export async function updateChallenge(id: string, input: ChallengeFormInput, actor: ChallengeActor, now: Date = new Date()): Promise<ChallengeWriteResult<{ changed: string[] }>> {
  const current = await prisma.salesChallenge.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Challenge introuvable." };
  const state = challengeState(current, now);

  const validation = validateChallengeForm(input, { now, requireFutureEnd: state !== "ENDED" });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.fieldErrors };
  const value = validation.value;

  const violations = lockedFieldViolations(current, value, state);
  if (violations.length > 0) {
    const labels = violations.map((field) => LOCKED_FIELD_LABELS[field]).join(", ");
    const why = state === "UPCOMING" ? "" : state === "RUNNING" ? "Le challenge a commencé" : "Le challenge est terminé";
    return { ok: false, error: `${why ? `${why} : ` : ""}${labels} ne se modifie plus. Rechargez la page.`, fieldErrors: Object.fromEntries(violations.map((field) => [field, "Ne se modifie plus."])) };
  }

  // Un jour verrouillé garde son instant d'origine (un challenge terminé à la main finit à l'instant du geste, pas à minuit).
  const locked = lockedFieldsFor(state);
  const next = {
    title: value.title,
    description: value.description,
    metric: value.metric,
    target: value.target,
    startsAt: locked.startsDay ? current.startsAt : value.startsAt,
    endsAt: locked.endsDay ? current.endsAt : value.endsAt,
    rewardLabel: value.rewardLabel,
    rewardCents: value.rewardCents,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => {
    const before = current[key];
    const after = next[key];
    return before instanceof Date && after instanceof Date ? before.getTime() !== after.getTime() : before !== after;
  });
  if (changed.length === 0) return { ok: true, changed: [] };

  // La ligne n'a pas bougé depuis sa lecture : sinon, le directeur écraserait un autre geste sans le savoir.
  const written = await prisma.salesChallenge.updateMany({ where: { id, updatedAt: current.updatedAt }, data: next });
  if (written.count === 0) return { ok: false, error: "Le challenge a changé entre-temps. Rechargez la page." };

  await recordAudit({ action: "sales.challenge_saved", entityType: "SalesChallenge", entityId: id, ...auditIdentity(actor), metadata: { change: "updated", title: value.title, fields: changed.map((key) => FIELD_LABELS[key] ?? key) } });
  return { ok: true, changed: changed.map((key) => FIELD_LABELS[key] ?? key) };
}

/**
 * Termine un challenge EN COURS dès maintenant : il est arrêté et sa période se
 * ferme à cet instant, ce qui fige les résultats (le travail fait ensuite ne
 * compte plus). Un challenge à venir se supprime ; un challenge terminé l'est déjà.
 */
export async function endChallenge(id: string, actor: ChallengeActor, now: Date = new Date()): Promise<ChallengeWriteResult<{ title: string }>> {
  const current = await prisma.salesChallenge.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Challenge introuvable." };
  const state = challengeState(current, now);
  if (state === "UPCOMING") return { ok: false, error: "Ce challenge n'a pas commencé : supprimez-le plutôt." };
  if (state === "ENDED") return { ok: false, error: "Ce challenge est déjà terminé." };

  const written = await prisma.salesChallenge.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { isActive: false, endsAt: now } });
  if (written.count === 0) return { ok: false, error: "Le challenge a changé entre-temps. Rechargez la page." };
  await recordAudit({ action: "sales.challenge_saved", entityType: "SalesChallenge", entityId: id, ...auditIdentity(actor), metadata: { change: "ended", title: current.title, plannedEndsAt: current.endsAt.toISOString(), endedAt: now.toISOString() } });
  return { ok: true, title: current.title };
}

/** Supprime un challenge, quel que soit son état (l'interface demande confirmation). Les notifications déjà envoyées restent. */
export async function deleteChallenge(id: string, actor: ChallengeActor, now: Date = new Date()): Promise<ChallengeWriteResult<{ title: string }>> {
  const current = await prisma.salesChallenge.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Challenge introuvable." };
  const removed = await prisma.salesChallenge.deleteMany({ where: { id } });
  if (removed.count === 0) return { ok: false, error: "Challenge introuvable." };
  await recordAudit({ action: "sales.challenge_deleted", entityType: "SalesChallenge", entityId: id, ...auditIdentity(actor), metadata: { title: current.title, metric: current.metric, state: challengeState(current, now) } });
  return { ok: true, title: current.title };
}

// ---- Lectures d'un commercial ------------------------------------------------------

export type RepChallengeRow = {
  challenge: Pick<ChallengeRecord, "id" | "title" | "description" | "metric" | "target" | "startsAt" | "endsAt" | "rewardLabel" | "rewardCents">;
  state: ChallengeState;
  stoppedEarly: boolean;
  /** Son propre avancement ; `null` s'il ne participe pas (compte inactif, arrivé après la fin) ou si le challenge n'a pas commencé. */
  mine: { value: number; target: number; percent: number; reached: boolean; rank: number | null } | null;
  /** Le nombre de commerciaux qui participent. */
  participants: number;
  /** Le classement : rang, prénom + initiale du nom, résultat. JAMAIS d'identifiant, de nom complet ni de dossier d'un autre commercial. */
  ranking: { rank: number; name: string; value: number; isMe: boolean }[];
};

const REP_ENDED_LIMIT = 10;

/**
 * Les challenges vus d'un commercial : son avancement et son rang, et pour les
 * autres seulement le classement (prénom + initiale du nom). Sert l'extranet
 * (« Mes challenges ») et la fiche du commercial côté directeur.
 */
export async function challengesOfRep(salesRepId: string, now: Date = new Date()): Promise<{ running: RepChallengeRow[]; upcoming: RepChallengeRow[]; ended: RepChallengeRow[] }> {
  const all = await prisma.salesChallenge.findMany({ orderBy: { startsAt: "desc" }, take: 300 });
  const groups = groupChallengesByState(all, now);
  const reps = await activeReps();

  const view = async (challenge: ChallengeRecord, withProgress: boolean): Promise<RepChallengeRow> => {
    const base = { challenge: { id: challenge.id, title: challenge.title, description: challenge.description, metric: challenge.metric, target: challenge.target, startsAt: challenge.startsAt, endsAt: challenge.endsAt, rewardLabel: challenge.rewardLabel, rewardCents: challenge.rewardCents }, state: challengeState(challenge, now), stoppedEarly: !challenge.isActive };
    if (!withProgress) return { ...base, mine: null, participants: participantsOf(challenge, reps).length, ranking: [] };
    const progress = await progressWith(challenge, reps, now);
    const me = progress.reps.find((rep) => rep.salesRepId === salesRepId);
    return {
      ...base,
      mine: me ? { value: me.value, target: me.target, percent: me.percent, reached: me.reached, rank: me.rank } : null,
      participants: progress.totals.participants,
      ranking: progress.ranking.map((rep) => ({ rank: rep.rank as number, name: rep.shortName, value: rep.value, isMe: rep.salesRepId === salesRepId })),
    };
  };

  const [running, ended] = await Promise.all([Promise.all(groups.running.map((c) => view(c, true))), Promise.all(groups.ended.slice(0, REP_ENDED_LIMIT).map((c) => view(c, true)))]);
  const upcoming = await Promise.all(groups.upcoming.map((c) => view(c, false)));
  return { running, upcoming, ended };
}
