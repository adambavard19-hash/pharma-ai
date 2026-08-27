/**
 * Périodes d'analyse. Toutes les bornes sont calculées dans le fuseau de
 * l'officine (Europe/Paris par défaut) : un « aujourd'hui » qui basculerait à
 * 2 h du matin fausserait le pilotage.
 */

export type PeriodKey = "today" | "week" | "month" | "quarter" | "year";

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

export function resolvePeriod(key: PeriodKey, now = new Date()): PeriodRange {
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

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return (
    value === "today" ||
    value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "year"
  );
}
