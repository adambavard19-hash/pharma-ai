import { isValidCip13 } from "./cip";

/**
 * Lire une date de péremption telle qu'elle est écrite sur la boîte.
 *
 * Au comptoir, personne ne tape « 2027-03-31 ». On recopie ce qu'on lit :
 * « 03/2027 », « 3/27 », « 31/03/2027 », ou les six chiffres d'un Datamatrix.
 * Beaucoup de boîtes ne portent que le mois : la date retenue est alors le
 * DERNIER jour du mois, et la précision « MONTH » le garde en mémoire pour
 * l'affichage (« 03/2027 », pas « 31/03/2027 »).
 *
 * Pur et sans horloge : la date du jour est toujours passée par l'appelant.
 * Toutes les dates rendues sont des jours calendaires à minuit UTC, comme la
 * colonne `StockLot.expiresOn` (@db.Date).
 */

export type ExpiryPrecision = "DAY" | "MONTH";

export type ParsedExpiry = { expiresOn: Date; precision: ExpiryPrecision };

/** Une péremption se lit sur ce siècle : rien avant 2000, rien après 2099. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2099;

const DAY_MS = 24 * 60 * 60 * 1000;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildDate(year: number, month: number, day: number | null): ParsedExpiry | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const last = lastDayOfMonth(year, month);
  if (day === null) return { expiresOn: new Date(Date.UTC(year, month - 1, last)), precision: "MONTH" };
  if (!Number.isInteger(day) || day < 1 || day > last) return null;
  return { expiresOn: new Date(Date.UTC(year, month - 1, day)), precision: "DAY" };
}

function fullYear(digits: string): number {
  return digits.length === 2 ? 2000 + Number(digits) : Number(digits);
}

/**
 * Date GS1 « AAMMJJ » (identifiant d'application 17). Un jour « 00 » signifie
 * « fin du mois » : c'est la règle GS1, et c'est ainsi que sont codées les
 * boîtes qui n'impriment que MM/AAAA.
 */
export function parseGs1Date(digits: string): ParsedExpiry | null {
  if (!/^\d{6}$/.test(digits)) return null;
  const year = 2000 + Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  return buildDate(year, month, day === 0 ? null : day);
}

/**
 * Formats acceptés :
 *   • « 31/03/2027 », « 31/03/27 », « 31-03-2027 », « 31.03.2027 » → jour précis ;
 *   • « 03/2027 », « 3/2027 », « 03/27 », « 3/27 » → fin du mois ;
 *   • « 2027-03-31 » → jour précis ; « 2027-03 » → fin du mois ;
 *   • « 270331 » (AAMMJJ GS1) → jour précis ; « 270300 » → fin du mois ;
 *   • « 032027 » (MMAAAA) → fin du mois ;
 *   • « 31032027 » (JJMMAAAA) ou « 20270331 » (AAAAMMJJ).
 * Un préfixe imprimé (« EXP », « PER », « Péremption : ») est ignoré.
 *
 * Six chiffres se lisent d'abord en AAMMJJ (GS1) : « 310327 » donne donc le
 * 27/03/2031. Seuls ceux qui ne sont pas une date GS1 et finissent par une
 * année « 20xx » se lisent en MMAAAA. L'écran de saisie affiche la date
 * comprise avant d'enregistrer.
 */
export function parseExpiryInput(raw: unknown): ParsedExpiry | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .trim()
    .replace(/^[^\d]+/, "")
    .replace(/[^\d]+$/, "")
    .replace(/\s*([-/.])\s*/g, "$1")
    .replace(/\s+/g, " ");
  if (!text) return null;

  let match = /^(\d{4})[-/. ](\d{1,2})(?:[-/. ](\d{1,2}))?$/.exec(text);
  if (match) return buildDate(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : null);

  match = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(text);
  if (match) return buildDate(fullYear(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(text);
  if (match) return buildDate(fullYear(match[2]), Number(match[1]), null);

  if (/^\d{6}$/.test(text)) {
    // « 032027 » (MMAAAA, une boîte « 03 2027 » recopiée sans espace) n'est
    // jamais une date GS1 valide : son « mois » serait 20. Aucune confusion.
    return parseGs1Date(text) ?? (text.slice(2, 4) === "20" ? buildDate(Number(text.slice(2, 6)), Number(text.slice(0, 2)), null) : null);
  }

  if (/^\d{8}$/.test(text)) {
    // AAAAMMJJ et JJMMAAAA ne peuvent pas être valides tous les deux sur ce
    // siècle : une année « 20xx » en fin de chaîne donnerait un mois « 20 ».
    const yearFirst = text.startsWith("20") ? buildDate(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8))) : null;
    return yearFirst ?? buildDate(Number(text.slice(4, 8)), Number(text.slice(2, 4)), Number(text.slice(0, 2)));
  }

  return null;
}

