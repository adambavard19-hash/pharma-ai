import { LOCALE, TIME_ZONE } from "@/config/constants";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { pctText } from "@/core/performance/narrative";
import { MIN_CUSTOM_YEAR, isValidCalendarDate } from "@/core/performance/periods";
import { formatCents, formatCentsCompact } from "@/lib/format";
import type { Granularity, Metric, PerformancePeriodKey, RateMetric } from "@/core/performance/types";

/**
 * Présentation seulement : mots, formats et petites règles d'affichage. Aucun
 * chiffre n'est calculé ici — les composants reçoivent un rapport déjà prêt.
 */

/** Lundi = 0, comme `RhythmCell.weekday`. */
export const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
export const WEEKDAY_SHORT = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."] as const;

/** Sous cet effectif, un taux ne veut rien dire (même seuil que `SeriesBucket.acceptanceRate`). */
export const MIN_DECIDED_FOR_RATE = 3;

/**
 * Le taux d'un produit ou d'un univers ne compte que les conseils tranchés ; la
 * ligne n'affiche pas ce dénominateur, la note sous le tableau et sous les
 * barres le dit.
 */
export const RATE_NOTE = "Les conseils proposés depuis moins de 24 h ne comptent pas dans le taux.";

/** Sous ce nombre de conseils proposés, on prévient que les pourcentages bougent beaucoup. */
export const FEW_ADVICE_BELOW = 10;

/** Longueur maximale d'une période personnalisée, en jours (la même que celle du parseur d'adresse). */
export const MAX_CUSTOM_DAYS = 366;

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
export const capitalizeFirst = capitalize;

// --- Période ------------------------------------------------------------------

/** « vs hier », « vs les 7 jours d'avant »… : à quoi se compare la période. */
export function comparisonLabel(key: PerformancePeriodKey): string {
  switch (key) {
    case "today":
      return "vs hier";
    case "7d":
      return "vs les 7 jours d'avant";
    case "month":
      return "vs le mois dernier";
    default:
      return "vs la période précédente";
  }
}

/** Le même mot sans « vs » : « hier », « le mois dernier »… */
export function comparisonNoun(key: PerformancePeriodKey): string {
  return comparisonLabel(key).replace(/^vs /, "");
}

/** Le jour civil de `date` dans le fuseau de l'officine, au format `aaaa-mm-jj`. */
export function isoDateInTimeZone(date: Date, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Une date `aaaa-mm-jj` dont l'année précède la première année acceptée. */
function isBeforeMinimumYear(value: string): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value.trim());
  return match !== null && Number(match[1]) < MIN_CUSTOM_YEAR;
}

/**
 * Pourquoi des dates personnalisées ne peuvent pas être affichées — ou `null`
 * quand elles le peuvent. Les mêmes limites que le parseur d'adresse (dont
 * `isValidCalendarDate` : « 2026-02-31 » n'existe pas), dites avant le clic
 * plutôt que découvertes après un retour silencieux à « 7 jours ».
 */
export function customRangeProblem(from: string, to: string, today: string): string | null {
  if (!from.trim() || !to.trim()) return "Choisissez une date de début et une date de fin.";
  // Avant l'an 2000 : dit tel quel, pas « dates invalides » (le jour peut très bien exister).
  if (isBeforeMinimumYear(from) || isBeforeMinimumYear(to)) return `Choisissez des dates à partir de ${MIN_CUSTOM_YEAR}.`;
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to)) return "Ces dates ne sont pas valides.";
  if (from > to) return "La date de début doit venir avant la date de fin.";
  if (to > today) return "Les dates à venir ne peuvent pas encore être mesurées.";
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_CUSTOM_DAYS) return "Choisissez une période d'un an au plus.";
  return null;
}

// --- Nombres ------------------------------------------------------------------

const decimalFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/**
 * Un taux (0 → 1) en pourcentage entier ; « — » quand il n'existe pas. Le même
 * arrondi que la narration et la console : `pctText`, une seule règle dans tout
 * le lot (« 58 % » ici, « 58 % » dans le titre).
 */
export function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : pctText(value);
}

/**
 * Un montant d'axe de graphique : « 100 € » quand le montant est rond (pas de
 * « 100,00 € » sur chaque graduation), « 12,5 k € » à partir de 10 000 € (la
 * marge de l'axe est étroite).
 */
export function formatAxisCents(cents: number): string {
  if (Math.abs(cents) >= 1_000_000) return formatCentsCompact(cents);
  if (cents % 100 === 0) return `${new Intl.NumberFormat(LOCALE).format(cents / 100)}\u00a0€`;
  return formatCents(cents);
}

