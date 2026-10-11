/**
 * Les objectifs personnels d'un collaborateur, dans SON officine — règles pures (périodes, validation, avancement).
 *
 * Un objectif se mesure sur des faits déjà en base, jamais sur une estimation :
 *  - « Conseils proposés » : les conseils PharmaBoost apparus sur ses ventes (comptoir qui lui est attribué, ou saisies) ;
 *  - « Conseils validés » : ceux qui ont été retenus (accepté, modifié, remplacé, présenté, acheté — déclaré « Vendu ») ;
 *  - « Unités vendues » : les unités déclarées vendues de ses conseils, ou ses unités d'un challenge quand l'objectif en découle ;
 *  - « Formations terminées » : ses formations marquées terminées sur la période ;
 *  - « Objectif libre » : rien n'est mesuré automatiquement, le titulaire en juge.
 */

export const OBJECTIVE_METRICS = ["ADVICE_PRESENTED", "ADVICE_SOLD", "UNITS_SOLD", "TRAININGS_COMPLETED", "CUSTOM"] as const;
export type ObjectiveMetricCode = (typeof OBJECTIVE_METRICS)[number];
export const OBJECTIVE_PERIODS = ["WEEK", "MONTH", "QUARTER", "CUSTOM"] as const;
export type ObjectivePeriodCode = (typeof OBJECTIVE_PERIODS)[number];

export const OBJECTIVE_METRIC_LABELS: Record<ObjectiveMetricCode, string> = {
  ADVICE_PRESENTED: "Conseils proposés",
  ADVICE_SOLD: "Conseils validés",
  UNITS_SOLD: "Unités vendues",
  TRAININGS_COMPLETED: "Formations terminées",
  CUSTOM: "Objectif libre",
};

export const OBJECTIVE_METRIC_HINTS: Record<ObjectiveMetricCode, string> = {
  ADVICE_PRESENTED: "Les conseils PharmaBoost apparus sur les ventes de votre comptoir.",
  ADVICE_SOLD: "Les conseils retenus : acceptés, présentés ou déclarés « Vendu ».",
  UNITS_SOLD: "Les unités déclarées vendues de vos conseils (ou du challenge lié).",
  TRAININGS_COMPLETED: "Les formations que vous avez terminées sur la période.",
  CUSTOM: "Suivi par votre titulaire : rien n'est compté automatiquement.",
};

export const OBJECTIVE_PERIOD_LABELS: Record<ObjectivePeriodCode, string> = {
  WEEK: "Cette semaine",
  MONTH: "Ce mois",
  QUARTER: "Ce trimestre",
  CUSTOM: "Dates choisies",
};

export const MAX_OBJECTIVE_TARGET = 10_000;
export const MAX_OBJECTIVE_DAYS = 366;

export function isObjectiveMetric(value: unknown): value is ObjectiveMetricCode {
  return typeof value === "string" && (OBJECTIVE_METRICS as readonly string[]).includes(value);
}
export function isObjectivePeriod(value: unknown): value is ObjectivePeriodCode {
  return typeof value === "string" && (OBJECTIVE_PERIODS as readonly string[]).includes(value);
}

/** « 2026-10-11 » → date UTC à minuit. */
function utc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}
const DAY_MS = 86_400_000;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = utc(value);
  return !Number.isNaN(date.getTime()) && key(date) === value;
}

/** Nombre de jours de `from` à `to`, bornes comprises. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS) + 1;
}

/** Les bornes (incluses) d'une période qui contient `today` : semaine du lundi au dimanche, mois, trimestre civils. */
export function periodBounds(period: Exclude<ObjectivePeriodCode, "CUSTOM">, today: string): { startsOn: string; endsOn: string } {
  const date = utc(today);
  if (period === "WEEK") {
    const weekday = (date.getUTCDay() + 6) % 7; // lundi = 0
    const start = new Date(date.getTime() - weekday * DAY_MS);
    return { startsOn: key(start), endsOn: key(new Date(start.getTime() + 6 * DAY_MS)) };
  }
  const year = date.getUTCFullYear();
  const firstMonth = period === "MONTH" ? date.getUTCMonth() : Math.floor(date.getUTCMonth() / 3) * 3;
  const months = period === "MONTH" ? 1 : 3;
  const start = new Date(Date.UTC(year, firstMonth, 1));
  const end = new Date(Date.UTC(year, firstMonth + months, 0));
  return { startsOn: key(start), endsOn: key(end) };
}

export type ObjectiveDraft = {
  userId: string;
  title: string;
  metric: string;
  target: number;
  period: string;
  startsOn?: string | null;
  endsOn?: string | null;
  challengeId?: string | null;
};

