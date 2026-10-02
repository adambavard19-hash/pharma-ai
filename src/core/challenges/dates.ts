/**
 * Les dates d'un challenge laboratoire.
 *
 * Un challenge court sur des JOURS calendaires, bornes incluses : « du 1er au
 * 31 octobre » compte la vente de 23 h 59 le 31 octobre, pas celle de 0 h 01 le
 * 1er novembre. Les colonnes `startsAt` / `endsAt` sont des dates (@db.Date,
 * minuit UTC) ; les ventes, elles, sont des instants. La frontière entre deux
 * jours se calcule donc dans le fuseau de l'officine (Europe/Paris par défaut),
 * heure d'été comprise.
 *
 * Pur et sans horloge : la date du jour est toujours passée par l'appelant.
 */

/** Un jour calendaire « AAAA-MM-JJ ». */
export type DayKey = string;

export const DEFAULT_TIME_ZONE = "Europe/Paris";

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai pour une date « AAAA-MM-JJ » qui existe (le 31 février n'existe pas). */
export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Le jour d'une colonne @db.Date (minuit UTC), d'une date sérialisée ou d'une
 * saisie « AAAA-MM-JJ ». Lève une erreur sur une valeur illisible : une date
 * de challenge fausse ne doit jamais être devinée.
 */
export function toDayKey(value: Date | string): DayKey {
  if (typeof value === "string") {
    if (DAY_PATTERN.test(value)) {
      if (!isCalendarDay(value)) throw new RangeError(`Date inexistante : ${value}`);
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new RangeError(`Date illisible : ${value}`);
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) throw new RangeError("Date illisible");
  return value.toISOString().slice(0, 10);
}

function dayNumber(day: Date | string): number {
  const [year, month, date] = toDayKey(day).split("-").map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
}

/** Nombre de jours de `from` à `to` : 0 le même jour, négatif si `to` précède. */
export function daysBetween(from: Date | string, to: Date | string): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(day: Date | string, count: number): DayKey {
  return new Date((dayNumber(day) + count) * DAY_MS).toISOString().slice(0, 10);
}

/** La valeur à écrire dans une colonne @db.Date : minuit UTC de ce jour. */
export function dayKeyToDate(day: Date | string): Date {
  return new Date(dayNumber(day) * DAY_MS);
}

/** Un fuseau utilisable par Intl ; sinon le fuseau par défaut (jamais d'exception). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Le jour calendaire d'un instant, vu depuis l'officine. */
export function calendarDay(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): DayKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Décalage du fuseau à cet instant, en millisecondes (Paris : +1 h l'hiver, +2 h l'été). */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** L'instant où commence ce jour dans ce fuseau : minuit local, changement d'heure compris. */
export function zonedDayStart(day: Date | string, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const zone = safeTimeZone(timeZone);
  const utcMidnight = dayNumber(day) * DAY_MS;
  const first = utcMidnight - offsetMs(utcMidnight, zone);
  // Le décalage lu à minuit UTC peut différer de celui de minuit local le jour
  // d'un changement d'heure : on le relit à l'instant trouvé.
  const second = utcMidnight - offsetMs(first, zone);
  return new Date(second);
}

/** La fenêtre des ventes d'un challenge : `from` inclus, `until` exclu. */
export type ChallengeWindow = { from: Date; until: Date };

/**
 * Du premier jour à 0 h au lendemain du dernier jour à 0 h (exclu), heure de
 * l'officine : les deux jours bornes sont comptés en entier.
 */
export function challengeWindow(startsOn: Date | string, endsOn: Date | string, timeZone: string = DEFAULT_TIME_ZONE): ChallengeWindow {
  return { from: zonedDayStart(startsOn, timeZone), until: zonedDayStart(addDays(endsOn, 1), timeZone) };
}

export function isInWindow(instant: Date, window: ChallengeWindow): boolean {
  const time = instant.getTime();
  return time >= window.from.getTime() && time < window.until.getTime();
}
