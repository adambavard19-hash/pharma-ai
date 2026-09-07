/**
 * Périodes d'analyse. Toutes les bornes sont calculées dans le fuseau de
 * l'officine (Europe/Paris par défaut) : un « aujourd'hui » qui basculerait à
 * 2 h du matin fausserait le pilotage.
 */

export type PeriodKey = "today" | "week" | "month" | "quarter" | "year" | "custom";

export type PeriodRange = {
  key: PeriodKey;
  label: string;
  start: Date;
  end: Date;
  /** Période immédiatement précédente, de même durée — sert aux variations. */
  previousStart: Date;
  previousEnd: Date;
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
  quarter: "Ce trimestre",
  year: "Cette année",
  custom: "Période personnalisée",
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Lundi comme premier jour de la semaine (usage français). */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Les périodes calculables à partir d'une seule clé. `custom` en est exclue par
 * construction : elle a besoin de deux bornes, et passe donc par
 * `resolveCustomPeriod`.
 */
export type FixedPeriodKey = Exclude<PeriodKey, "custom">;

export function resolvePeriod(key: FixedPeriodKey, now = new Date()): PeriodRange {
  const end = now;
  let start: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (key) {
    case "today": {
      start = startOfDay(now);
      previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = new Date(start);
      break;
    }
    case "week": {
      start = startOfWeek(now);
      previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 7);
      previousEnd = new Date(start);
      break;
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(start);
      break;
    }
    case "quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      previousStart = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
      previousEnd = new Date(start);
      break;
    }
    case "year": {
      start = new Date(now.getFullYear(), 0, 1);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(start);
      break;
    }
  }

  return { key, label: PERIOD_LABELS[key], start, end, previousStart, previousEnd };
}

/**
 * Période bornée à la main par le titulaire.
 *
 * Elle n'a pas de clé propre — c'est un `month` dont on a déplacé les bornes —
 * parce qu'aucun calcul en aval ne dépend de la clé : ils lisent tous `start` et
 * `end`. La période de comparaison est la tranche de même durée qui la précède
 * immédiatement, seule définition qui garde un sens quelle que soit la fenêtre
 * choisie (trois jours comme onze mois).
 */
export function resolveCustomPeriod(fromISO: string, toISO: string): PeriodRange | null {
  const start = parseISODate(fromISO);
  const end = parseISODate(toISO);
  if (!start || !end) return null;

  // La borne haute est inclusive : « du 1er au 3 » comprend le 3 en entier.
  end.setHours(23, 59, 59, 999);
  if (end < start) return null;

  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start);
  const previousStart = new Date(start.getTime() - durationMs);

  return {
    key: "custom",
    label: `Du ${formatShort(start)} au ${formatShort(end)}`,
    start,
    end,
    previousStart,
    previousEnd,
  };
}

/** `YYYY-MM-DD` en date locale à minuit. Rejette tout le reste. */
function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Une saisie du 31 février donnerait le 3 mars : on la refuse plutôt que de
  // piloter l'officine sur une période que personne n'a demandée.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatShort(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date);
}

/** Série de jours consécutifs, bornes incluses. */
export function dayRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isPeriodKey(value: string | null | undefined): value is FixedPeriodKey {
  return (
    value === "today" ||
    value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year"
  );
}
