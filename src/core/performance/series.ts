import { MIN_DECIDED_FOR_RATE } from "./definitions";
import { isAcceptedStatus, isPendingAdvice } from "./funnel";
import { zonedDateParts, zonedStartOfDay } from "./periods";
import type { AdviceRow, ConfirmedLineRow, Granularity, PerformancePeriod, SeriesBucket } from "./types";

/**
 * Les courbes d'évolution : une tranche par heure, par jour ou par semaine.
 *
 * Deux horloges, comme partout dans le suivi :
 *  - proposés / acceptés / taux : date de PROPOSITION du conseil ;
 *  - ventes (conseils distincts vendus) et chiffre d'affaires : date de la VENTE,
 *    lignes au prix connu seulement.
 *
 * Les conseils et les lignes arrivent DÉJÀ filtrés (`selectCountedAdvice`,
 * `selectCountedLines`). Une tranche sans donnée est une tranche de zéros, pas
 * un trou. Les tranches futures n'existent pas.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Garde-fou : une période de 366 jours en semaines fait 54 tranches, un jour en heures 25. */
const MAX_BUCKETS = 400;

/** Début du jour civil suivant : un jour dure 23, 24 ou 25 h, donc 36 h plus tard on est toujours le lendemain. */
function nextDayStart(dayStart: Date, timeZone: string): Date {
  return zonedStartOfDay(new Date(dayStart.getTime() + 36 * HOUR_MS), timeZone);
}

/** Lundi 00:00 de la semaine qui contient `date` (+ 12 h pour traverser sans risque un changement d'heure). */
function mondayStart(date: Date, timeZone: string): Date {
  const dayStart = zonedStartOfDay(date, timeZone);
  const { weekday } = zonedDateParts(dayStart, timeZone);
  return zonedStartOfDay(new Date(dayStart.getTime() - weekday * DAY_MS + 12 * HOUR_MS), timeZone);
}

function nextWeekStart(weekStart: Date, timeZone: string): Date {
  return zonedStartOfDay(new Date(weekStart.getTime() + 7 * DAY_MS + 12 * HOUR_MS), timeZone);
}

/** Début de la première tranche : l'heure pleine, le jour civil ou le lundi qui contient le début de la fenêtre. */
function firstStart(granularity: Granularity, windowStart: Date, timeZone: string): Date {
  if (granularity === "week") return mondayStart(windowStart, timeZone);
  const dayStart = zonedStartOfDay(windowStart, timeZone);
  if (granularity === "day") return dayStart;
  const hoursSinceMidnight = Math.floor((windowStart.getTime() - dayStart.getTime()) / HOUR_MS);
  return new Date(dayStart.getTime() + hoursSinceMidnight * HOUR_MS);
}

function nextStart(granularity: Granularity, cursor: Date, timeZone: string): Date {
  if (granularity === "week") return nextWeekStart(cursor, timeZone);
  if (granularity === "day") return nextDayStart(cursor, timeZone);
  return new Date(cursor.getTime() + HOUR_MS);
}

/** Les débuts de tranche de la fenêtre [windowStart, windowEnd[, sans jamais dépasser `notAfter` (l'instant présent). */
function bucketStarts(input: {
  granularity: Granularity;
  timeZone: string;
  windowStart: Date;
  windowEnd: Date;
  notAfter: Date | null;
}): Date[] {
  const { granularity, timeZone, windowStart, windowEnd, notAfter } = input;
  const starts: Date[] = [];
  let cursor = firstStart(granularity, windowStart, timeZone);
  while (
    starts.length < MAX_BUCKETS &&
    cursor.getTime() < windowEnd.getTime() &&
    (notAfter === null || cursor.getTime() <= notAfter.getTime())
  ) {
    starts.push(cursor);
    const next = nextStart(granularity, cursor, timeZone);
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
  }
  return starts;
}

/** Libellés prêts à afficher : « 14 h », « 12 oct. », « sem. du 6 oct. ». */
function makeLabels(granularity: Granularity, starts: Date[], timeZone: string): string[] {
  if (granularity === "hour") {
    let previousHour = -1;
    return starts.map((date) => {
      const hour = zonedDateParts(date, timeZone).hour % 24;
      // Nuit du passage à l'heure d'hiver : deux fois 2 h, la seconde se lit « 2 h bis ».
      const label = hour === previousHour ? `${hour} h bis` : `${hour} h`;
      previousHour = hour;
      return label;
    });
  }
  const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone });
  return starts.map((date) => (granularity === "week" ? `sem. du ${dayFormat.format(date)}` : dayFormat.format(date)));
}

