import type { Granularity, PerformancePeriod, PerformancePeriodKey } from "./types";

/**
 * Les périodes du suivi de performance : bornes de jour, comparaison et
 * lecture de l'adresse (`?periode=…&du=…&au=…`).
 *
 * Tout passe par `Intl.DateTimeFormat` avec le fuseau de l'officine : le
 * serveur tourne en UTC, `getHours()` ou `getDate()` donneraient un « jour »
 * décalé de une ou deux heures. Les jours du passage à l'heure d'été (23 h) et
 * d'hiver (25 h) ont donc leurs vraies bornes. Le calcul des dates du
 * calendrier est fait en entiers, sans `Date` : aucun piège sur les années à
 * deux chiffres ni sur les fins de mois.
 *
 * Choix de comparaison : la période précédente est la même fenêtre décalée,
 * à la même heure d'horloge (« hier à 12 h 30 », « il y a 7 jours à 12 h 30 »).
 * Une période terminée est comparée à la fenêtre de même longueur juste avant.
 */

/** Le rythme (jours et heures qui marchent) se lit toujours sur les 90 derniers jours. */
export const RHYTHM_WINDOW_DAYS = 90;

/** Longueur maximale d'une période personnalisée, en jours (bornes comprises). */
export const MAX_CUSTOM_PERIOD_DAYS = 366;

/**
 * Première année acceptée pour une période personnalisée. Bien avant, la base
 * refuse la date (l'an 1 et sa période précédente tombent en l'an 0, hors de
 * l'intervalle de PostgreSQL) : la page plantait au lieu de revenir à `7j`.
 */
export const MIN_CUSTOM_YEAR = 2000;

/** Jusqu'à 35 jours, un point par jour ; au-delà, un point par semaine. */
const DAY_GRANULARITY_MAX_DAYS = 35;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** La valeur de `?periode=` pour chaque choix. */
export const PERIOD_PARAM_VALUES = {
  today: "aujourdhui",
  "7d": "7j",
  month: "mois",
  custom: "perso",
} as const satisfies Record<PerformancePeriodKey, string>;

export type PeriodParamValue = (typeof PERIOD_PARAM_VALUES)[PerformancePeriodKey];

/** Les quatre choix de la barre de période, dans l'ordre d'affichage. */
export const PERIOD_OPTIONS: readonly { key: PerformancePeriodKey; value: PeriodParamValue; label: string }[] = [
  { key: "today", value: PERIOD_PARAM_VALUES.today, label: "Aujourd'hui" },
  { key: "7d", value: PERIOD_PARAM_VALUES["7d"], label: "7 derniers jours" },
  { key: "month", value: PERIOD_PARAM_VALUES.month, label: "Ce mois-ci" },
  { key: "custom", value: PERIOD_PARAM_VALUES.custom, label: "Personnalisée" },
];

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

// --- Calendrier (entiers purs) ----------------------------------------------------

type Civil = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Jours écoulés depuis le 1er janvier 1970 pour une date du calendrier. Le jour
 * peut dépasser le mois (0, 32…) : le calcul est linéaire, la date se replie.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Lundi = 0 … dimanche = 6 (le 1er janvier 1970 était un jeudi). */
function mondayIndex(daysSinceEpoch: number): number {
  return (((daysSinceEpoch + 3) % 7) + 7) % 7;
}

/** « Comme si » l'heure d'horloge était en UTC : sert à mesurer un décalage de fuseau. */
function wallAsUtcMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millis = 0): number {
  return daysFromCivil(year, month, day) * DAY_MS + hour * HOUR_MS + minute * 60_000 + second * 1000 + millis;
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
const formatIso = ({ year, month, day }: Civil) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** `yyyy-mm-dd` d'un vrai jour du calendrier, sinon `null`. */
function parseIsoDate(value: unknown): Civil | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Une date `yyyy-mm-dd` réelle : refuse 2026-02-31, 2026-13-01, 2026-02-29 (année non bissextile). */
export function isValidCalendarDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

// --- Fuseau horaire ---------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** L'heure d'horloge d'un instant dans le fuseau (à la seconde près). */
function zonedFields(instant: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour % 24,
    minute: values.minute,
    second: values.second,
  };
}