/** Un effectif avec son accord : « 1 conseil », « 12 conseils ». */
export function countOf(count: number, singular: string, plural?: string): string {
  const word = Math.abs(count) > 1 ? (plural ?? `${singular}s`) : singular;
  return `${new Intl.NumberFormat(LOCALE).format(count)} ${word}`;
}

// --- Variations ---------------------------------------------------------------

export type DeltaView = {
  tone: "up" | "down" | "flat" | "new" | "none";
  /** Ce qui s'affiche dans la pastille : « +12 % », « −3 pts », « Stable », « Nouveau », « — ». */
  text: string;
  /** La même chose en toutes lettres, pour les lecteurs d'écran. */
  spoken: string;
};

function percentText(deltaPct: number): string {
  const abs = Math.abs(deltaPct);
  return abs >= 100 ? `${new Intl.NumberFormat(LOCALE).format(Math.round(abs))} %` : `${decimalFormatter.format(abs)} %`;
}

/** « point » sous 2 (1 point, 1,5 point), « points » à partir de 2 : l'accord français. */
export function pointsWord(abs: number): "point" | "points" {
  return Math.abs(abs) < 2 ? "point" : "points";
}

/** La variation d'un nombre. Jamais de pourcentage quand la période précédente vaut 0. */
export function describeMetricDelta(metric: Metric): DeltaView {
  if (metric.deltaPct === null) {
    if (metric.previous === 0 && metric.value > 0) {
      return { tone: "new", text: "Nouveau", spoken: "Nouveau : rien sur la période précédente" };
    }
    return { tone: "none", text: "—", spoken: "Pas de comparaison possible : rien sur la période précédente" };
  }
  const direction = metric.trend === "flat" ? "flat" : metric.trend === "up" || metric.trend === "down" ? metric.trend : metric.deltaPct > 0 ? "up" : metric.deltaPct < 0 ? "down" : "flat";
  // Une variation qui s'arrondit à « 0 % » n'est pas une hausse : on dit « Stable », pas « +0 % ».
  if (direction === "flat" || decimalFormatter.format(Math.abs(metric.deltaPct)) === "0") return { tone: "flat", text: "Stable", spoken: "Stable" };
  const text = percentText(metric.deltaPct);
  return direction === "up"
    ? { tone: "up", text: `+${text}`, spoken: `En hausse de ${text}` }
    : { tone: "down", text: `−${text}`, spoken: `En baisse de ${text}` };
}

/** La variation d'un taux, en points de pourcentage (la seule variation qui garde une décimale). */
export function describeRateDelta(rate: RateMetric): DeltaView {
  if (rate.deltaPoints === null) {
    return { tone: "none", text: "—", spoken: "Pas de comparaison possible : taux inconnu sur l'une des deux périodes" };
  }
  const direction = rate.trend === "flat" ? "flat" : rate.trend === "up" || rate.trend === "down" ? rate.trend : rate.deltaPoints > 0 ? "up" : rate.deltaPoints < 0 ? "down" : "flat";
  if (direction === "flat") return { tone: "flat", text: "Stable", spoken: "Stable" };
  const abs = Math.abs(rate.deltaPoints);
  const points = decimalFormatter.format(abs);
  return direction === "up"
    ? { tone: "up", text: `+${points} pts`, spoken: `En hausse de ${points} ${pointsWord(abs)}` }
    : { tone: "down", text: `−${points} pts`, spoken: `En baisse de ${points} ${pointsWord(abs)}` };
}

// --- Libellés -----------------------------------------------------------------

/** L'univers d'un produit : le libellé du catalogue, ou « Médicaments conseil » pour une présentation nationale. */
export function categoryLabel(category: string): string {
  if (category === "MEDICAMENT") return "Médicaments conseil";
  return (PRODUCT_CATEGORY_LABELS as Record<string, string | undefined>)[category] ?? "Autres produits de conseil";
}

/** Le titre daté d'un point du graphique : « lundi 12 octobre », « 14 h, 12 octobre », « Semaine du 6 octobre ». */
export function bucketTitle(startsAt: Date, granularity: Granularity, timeZone: string = TIME_ZONE): string {
  if (granularity === "hour") {
    const hour = new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "numeric" }).format(startsAt).replace(/\s*h$/i, "");
    const day = new Intl.DateTimeFormat(LOCALE, { timeZone, day: "numeric", month: "long" }).format(startsAt);
    return `${hour} h, ${day}`;
  }
  if (granularity === "week") {
    return `Semaine du ${new Intl.DateTimeFormat(LOCALE, { timeZone, day: "numeric", month: "long" }).format(startsAt)}`;
  }
  return capitalize(new Intl.DateTimeFormat(LOCALE, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(startsAt));
}