export type ObjectiveInput = {
  userId: string;
  title: string;
  metric: ObjectiveMetricCode;
  target: number;
  period: ObjectivePeriodCode;
  startsOn: string;
  endsOn: string;
  challengeId: string | null;
};

/** Contrôle d'une saisie du titulaire. Les bornes d'une période civile se calculent ; celles d'une période libre se vérifient. */
export function validateObjective(draft: ObjectiveDraft, today: string): { ok: true; value: ObjectiveInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const title = draft.title.trim().replace(/\s+/g, " ");
  if (!draft.userId) fieldErrors.userId = "Choisissez le collaborateur.";
  if (title.length < 3) fieldErrors.title = "Donnez un nom à l'objectif (3 caractères au moins).";
  else if (title.length > 80) fieldErrors.title = "80 caractères au plus.";
  if (!isObjectiveMetric(draft.metric)) fieldErrors.metric = "Choisissez ce qui est mesuré.";
  if (!Number.isInteger(draft.target) || draft.target < 1 || draft.target > MAX_OBJECTIVE_TARGET) fieldErrors.target = `Une cible entière, de 1 à ${MAX_OBJECTIVE_TARGET}.`;
  if (!isObjectivePeriod(draft.period)) fieldErrors.period = "Choisissez la période.";

  let startsOn = "";
  let endsOn = "";
  if (isObjectivePeriod(draft.period)) {
    if (draft.period === "CUSTOM") {
      if (!isDayKey(draft.startsOn)) fieldErrors.startsOn = "Date de début invalide.";
      if (!isDayKey(draft.endsOn)) fieldErrors.endsOn = "Date de fin invalide.";
      if (isDayKey(draft.startsOn) && isDayKey(draft.endsOn)) {
        startsOn = draft.startsOn;
        endsOn = draft.endsOn;
        const days = daysInclusive(startsOn, endsOn);
        if (days < 1) fieldErrors.endsOn = "La fin doit suivre le début.";
        else if (days > MAX_OBJECTIVE_DAYS) fieldErrors.endsOn = "Un an au plus.";
        else if (daysInclusive(today, endsOn) < 1) fieldErrors.endsOn = "Cette période est déjà terminée.";
      }
    } else {
      ({ startsOn, endsOn } = periodBounds(draft.period, today));
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: { userId: draft.userId, title, metric: draft.metric as ObjectiveMetricCode, target: draft.target, period: draft.period as ObjectivePeriodCode, startsOn, endsOn, challengeId: draft.challengeId || null },
  };
}

export type ObjectiveState = "UPCOMING" | "DONE" | "ON_TRACK" | "BEHIND" | "MISSED" | "MANUAL";

export const OBJECTIVE_STATE_LABELS: Record<ObjectiveState, string> = {
  UPCOMING: "À venir",
  DONE: "Atteint",
  ON_TRACK: "Dans les temps",
  BEHIND: "À accélérer",
  MISSED: "Non atteint",
  MANUAL: "Suivi par le titulaire",
};

export type ObjectiveProgress = {
  /** Null pour un objectif libre : rien n'est mesuré. */
  value: number | null;
  target: number;
  /** 0 → 100, plafonné. Null : objectif libre. */
  percent: number | null;
  state: ObjectiveState;
  /** Jours restants, aujourd'hui compris ; 0 une fois terminé. */
  daysRemaining: number;
};

/**
 * L'avancement : « dans les temps » quand la part atteinte suit la part des jours déjà passés (aujourd'hui n'est pas
 * compté : le matin, on n'est pas déjà en retard).
 */
export function objectiveProgress(objective: { metric: string; target: number; startsOn: string; endsOn: string }, value: number | null, today: string): ObjectiveProgress {
  const total = Math.max(1, daysInclusive(objective.startsOn, objective.endsOn));
  const remaining = Math.max(0, Math.min(total, daysInclusive(today, objective.endsOn)));
  const target = Math.max(1, objective.target);
  if (objective.metric === "CUSTOM" || value === null) {
    return { value: null, target, percent: null, state: daysInclusive(today, objective.startsOn) > 1 ? "UPCOMING" : "MANUAL", daysRemaining: remaining };
  }
  const percent = Math.min(100, Math.round((value / target) * 100));
  if (daysInclusive(today, objective.startsOn) > 1) return { value, target, percent, state: "UPCOMING", daysRemaining: remaining };
  if (value >= target) return { value, target, percent, state: "DONE", daysRemaining: remaining };
  if (remaining === 0) return { value, target, percent, state: "MISSED", daysRemaining: 0 };
  const elapsed = (total - remaining) / total;
  return { value, target, percent, state: value / target + 1e-9 >= elapsed ? "ON_TRACK" : "BEHIND", daysRemaining: remaining };
}