/** Décalage du fuseau à cet instant, en millisecondes (positif à l'est de Greenwich). */
function offsetAt(instant: number, timeZone: string): number {
  const f = zonedFields(instant, timeZone);
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  return wallAsUtcMs(f.year, f.month, f.day, f.hour, f.minute, f.second) - wholeSecond;
}

/**
 * L'instant qui affiche cette heure d'horloge dans le fuseau. Le jour peut
 * dépasser le mois (le calendrier se replie). Heure répétée (retour à l'heure
 * d'hiver) : la première occurrence. Heure qui n'existe pas (passage à l'heure
 * d'été) : l'heure décalée vers l'avant, comme le font les calendriers.
 */
function wallClockToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millis = 0,
): number {
  const naive = wallAsUtcMs(year, month, day, hour, minute, second, millis);
  const before = offsetAt(naive - DAY_MS, timeZone);
  const after = offsetAt(naive + DAY_MS, timeZone);
  const valid = [...new Set([before, after])]
    .map((offset) => naive - offset)
    .filter((candidate) => offsetAt(candidate, timeZone) === naive - candidate);
  return valid.length > 0 ? Math.min(...valid) : naive - before;
}

/** Le début (00:00) du jour civil `year-month-day` dans le fuseau. */
function startOfLocalDay(timeZone: string, year: number, month: number, day: number): number {
  return wallClockToInstant(timeZone, year, month, day);
}

/** Le même instant décalé de `days` jours, à la même heure d'horloge. */
function shiftWallDays(instant: number, timeZone: string, days: number): number {
  const f = zonedFields(instant, timeZone);
  const millis = instant - Math.floor(instant / 1000) * 1000;
  return wallClockToInstant(timeZone, f.year, f.month, f.day + days, f.hour, f.minute, f.second, millis);
}

/** Année, mois, jour, heure et jour de semaine (lundi = 0) d'un instant, dans le fuseau. */
export function zonedDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; weekday: number } {
  const f = zonedFields(date.getTime(), timeZone);
  return {
    year: f.year,
    month: f.month,
    day: f.day,
    hour: f.hour,
    weekday: mondayIndex(daysFromCivil(f.year, f.month, f.day)),
  };
}

/** Minuit du jour civil de `date` dans le fuseau : un jour peut durer 23, 24 ou 25 heures. */
export function zonedStartOfDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedDateParts(date, timeZone);
  return new Date(startOfLocalDay(timeZone, year, month, day));
}