/** Dernière tranche dont le début est ≤ t ; -1 si t précède la première. */
function bucketIndexFor(startsMs: number[], t: number): number {
  let low = 0;
  let high = startsMs.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (startsMs[mid] <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

type WindowInput = {
  granularity: Granularity;
  timeZone: string;
  windowStart: Date;
  windowEnd: Date;
  /** L'instant présent pour la période courante (pas de tranche future), `null` pour la précédente. */
  notAfter: Date | null;
  /** Date de référence des conseils « en attente » ; `null` : tout est passé, rien n'est en attente. */
  pendingNow: Date | null;
  advice: AdviceRow[];
  lines: ConfirmedLineRow[];
};

function fillWindow(input: WindowInput): SeriesBucket[] {
  const { granularity, timeZone, windowStart, windowEnd, notAfter, pendingNow, advice, lines } = input;
  const starts = bucketStarts({ granularity, timeZone, windowStart, windowEnd, notAfter });
  if (starts.length === 0) return [];

  const startsMs = starts.map((date) => date.getTime());
  const proposed = new Array<number>(starts.length).fill(0);
  const accepted = new Array<number>(starts.length).fill(0);
  const decided = new Array<number>(starts.length).fill(0);
  const revenue = new Array<number>(starts.length).fill(0);
  const sold = starts.map(() => new Set<string>());

  const lower = windowStart.getTime();
  const upper = windowEnd.getTime();
  const limit = notAfter === null ? Number.POSITIVE_INFINITY : notAfter.getTime();
  const inWindow = (t: number) => t >= lower && t < upper && t <= limit;

  for (const row of advice) {
    const t = row.createdAt.getTime();
    if (!inWindow(t)) continue;
    const index = bucketIndexFor(startsMs, t);
    if (index < 0) continue;
    proposed[index] += 1;
    if (isAcceptedStatus(row.status)) accepted[index] += 1;
    // « Tranché » = proposé et pas en attente : c'est le dénominateur du taux d'acceptation.
    if (pendingNow === null || !isPendingAdvice(row, pendingNow)) decided[index] += 1;
  }

  for (const line of lines) {
    // Une ligne sans prix est une vente sans chiffre d'affaires : elle n'entre pas dans la courbe.
    if (line.unitPriceCents <= 0) continue;
    const t = line.saleCreatedAt.getTime();
    if (!inWindow(t)) continue;
    const index = bucketIndexFor(startsMs, t);
    if (index < 0) continue;
    revenue[index] += line.totalCents;
    sold[index].add(line.recommendationId);
  }

  const labels = makeLabels(granularity, starts, timeZone);
  return starts.map((startsAt, index) => ({
    index,
    startsAt,
    label: labels[index],
    proposed: proposed[index],
    accepted: accepted[index],
    purchased: sold[index].size,
    revenueTtcCents: revenue[index],
    acceptanceRate: decided[index] >= MIN_DECIDED_FOR_RATE ? accepted[index] / decided[index] : null,
  }));
}

export function buildSeries(input: {
  period: PerformancePeriod;
  timeZone: string;
  now: Date;
  advice: AdviceRow[];
  previousAdvice: AdviceRow[];
  lines: ConfirmedLineRow[];
  previousLines: ConfirmedLineRow[];
}): { current: SeriesBucket[]; previous: SeriesBucket[] } {
  const { period, timeZone, now } = input;

  const current = fillWindow({
    granularity: period.granularity,
    timeZone,
    windowStart: period.start,
    windowEnd: period.end,
    notAfter: now,
    pendingNow: now,
    advice: input.advice,
    lines: input.lines,
  });

  // La période précédente est entièrement passée : ses conseils PROPOSED comptent comme sans réponse.
  const previous = fillWindow({
    granularity: period.granularity,
    timeZone,
    windowStart: period.previousStart,
    windowEnd: period.previousEnd,
    notAfter: null,
    pendingNow: null,
    advice: input.previousAdvice,
    lines: input.previousLines,
  });

  return { current, previous };
}
