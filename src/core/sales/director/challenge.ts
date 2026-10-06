import { dayKeyDiff, parisDayInputToDate, parisDayKey } from "@/core/sales/board";

/**
 * Les challenges de l'équipe commerciale : un objectif par commercial sur une
 * période, pour tous les commerciaux actifs.
 *
 * Tout ce fichier est pur (aucune base, aucune horloge : « maintenant » est
 * toujours passé par l'appelant). Une règle domine : l'avancement se calcule
 * TOUJOURS à partir des dossiers réels, jamais d'une saisie. Ici, on ne fait
 * que l'assembler, le classer et l'écrire en français ; le service compte les
 * dossiers.
 *
 * La période est un intervalle [début, fin[ : le dernier instant compté est la
 * dernière milliseconde avant `endsAt`. Les dates se saisissent en jours
 * (« du 1er au 31 octobre », bornes incluses, heure de Paris) ; `endsAt` est donc
 * minuit, heure de Paris, du lendemain du dernier jour.
 */

export const CHALLENGE_METRICS = ["PROSPECTS_CREATED", "DEMOS_DONE", "CONTRACTS_SIGNED", "ACTIVATIONS"] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export const CHALLENGE_METRIC_LABELS: Record<ChallengeMetric, string> = {
  PROSPECTS_CREATED: "Dossiers créés",
  DEMOS_DONE: "Démonstrations réalisées",
  CONTRACTS_SIGNED: "Contrats signés",
  ACTIVATIONS: "Officines activées",
};

/** L'unité, au singulier et au pluriel : « 1 démonstration réalisée », « 5 démonstrations réalisées ». */
export const CHALLENGE_METRIC_UNITS: Record<ChallengeMetric, { one: string; many: string }> = {
  PROSPECTS_CREATED: { one: "dossier créé", many: "dossiers créés" },
  DEMOS_DONE: { one: "démonstration réalisée", many: "démonstrations réalisées" },
  CONTRACTS_SIGNED: { one: "contrat signé", many: "contrats signés" },
  ACTIVATIONS: { one: "officine activée", many: "officines activées" },
};

/** Ce qui est compté, en une phrase : montré sous le choix de la métrique, pour qu'il n'y ait aucun doute. */
export const CHALLENGE_METRIC_HELP: Record<ChallengeMetric, string> = {
  PROSPECTS_CREATED: "Les dossiers d'officine créés pendant la période et suivis par le commercial.",
  DEMOS_DONE: "Les démonstrations marquées « réalisées » pendant la période, sur les dossiers du commercial.",
  CONTRACTS_SIGNED: "Les contrats signés par l'officine pendant la période : une officine compte une seule fois.",
  ACTIVATIONS: "Les officines passées « Activées » pendant la période (le titulaire s'est connecté à son espace) : une officine compte une seule fois.",
};

export function isChallengeMetric(value: unknown): value is ChallengeMetric {
  return typeof value === "string" && (CHALLENGE_METRICS as readonly string[]).includes(value);
}

const number = new Intl.NumberFormat("fr-FR");

/** « 5 démonstrations réalisées », « 1 contrat signé ». */
export function describeChallengeGoal(metric: ChallengeMetric, count: number): string {
  const unit = CHALLENGE_METRIC_UNITS[metric];
  return `${number.format(count)} ${count > 1 ? unit.many : unit.one}`;
}

// ---- État et période -----------------------------------------------------------

export type ChallengeState = "UPCOMING" | "RUNNING" | "ENDED";

export const CHALLENGE_STATE_LABELS: Record<ChallengeState, string> = {
  UPCOMING: "À venir",
  RUNNING: "En cours",
  ENDED: "Terminé",
};

/** Ce que l'état d'un challenge demande de lui : ses dates et son drapeau « actif ». */
export type ChallengeSchedule = { isActive: boolean; startsAt: Date; endsAt: Date };