/** « 2027-03-31 » : le jour calendaire d'une date UTC minuit. */
export function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** « 31/03/2027 », ou « 03/2027 » quand la boîte ne porte que le mois. */
export function formatExpiry(expiresOn: Date | string, precision: ExpiryPrecision | string = "DAY"): string {
  const iso = typeof expiresOn === "string" ? expiresOn.slice(0, 10) : toIsoDay(expiresOn);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "—";
  return precision === "MONTH" ? `${month}/${year}` : `${day}/${month}/${year}`;
}

/** « dans 12 j », « aujourd'hui », « périmé depuis 3 j ». */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "aujourd'hui";
  if (daysLeft === 1) return "demain";
  if (daysLeft > 1) return `dans ${daysLeft} j`;
  if (daysLeft === -1) return "périmé depuis hier";
  return `périmé depuis ${-daysLeft} j`;
}

/**
 * Le jour calendaire d'un instant dans un fuseau (« Europe/Paris »), rendu à
 * minuit UTC. À 0 h 30 à Paris, on est déjà le lendemain ; en UTC, encore la
 * veille : sans cette conversion, un lot paraîtrait périmé un jour trop tard.
 */
export function calendarDate(now: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) return new Date(Date.UTC(year, month - 1, day));
  } catch {
    // Fuseau inconnu : on retombe sur le jour UTC.
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Le jour de l'officine pour une date reçue d'un appelant. Un jour calendaire
 * (minuit UTC pile, comme ceux de `calendarDate` ou de la base) est gardé tel
 * quel ; un instant (`new Date()`) est ramené au jour de l'officine dans son
 * fuseau. Sans cela, un lot qui périme aujourd'hui (minuit UTC) sortirait des
 * dates courtes dès le matin, et la nuit le compte de jours serait décalé.
 */
export function toPharmacyDay(value: Date, timeZone: string): Date {
  const isCalendarDay = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
  return isCalendarDay ? value : calendarDate(value, timeZone);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Pourquoi un lot sort du suivi. Une sortie ne touche jamais la quantité du stock. */
export const LOT_RESOLUTIONS = ["SOLD", "RETURNED", "DESTROYED"] as const;
export type LotResolution = (typeof LOT_RESOLUTIONS)[number];

export const LOT_RESOLUTION_LABELS: Record<LotResolution, string> = {
  SOLD: "Vendu",
  RETURNED: "Retourné",
  DESTROYED: "Détruit",
};

/** Numéro de lot tel qu'imprimé, sans espaces parasites, en majuscules. Vide : inconnu. */
export function normalizeLotNumber(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 40);
  return value ? value : null;
}

/**
 * Ce qui fait qu'un lot est « le même » d'une saisie ou d'un import à l'autre :
 * la référence (produit ou médicament), le numéro de lot et la date.
 */
export function lotIdentityKey(lot: { productId?: string | null; presentationId?: string | null; lotNumber?: string | null; expiresOn: Date }): string {
  const target = lot.productId ? `p:${lot.productId}` : `d:${lot.presentationId ?? ""}`;
  return `${target}|${normalizeLotNumber(lot.lotNumber) ?? ""}|${toIsoDay(lot.expiresOn)}`;
}

/* ------------------------------------------------------------------------ */
/* Datamatrix GS1 — PRÉPARÉ, NON BRANCHÉ.                                    */
/* Aucune route ni aucun écran ne l'appelle aujourd'hui : l'agent jette     */
/* encore la date (AI 17) et le lot (AI 10), et la route des bips retire    */
/* tout ce qui n'est pas un chiffre.                                         */
/* ------------------------------------------------------------------------ */

export type Gs1Data = {
  /** GTIN-14 (AI 01). Pour un médicament français : « 0 » + CIP13. */
  gtin: string;
  cip13?: string;
  expiresOn?: Date;
  precision?: ExpiryPrecision;
  /** Numéro de lot (AI 10). */
  lot?: string;
  /** Numéro de série (AI 21). */
  serial?: string;
  /**
   * Lu sans séparateur GS et plusieurs découpages étaient possibles : la fin
   * du lot ou du numéro de série a été devinée. À faire confirmer.
   */
  ambiguous: boolean;
};

const GS = "\u001d";
/** Identifiants à longueur fixe (chiffres). 11 et 15 (fabrication, DLUO) sont lus et ignorés. */
const FIXED_AI: Record<string, number> = { "01": 14, "17": 6, "11": 6, "15": 6 };
/** Identifiants à longueur variable (20 caractères au plus), terminés par GS ou par la fin. */
const VARIABLE_AI = new Set(["10", "21", "710", "711", "712", "713", "714", "715"]);
const VARIABLE_MAX = 20;

type Gs1Element = { ai: string; value: string };

function gtinCheckDigitValid(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  let sum = 0;
  for (let index = 0; index < 13; index += 1) sum += Number(gtin[index]) * ((12 - index) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(gtin[13]);
}

function fixedValueValid(ai: string, value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  if (ai === "01") return gtinCheckDigitValid(value);
  return parseGs1Date(value) !== null;
}

function readAi(text: string, position: number): string | null {
  const three = text.slice(position, position + 3);
  if (VARIABLE_AI.has(three)) return three;
  const two = text.slice(position, position + 2);
  if (two in FIXED_AI || VARIABLE_AI.has(two)) return two;
  return null;
}

/**
 * Tous les découpages complets possibles à partir de `position`. Avec des
 * séparateurs GS, il n'y en a qu'un. Sans, la fin d'un champ variable est
 * cherchée là où la suite se lit entièrement.
 */
function segmentations(text: string, position: number, seen: ReadonlySet<string>, separated: boolean, budget: { left: number }): Gs1Element[][] {
  if (budget.left-- <= 0) return [];
  if (position === text.length) return [[]];
  if (text[position] === GS) return segmentations(text, position + 1, seen, separated, budget);

  const ai = readAi(text, position);
  if (!ai || seen.has(ai)) return [];
  const start = position + ai.length;
  const nextSeen = new Set(seen).add(ai);
  const results: Gs1Element[][] = [];

  if (ai in FIXED_AI) {
    const value = text.slice(start, start + FIXED_AI[ai]);
    if (value.length !== FIXED_AI[ai] || !fixedValueValid(ai, value)) return [];
    for (const rest of segmentations(text, start + value.length, nextSeen, separated, budget)) results.push([{ ai, value }, ...rest]);
    return results;
  }

  if (separated) {
    const end = text.indexOf(GS, start);
    const stop = end === -1 ? text.length : end;
    const value = text.slice(start, stop);
    if (value.length < 1 || value.length > VARIABLE_MAX) return [];
    for (const rest of segmentations(text, stop, nextSeen, separated, budget)) results.push([{ ai, value }, ...rest]);
    return results;
  }

  const maxEnd = Math.min(text.length, start + VARIABLE_MAX);
  for (let end = start + 1; end <= maxEnd; end += 1) {
    const value = text.slice(start, end);
    for (const rest of segmentations(text, end, nextSeen, separated, budget)) results.push([{ ai, value }, ...rest]);
  }
  return results;
}

/**
 * Lit le contenu d'un Datamatrix GS1 de boîte de médicament : GTIN (01),
 * péremption (17), lot (10), numéro de série (21). Accepte la chaîne brute
 * d'une douchette (avec ou sans séparateur GS, avec ou sans préfixe « ]d2 »)
 * et la forme lisible « (01)…(17)…(10)… ». Null si ce n'est pas un GS1 lisible.
 */
export function parseGs1(raw: string): Gs1Data | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim().replace(/^\][A-Za-z]\d/, "");
  text = text.replace(/<GS>|\[GS\]|\{GS\}|␝/gi, GS);
  if (text.startsWith("(")) text = text.replace(/\((\d{2,4})\)/g, `${GS}$1`);
  text = text.replace(/^\u001d+/, "").replace(/\u001d+$/, "");
  if (!text || text.length > 120) return null;

  const separated = text.includes(GS);
  const candidates = segmentations(text, 0, new Set(), separated, { left: 5000 }).filter((elements) => elements.some((element) => element.ai === "01"));
  if (candidates.length === 0) return null;

  // Sans séparateur, le découpage qui reconnaît le plus d'informations est le
  // plus vraisemblable : un lot qui « avalerait » la date serait un hasard.
  const best = candidates.reduce((winner, candidate) => (candidate.length > winner.length ? candidate : winner));
  const field = (ai: string) => best.find((element) => element.ai === ai)?.value;

  const gtin = field("01") as string;
  const data: Gs1Data = { gtin, ambiguous: !separated && candidates.length > 1 };
  const nationalCode = gtin.startsWith("0") ? gtin.slice(1) : null;
  if (nationalCode && isValidCip13(nationalCode)) data.cip13 = nationalCode;
  const expiry = field("17");
  if (expiry) {
    const parsed = parseGs1Date(expiry);
    if (parsed) {
      data.expiresOn = parsed.expiresOn;
      data.precision = parsed.precision;
    }
  }
  const lot = field("10");
  if (lot) data.lot = lot;
  const serial = field("21");
  if (serial) data.serial = serial;
  return data;
}