/** Le mois civil de `now` : début, fin (début du mois suivant, exclue) et libellé « octobre 2026 ». */
export function monthBoundsFor(now: Date, timeZone: string): { start: Date; end: Date; label: string } {
  const { year, month } = zonedDateParts(now, timeZone);
  const next = shiftMonth(year, month, 1);
  return {
    start: new Date(startOfLocalDay(timeZone, year, month, 1)),
    end: new Date(startOfLocalDay(timeZone, next.year, next.month, 1)),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

// --- Périodes ---------------------------------------------------------------------

type Window = {
  key: PerformancePeriodKey;
  label: string;
  start: number;
  end: number;
  previousStart: number;
  previousEnd: number;
  dayCount: number;
  inProgress: boolean;
  from?: string;
  to?: string;
};

function toPeriod(window: Window): PerformancePeriod {
  const granularity: Granularity =
    window.key === "today" ? "hour" : window.dayCount <= DAY_GRANULARITY_MAX_DAYS ? "day" : "week";
  // La comparaison ne déborde jamais sur la période courante ni ne s'inverse.
  const previousEnd = Math.min(window.previousEnd, window.start);
  const previousStart = Math.min(window.previousStart, previousEnd);
  const period: PerformancePeriod = {
    key: window.key,
    label: window.label,
    start: new Date(window.start),
    end: new Date(window.end),
    previousStart: new Date(previousStart),
    previousEnd: new Date(previousEnd),
    granularity,
    dayCount: window.dayCount,
    inProgress: window.inProgress,
  };
  if (window.from !== undefined && window.to !== undefined) {
    period.from = window.from;
    period.to = window.to;
  }
  return period;
}

/** Une fenêtre comparée à la même fenêtre décalée de `shiftDays` jours, à la même heure d'horloge. */
function shiftedWindow(
  timeZone: string,
  base: Omit<Window, "previousStart" | "previousEnd">,
  shiftDays: number,
): PerformancePeriod {
  return toPeriod({
    ...base,
    previousStart: shiftWallDays(base.start, timeZone, -shiftDays),
    previousEnd: shiftWallDays(base.end, timeZone, -shiftDays),
  });
}

/** Le jour du mois, à la française : « 1er » le premier du mois, « 2 », « 3 »… sinon. */
const dayText = (day: number) => (day === 1 ? "1er" : String(day));

function customLabel(from: Civil, to: Civil): string {
  const month = (civil: Civil) => MONTH_NAMES[civil.month - 1];
  if (from.year === to.year && from.month === to.month) {
    return from.day === to.day
      ? `Le ${dayText(to.day)} ${month(to)} ${to.year}`
      : `Du ${dayText(from.day)} au ${dayText(to.day)} ${month(to)} ${to.year}`;
  }
  if (from.year === to.year) return `Du ${dayText(from.day)} ${month(from)} au ${dayText(to.day)} ${month(to)} ${to.year}`;
  return `Du ${dayText(from.day)} ${month(from)} ${from.year} au ${dayText(to.day)} ${month(to)} ${to.year}`;
}

/**
 * Les bornes d'une période et de sa comparaison, dans le fuseau de l'officine.
 *
 * - `today` : de minuit à maintenant, contre hier de minuit à la même heure.
 * - `7d` : « les 6 jours précédents et aujourd'hui » : du début du jour d'il y a
 *   6 jours jusqu'à maintenant (7 jours civils, le dernier en cours), contre les
 *   7 jours d'avant à la même heure.
 * - `month` : du 1er à maintenant, contre le mois précédent jusqu'au même
 *   quantième (borné à la fin de ce mois-là s'il est plus court).
 * - `custom` : de `from` à `to` inclus, jamais dans le futur, 366 jours au plus,
 *   à partir de l'an 2000 ; `from` et `to` inversés sont remis dans l'ordre. Une
 *   valeur impossible (date inexistante, antérieure à 2000, trop longue, à venir)
 *   retombe sur `7d`.
 */
export function resolvePerformancePeriod(input: {
  key: PerformancePeriodKey;
  now: Date;
  timeZone: string;
  from?: string;
  to?: string;
}): PerformancePeriod {
  const { key, now, timeZone } = input;
  const nowMs = now.getTime();
  const today = zonedDateParts(now, timeZone);
  const todayStart = startOfLocalDay(timeZone, today.year, today.month, today.day);

  if (key === "today") {
    return shiftedWindow(
      timeZone,
      { key, label: "Aujourd'hui", start: todayStart, end: nowMs, dayCount: 1, inProgress: true },
      1,
    );
  }

  if (key === "month") {
    const start = startOfLocalDay(timeZone, today.year, today.month, 1);
    const previous = shiftMonth(today.year, today.month, -1);
    const f = zonedFields(nowMs, timeZone);
    const millis = nowMs - Math.floor(nowMs / 1000) * 1000;
    // Le 31 octobre comparé à septembre : on s'arrête à la fin de septembre.
    const previousEnd =
      today.day > daysInMonth(previous.year, previous.month)
        ? start
        : wallClockToInstant(timeZone, previous.year, previous.month, today.day, f.hour, f.minute, f.second, millis);
    return toPeriod({
      key,
      label: "Ce mois-ci",
      start,
      end: nowMs,
      previousStart: startOfLocalDay(timeZone, previous.year, previous.month, 1),
      previousEnd,
      dayCount: today.day,
      inProgress: true,
    });
  }

  if (key === "custom") {
    const first = parseIsoDate(input.from);
    const second = parseIsoDate(input.to);
    if (first && second) {
      const firstDay = daysFromCivil(first.year, first.month, first.day);
      const secondDay = daysFromCivil(second.year, second.month, second.day);
      const [from, to] = firstDay <= secondDay ? [first, second] : [second, first];
      const dayCount = Math.abs(secondDay - firstDay) + 1;
      const toDay = Math.max(firstDay, secondDay);
      const todayDay = daysFromCivil(today.year, today.month, today.day);
      if (from.year >= MIN_CUSTOM_YEAR && toDay <= todayDay && dayCount <= MAX_CUSTOM_PERIOD_DAYS) {
        const nextDayStart = startOfLocalDay(timeZone, to.year, to.month, to.day + 1);
        return shiftedWindow(
          timeZone,
          {
            key,
            label: customLabel(from, to),
            start: startOfLocalDay(timeZone, from.year, from.month, from.day),
            // Le lendemain de `au` : jamais dans le futur.
            end: Math.min(nextDayStart, nowMs),
            dayCount,
            inProgress: nextDayStart > nowMs,
            from: formatIso(from),
            to: formatIso(to),
          },
          dayCount,
        );
      }
    }
  }

  // « 7 derniers jours » : le choix demandé, et le repli de tout le reste.
  return shiftedWindow(
    timeZone,
    {
      key: "7d",
      label: "7 derniers jours",
      start: startOfLocalDay(timeZone, today.year, today.month, today.day - 6),
      end: nowMs,
      dayCount: 7,
      inProgress: true,
    },
    7,
  );
}

// --- Adresse ----------------------------------------------------------------------

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue): string | undefined {
  const picked: unknown = Array.isArray(value) ? value[0] : value;
  return typeof picked === "string" ? picked : undefined;
}

function periodKeyFromParam(value: string | undefined): PerformancePeriodKey | null {
  for (const key of Object.keys(PERIOD_PARAM_VALUES) as PerformancePeriodKey[]) {
    if (PERIOD_PARAM_VALUES[key] === value) return key;
  }
  return null;
}

/**
 * La période demandée par l'adresse. Le seul parseur du lot : une valeur
 * inconnue ou absente donne `7j` ; un tableau (paramètre répété) vaut son
 * premier élément ; des dates personnalisées invalides retombent sur `7j`.
 * Ne lève jamais d'exception, quoi que contienne l'adresse.
 */
export function parsePeriodParams(
  searchParams: { periode?: string | string[]; du?: string | string[]; au?: string | string[] } | null | undefined,
  now: Date,
  timeZone: string,
): PerformancePeriod {
  const key = periodKeyFromParam(firstValue(searchParams?.periode)) ?? "7d";
  return resolvePerformancePeriod({
    key,
    now,
    timeZone,
    from: firstValue(searchParams?.du),
    to: firstValue(searchParams?.au),
  });
}

/** L'inverse : les paramètres d'adresse d'une période (les dates seulement pour `perso`). */
export function periodToSearchParams(period: PerformancePeriod): { periode: string; du?: string; au?: string } {
  const params: { periode: string; du?: string; au?: string } = { periode: PERIOD_PARAM_VALUES[period.key] };
  if (period.key === "custom" && period.from && period.to) {
    params.du = period.from;
    params.au = period.to;
  }
  return params;
}