/**
 * À venir avant `startsAt`, en cours jusqu'à `endsAt` exclu, terminé ensuite.
 * Un challenge arrêté à la main (`isActive` faux) est terminé, quelles que
 * soient ses dates.
 */
export function challengeState(challenge: ChallengeSchedule, now: Date): ChallengeState {
  if (!challenge.isActive) return "ENDED";
  if (now.getTime() < challenge.startsAt.getTime()) return "UPCOMING";
  if (now.getTime() >= challenge.endsAt.getTime()) return "ENDED";
  return "RUNNING";
}

/** Un instant est dans la période si `début ≤ instant < fin`. */
export function isInChallengeWindow(at: Date, challenge: { startsAt: Date; endsAt: Date }): boolean {
  return at.getTime() >= challenge.startsAt.getTime() && at.getTime() < challenge.endsAt.getTime();
}

/** Le dernier jour compté, « AAAA-MM-JJ » (heure de Paris) : la veille de `endsAt` à minuit. */
export function challengeLastDay(endsAt: Date): string {
  return parisDayKey(new Date(endsAt.getTime() - 1));
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dayParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

const dayWord = (day: number) => (day === 1 ? "1er" : String(day));

/** « du 1er au 31 octobre 2026 » : la période, bornes incluses, comme on la dit. */
export function challengePeriodLabel(startsAt: Date, endsAt: Date): string {
  const first = dayParts(parisDayKey(startsAt));
  const last = dayParts(challengeLastDay(endsAt));
  if (first.year === last.year && first.month === last.month) {
    if (first.day === last.day) return `le ${dayWord(first.day)} ${MONTHS[first.month - 1]} ${first.year}`;
    return `du ${dayWord(first.day)} au ${dayWord(last.day)} ${MONTHS[last.month - 1]} ${last.year}`;
  }
  if (first.year === last.year) return `du ${dayWord(first.day)} ${MONTHS[first.month - 1]} au ${dayWord(last.day)} ${MONTHS[last.month - 1]} ${last.year}`;
  return `du ${dayWord(first.day)} ${MONTHS[first.month - 1]} ${first.year} au ${dayWord(last.day)} ${MONTHS[last.month - 1]} ${last.year}`;
}

/** « 1er octobre 2026 », « 31 octobre 2026 » : un jour « AAAA-MM-JJ », écrit en toutes lettres. */
export function frenchDayLabel(key: string): string {
  const { year, month, day } = dayParts(key);
  return `${dayWord(day)} ${MONTHS[month - 1]} ${year}`;
}

/** « 1er », « 2e », « 3e » : le rang, écrit comme on le dit. */
export function ordinalFr(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

/**
 * Où en est le calendrier d'un challenge, en une phrase : « Plus que 5 jours »,
 * « Dernier jour aujourd'hui », « Commence dans 3 jours », « Terminé le 31 octobre 2026 ».
 */
export function challengeTimingLabel(challenge: ChallengeSchedule, now: Date): string {
  const state = challengeState(challenge, now);
  const today = parisDayKey(now);
  if (state === "UPCOMING") {
    const days = dayKeyDiff(today, parisDayKey(challenge.startsAt));
    return days <= 0 ? "Commence aujourd'hui" : days === 1 ? "Commence demain" : `Commence dans ${days} jours`;
  }
  if (state === "RUNNING") {
    const days = dayKeyDiff(today, challengeLastDay(challenge.endsAt));
    return days <= 0 ? "Dernier jour aujourd'hui" : days === 1 ? "Dernier jour demain" : `Plus que ${days} jours`;
  }
  const last = frenchDayLabel(challengeLastDay(challenge.endsAt));
  return challenge.isActive ? `Terminé le ${last}` : `Arrêté le ${last}`;
}

// ---- Avancement ----------------------------------------------------------------

/** Pourcentage de l'objectif, arrondi À L'ENTIER INFÉRIEUR : 100 ou plus si, et seulement si, l'objectif est atteint. */
export function progressPercent(value: number, target: number): number {
  if (target <= 0 || value <= 0) return 0;
  return Math.floor((value * 100) / target);
}

/** « Marie D. » : le prénom et l'initiale du nom, ce que les autres commerciaux ont le droit de voir. */
export function shortRepName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}

export type ChallengeRepProgress = {
  salesRepId: string;
  /** « Marie Dupont » : pour le directeur. */
  name: string;
  /** « Marie D. » : pour les autres commerciaux. */
  shortName: string;
  /** Ce que le commercial a réalisé dans la période, compté sur ses dossiers. */
  value: number;
  target: number;
  percent: number;
  reached: boolean;
  /** Le rang (les ex æquo partagent le leur : 1, 2, 2, 4) ; `null` tant que le commercial n'a rien réalisé. */
  rank: number | null;
};

export type ChallengeTotals = {
  /** Les commerciaux actifs qui participent. */
  participants: number;
  reached: number;
  /** La part de ceux qui ont atteint l'objectif, de 0 à 1. */
  reachedShare: number;
  totalValue: number;
  /** L'objectif de toute l'équipe : l'objectif par commercial × le nombre de participants. */
  totalTarget: number;
};

export type ChallengeProgress = {
  challengeId: string;
  metric: ChallengeMetric;
  target: number;
  state: ChallengeState;
  startsAt: Date;
  endsAt: Date;
  /** Un commercial par ligne, DÉJÀ classés : le plus avancé d'abord, puis par nom. */
  reps: ChallengeRepProgress[];
  /** Le classement : les mêmes lignes que `reps`, sans celles qui n'ont encore rien réalisé. */
  ranking: ChallengeRepProgress[];
  totals: ChallengeTotals;
};

export type ChallengeRefForProgress = ChallengeSchedule & { id: string; metric: ChallengeMetric; target: number };
export type ChallengeRepRef = { id: string; firstName: string; lastName: string };

const byName = (a: { name: string; salesRepId: string }, b: { name: string; salesRepId: string }) => a.name.localeCompare(b.name, "fr") || a.salesRepId.localeCompare(b.salesRepId);

/**
 * Assemble l'avancement : une ligne par commercial participant, classée, et les
 * totaux. `values` donne, par commercial, ce que ses dossiers réels ont produit
 * dans la période (absent = 0). Les commerciaux sont déjà ceux qui participent
 * (actifs, présents pendant la période) : le service les a choisis.
 */
export function buildChallengeProgress(input: { challenge: ChallengeRefForProgress; reps: ChallengeRepRef[]; values: ReadonlyMap<string, number> | Record<string, number>; now: Date }): ChallengeProgress {
  const { challenge, now } = input;
  const read = (id: string): number => {
    const raw = input.values instanceof Map ? input.values.get(id) : (input.values as Record<string, number>)[id];
    return Number.isFinite(raw) && (raw as number) > 0 ? Math.floor(raw as number) : 0;
  };

  const rows = input.reps
    .map((rep) => {
      const value = read(rep.id);
      return {
        salesRepId: rep.id,
        name: `${rep.firstName} ${rep.lastName}`.trim(),
        shortName: shortRepName(rep.firstName, rep.lastName),
        value,
        target: challenge.target,
        percent: progressPercent(value, challenge.target),
        reached: challenge.target > 0 && value >= challenge.target,
      };
    })
    .sort((a, b) => b.value - a.value || byName(a, b));

  // Rang « de compétition » : 1 + le nombre de commerciaux strictement devant.
  const reps: ChallengeRepProgress[] = rows.map((row) => ({ ...row, rank: row.value > 0 ? 1 + rows.filter((other) => other.value > row.value).length : null }));
  const reached = reps.filter((rep) => rep.reached).length;

  return {
    challengeId: challenge.id,
    metric: challenge.metric,
    target: challenge.target,
    state: challengeState(challenge, now),
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    reps,
    ranking: reps.filter((rep) => rep.rank !== null),
    totals: {
      participants: reps.length,
      reached,
      reachedShare: reps.length > 0 ? reached / reps.length : 0,
      totalValue: reps.reduce((sum, rep) => sum + rep.value, 0),
      totalTarget: challenge.target * reps.length,
    },
  };
}

/** « 3 commerciaux sur 6 ont atteint l'objectif. » : la phrase qui résume un challenge. */
export function describeReached(totals: Pick<ChallengeTotals, "participants" | "reached">): string {
  const { participants, reached } = totals;
  if (participants === 0) return "Aucun commercial actif ne participe pour l'instant.";
  if (participants === 1) return reached > 0 ? "Le commercial a atteint l'objectif." : "Le commercial n'a pas encore atteint l'objectif.";
  if (reached === 0) return `Aucun des ${participants} commerciaux n'a encore atteint l'objectif.`;
  if (reached === 1) return `1 commercial sur ${participants} a atteint l'objectif.`;
  return `${reached} commerciaux sur ${participants} ont atteint l'objectif.`;
}

// ---- Tri des listes --------------------------------------------------------------

/** En cours (la fin la plus proche d'abord), à venir (le plus proche d'abord), terminés (le plus récent d'abord). */
export function groupChallengesByState<T extends ChallengeSchedule>(challenges: T[], now: Date): { running: T[]; upcoming: T[]; ended: T[] } {
  const running = challenges.filter((c) => challengeState(c, now) === "RUNNING").sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  const upcoming = challenges.filter((c) => challengeState(c, now) === "UPCOMING").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const ended = challenges.filter((c) => challengeState(c, now) === "ENDED").sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return { running, upcoming, ended };
}

// ---- Saisie et validation --------------------------------------------------------

/** Ce que le formulaire envoie : des textes, tels que saisis. */
export type ChallengeFormInput = {
  title?: unknown;
  description?: unknown;
  metric?: unknown;
  target?: unknown;
  /** Premier jour, « AAAA-MM-JJ ». */
  startsDay?: unknown;
  /** DERNIER jour, inclus, « AAAA-MM-JJ ». */
  endsDay?: unknown;
  rewardLabel?: unknown;
  /** Montant de la prime, en euros (« 200 », « 200,50 »). */
  rewardEuros?: unknown;
};

export type ChallengeValues = {
  title: string;
  description: string | null;
  metric: ChallengeMetric;
  target: number;
  startsAt: Date;
  /** Exclu : minuit, heure de Paris, du lendemain du dernier jour. */
  endsAt: Date;
  rewardLabel: string | null;
  rewardCents: number | null;
};

export type ChallengeValidation = { ok: true; value: ChallengeValues } | { ok: false; error: string; fieldErrors: Record<string, string> };

export const CHALLENGE_LIMITS = { titleMin: 3, titleMax: 80, descriptionMax: 500, targetMax: 1000, rewardLabelMax: 120, rewardEurosMax: 100_000, maxDays: 366 } as const;

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

/** Un nombre saisi « 200 » ou « 200,5 » ; `null` s'il est illisible. */
function readNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = asText(raw).replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function addDays(key: string, count: number): string {
  const { year, month, day } = dayParts(key);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

/** Un jour « AAAA-MM-JJ » existant, entre 2000 et 2100 ; minuit à Paris, ou `null`. */
function readDay(raw: unknown): { key: string; at: Date } | null {
  const key = asText(raw);
  const at = parisDayInputToDate(key, "00:00");
  if (!at) return null;
  const year = Number(key.slice(0, 4));
  return year >= 2000 && year <= 2100 ? { key, at } : null;
}

/**
 * Les règles d'un challenge, dites une par une, champ par champ. Le serveur
 * rappelle cette fonction : l'écran ne protège rien.
 *
 * - `requireFutureEnd` : la fin doit être dans le futur (création, challenge en
 *   cours). Un challenge qui commence dans le passé reste permis : l'avancement
 *   se compte sur les dossiers réels, il rattrape donc le début du mois.
 */
export function validateChallengeForm(input: ChallengeFormInput, options: { now?: Date; requireFutureEnd?: boolean } = {}): ChallengeValidation {
  const fieldErrors: Record<string, string> = {};

  const title = asText(input.title);
  if (title.length < CHALLENGE_LIMITS.titleMin) fieldErrors.title = `Donnez un titre au challenge (${CHALLENGE_LIMITS.titleMin} caractères au moins).`;
  else if (title.length > CHALLENGE_LIMITS.titleMax) fieldErrors.title = `${CHALLENGE_LIMITS.titleMax} caractères au plus.`;

  const description = asText(input.description);
  if (description.length > CHALLENGE_LIMITS.descriptionMax) fieldErrors.description = `${CHALLENGE_LIMITS.descriptionMax} caractères au plus.`;

  const metric = input.metric;
  if (!isChallengeMetric(metric)) fieldErrors.metric = "Choisissez ce que le challenge compte.";

  const targetNumber = readNumber(input.target);
  let target = 0;
  if (targetNumber === null || !Number.isInteger(targetNumber) || targetNumber < 1) fieldErrors.target = "L'objectif est un nombre entier, d'au moins 1.";
  else if (targetNumber > CHALLENGE_LIMITS.targetMax) fieldErrors.target = `L'objectif ne peut pas dépasser ${number.format(CHALLENGE_LIMITS.targetMax)}.`;
  else target = targetNumber;

  const start = readDay(input.startsDay);
  const end = readDay(input.endsDay);
  if (!start) fieldErrors.startsDay = "Choisissez le premier jour du challenge.";
  if (!end) fieldErrors.endsDay = "Choisissez le dernier jour du challenge.";
  let endsAt: Date | null = null;
  if (start && end) {
    const days = dayKeyDiff(start.key, end.key);
    if (days < 0) fieldErrors.endsDay = "Le dernier jour ne peut pas précéder le premier.";
    else if (days + 1 > CHALLENGE_LIMITS.maxDays) fieldErrors.endsDay = "Un challenge dure un an au plus.";
    else {
      endsAt = parisDayInputToDate(addDays(end.key, 1), "00:00");
      if (endsAt && options.requireFutureEnd && options.now && endsAt.getTime() <= options.now.getTime()) fieldErrors.endsDay = "Le dernier jour est déjà passé. Pour arrêter un challenge en cours, utilisez « Terminer ».";
    }
  }

  const rewardLabel = asText(input.rewardLabel);
  if (rewardLabel.length > CHALLENGE_LIMITS.rewardLabelMax) fieldErrors.rewardLabel = `${CHALLENGE_LIMITS.rewardLabelMax} caractères au plus.`;

  let rewardCents: number | null = null;
  const euros = asText(input.rewardEuros);
  if (euros !== "") {
    const amount = readNumber(input.rewardEuros);
    if (amount === null || amount < 0) fieldErrors.rewardEuros = "Saisissez un montant en euros (exemple : 200).";
    else if (amount > CHALLENGE_LIMITS.rewardEurosMax) fieldErrors.rewardEuros = `Le montant ne peut pas dépasser ${number.format(CHALLENGE_LIMITS.rewardEurosMax)} €.`;
    else if (amount > 0) {
      rewardCents = Math.round(amount * 100);
      if (!rewardLabel && !fieldErrors.rewardLabel) fieldErrors.rewardLabel = "Décrivez la récompense (« prime de 200 € ») ou retirez le montant.";
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !start || !endsAt || !isChallengeMetric(metric)) {
    const error = Object.values(fieldErrors)[0] ?? "Vérifiez les informations du challenge.";
    return { ok: false, error, fieldErrors };
  }
  return { ok: true, value: { title, description: description || null, metric, target, startsAt: start.at, endsAt, rewardLabel: rewardLabel || null, rewardCents } };
}

// ---- Modifier un challenge -------------------------------------------------------

/**
 * Ce qui ne bouge plus selon l'état : à venir, tout se modifie ; en cours, on
 * ne change plus ce qui est compté ni le premier jour (les résultats déjà
 * obtenus changeraient de sens) ; terminé, seuls les textes et la récompense.
 */
export type LockedFields = { metric: boolean; target: boolean; startsDay: boolean; endsDay: boolean };

export function lockedFieldsFor(state: ChallengeState): LockedFields {
  if (state === "UPCOMING") return { metric: false, target: false, startsDay: false, endsDay: false };
  if (state === "RUNNING") return { metric: true, target: false, startsDay: true, endsDay: false };
  return { metric: true, target: true, startsDay: true, endsDay: true };
}

/** Les champs verrouillés que la modification voudrait pourtant changer (liste vide : rien à signaler). */
export function lockedFieldViolations(current: { metric: ChallengeMetric; target: number; startsAt: Date; endsAt: Date }, next: ChallengeValues, state: ChallengeState): (keyof LockedFields)[] {
  const locked = lockedFieldsFor(state);
  const violations: (keyof LockedFields)[] = [];
  if (locked.metric && next.metric !== current.metric) violations.push("metric");
  if (locked.target && next.target !== current.target) violations.push("target");
  // On compare des JOURS (ceux que le formulaire montre), pas des instants : un challenge terminé à la main a pour fin
  // l'instant du geste, que le formulaire ne sait pas dire autrement que par le jour.
  if (locked.startsDay && parisDayKey(next.startsAt) !== parisDayKey(current.startsAt)) violations.push("startsDay");
  if (locked.endsDay && challengeLastDay(next.endsAt) !== challengeLastDay(current.endsAt)) violations.push("endsDay");
  return violations;
}

export const LOCKED_FIELD_LABELS: Record<keyof LockedFields, string> = {
  metric: "ce que le challenge compte",
  target: "l'objectif",
  startsDay: "le premier jour",
  endsDay: "le dernier jour",
};

/** Les valeurs d'un challenge existant, au format du formulaire. */
export function challengeToForm(challenge: { title: string; description: string | null; metric: ChallengeMetric; target: number; startsAt: Date; endsAt: Date; rewardLabel: string | null; rewardCents: number | null }) {
  return {
    title: challenge.title,
    description: challenge.description ?? "",
    metric: challenge.metric,
    target: String(challenge.target),
    startsDay: parisDayKey(challenge.startsAt),
    endsDay: challengeLastDay(challenge.endsAt),
    rewardLabel: challenge.rewardLabel ?? "",
    rewardEuros: challenge.rewardCents === null ? "" : challenge.rewardCents % 100 === 0 ? String(challenge.rewardCents / 100) : (challenge.rewardCents / 100).toFixed(2).replace(".", ","),
  };
}

/** Un nouveau challenge : il commence aujourd'hui et court jusqu'à la fin du mois (jours de Paris). */
export function defaultChallengeForm(now: Date) {
  const today = parisDayKey(now);
  const { year, month } = dayParts(today);
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { title: "", description: "", metric: "DEMOS_DONE" as ChallengeMetric, target: "5", startsDay: today, endsDay: lastOfMonth, rewardLabel: "", rewardEuros: "" };
}

/** La récompense, en une ligne : « prime de 200 € » (le texte seul, ou le montant seul s'il n'y a que lui). */
export function describeReward(reward: { rewardLabel: string | null; rewardCents: number | null }): string | null {
  if (reward.rewardLabel) return reward.rewardLabel;
  if (reward.rewardCents) return `${number.format(reward.rewardCents / 100)} €`;
  return null;
}
