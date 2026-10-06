import type { Granularity, SeriesBucket } from "@/core/performance/types";
import { formatCents, formatNumber } from "@/lib/format";
import { niceScale } from "./chart-math";
import { capitalizeFirst, formatAxisCents, formatRate } from "./format";

/**
 * Ce que le graphique d'évolution dessine, sans rien dessiner : les mesures,
 * leurs mots, leur échelle et le plan des étiquettes. Pur, donc testable sans
 * navigateur. Aucun chiffre n'est calculé ici : on lit les tranches du rapport.
 */

export type MeasureKey = "revenue" | "proposed" | "accepted" | "rate";

type MeasureKind = "cents" | "count" | "rate";

type MeasureDefinition = {
  /** Le mot du bouton, court : quatre boutons tiennent sur un écran de 360 px. */
  tab: string;
  /** Le titre complet de la mesure, écrit sous le titre du graphique. */
  title: string;
  kind: MeasureKind;
  /** Ce que l'on dit quand il n'y a rien à tracer (jamais une courbe plate qui ferait croire à une mesure). */
  emptyText: string;
};

export const MEASURES: Record<MeasureKey, MeasureDefinition> = {
  revenue: {
    tab: "CA attribué",
    title: "Chiffre d'affaires attribué, TTC",
    kind: "cents",
    emptyText: "Aucune vente confirmée sur cette période : pas de chiffre d'affaires à tracer.",
  },
  proposed: {
    tab: "Proposés",
    title: "Conseils proposés à l'équipe",
    kind: "count",
    emptyText: "Aucun conseil proposé sur cette période.",
  },
  accepted: {
    tab: "Acceptés",
    title: "Conseils acceptés par l'équipe",
    kind: "count",
    emptyText: "Aucun conseil accepté sur cette période.",
  },
  rate: {
    tab: "Taux",
    title: "Taux d'acceptation",
    kind: "rate",
    emptyText: "Pas assez de conseils tranchés pour calculer un taux sur cette période.",
  },
};

const ORDER: MeasureKey[] = ["revenue", "proposed", "accepted", "rate"];

/** Les mesures proposées : le taux n'est offert que quand le rapport sait en calculer un. */
export function availableMeasures(showAcceptanceRate: boolean): MeasureKey[] {
  return ORDER.filter((key) => key !== "rate" || showAcceptanceRate);
}

/** La valeur d'une tranche pour une mesure ; `null` seulement pour un taux sous 3 conseils tranchés. */
export function measureValue(bucket: SeriesBucket, measure: MeasureKey): number | null {
  switch (measure) {
    case "revenue":
      return bucket.revenueTtcCents;
    case "proposed":
      return bucket.proposed;
    case "accepted":
      return bucket.accepted;
    default:
      return bucket.acceptanceRate;
  }
}

export function seriesValues(buckets: SeriesBucket[], measure: MeasureKey): (number | null)[] {
  return buckets.map((bucket) => measureValue(bucket, measure));
}

/** Y a-t-il quelque chose à tracer : au moins une valeur connue et non nulle ? */
export function hasSignal(values: (number | null)[]): boolean {
  return values.some((value) => value !== null && Number.isFinite(value) && value > 0);
}

/**
 * La mesure affichée à l'ouverture : le chiffre d'affaires quand il y en a, sinon
 * les conseils proposés. On ne montre pas d'abord une courbe vide.
 */
export function defaultMeasure(current: SeriesBucket[]): MeasureKey {
  if (hasSignal(seriesValues(current, "revenue"))) return "revenue";
  if (hasSignal(seriesValues(current, "proposed"))) return "proposed";
  return "revenue";
}

/** La mesure réellement affichée : un taux choisi puis devenu indisponible retombe sur les conseils proposés. */
export function effectiveMeasure(chosen: MeasureKey, showAcceptanceRate: boolean): MeasureKey {
  return availableMeasures(showAcceptanceRate).includes(chosen) ? chosen : "proposed";
}

/**
 * L'échelle verticale. Un taux va toujours de 0 à 100 % (on ne grossit pas un écart
 * en coupant l'axe). Les effectifs montent au moins jusqu'à 4 : un seul conseil ne
 * doit pas remplir tout le graphique.
 */
export function buildScale(measure: MeasureKey, series: (number | null)[][]): { max: number; ticks: number[] } {
  const kind = MEASURES[measure].kind;
  if (kind === "rate") return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const known = series.flat().filter((value): value is number => value !== null && Number.isFinite(value));
  const peak = Math.max(0, ...known);
  return niceScale(kind === "count" ? Math.max(peak, 4) : peak, { integer: true, fallbackMax: kind === "cents" ? 10_000 : 4 });
}

/** Une valeur de graduation (axe vertical). */
export function formatTick(measure: MeasureKey, value: number): string {
  const kind = MEASURES[measure].kind;
  if (kind === "rate") return formatRate(value);
  if (kind === "cents") return formatAxisCents(value);
  return formatNumber(value);
}

/** Une valeur lue dans l'infobulle : le montant exact au centime, l'effectif, ou le taux entier. */
export function formatValue(measure: MeasureKey, value: number | null): string {
  if (value === null) return "—";
  const kind = MEASURES[measure].kind;
  if (kind === "rate") return formatRate(value);
  if (kind === "cents") return formatCents(value);
  return formatNumber(value);
}

export function granularityNoun(granularity: Granularity): string {
  return granularity === "hour" ? "par heure" : granularity === "week" ? "par semaine" : "par jour";
}

/** « vs les 7 jours d'avant » → « Les 7 jours d'avant » : le nom de la courbe de comparaison. */
export function comparisonName(comparisonLabel: string): string {
  const bare = comparisonLabel.replace(/^\s*vs\s+/i, "").trim();
  return capitalizeFirst(bare || "période précédente");
}

/**
 * L'étiquette écrite sous l'axe. En semaine, le titre du graphique dit déjà
 * « par semaine » : « sem. du 14 sept. » (trois fois côte à côte) déborderait
 * sur un écran de 360 px, « 14 sept. » tient.
 */
export function axisLabel(label: string, granularity: Granularity): string {
  return granularity === "week" ? label.replace(/^sem\.?\s*du\s+/i, "") : label;
}

/**
 * Les bornes d'une série, lues à voix haute : « de 5 oct. à 11 oct. ». Les
 * étiquettes finissent souvent par un point (« oct. ») et la phrase aussi : un
 * seul point à la fin, jamais « oct.. ».
 */
export function spokenRange(first: string, last: string): string {
  return `de ${first} à ${last.replace(/\.+$/, "")}.`;
}

/**
 * Quelles étiquettes écrire sous l'axe : peu sur un petit écran, un peu plus sur
 * un grand. Une étiquette est écrite si elle sert à l'un des deux cas ; la classe
 * dit à partir de quelle largeur elle disparaît.
 */
export function labelPlan(count: number): { index: number; show: "always" | "wide" | "narrow" }[] {
  const narrowStride = Math.max(1, Math.ceil(count / 3));
  const wideStride = Math.max(1, Math.ceil(count / 6));
  const plan: { index: number; show: "always" | "wide" | "narrow" }[] = [];
  for (let index = 0; index < count; index += 1) {
    const narrow = index % narrowStride === 0;
    const wide = index % wideStride === 0;
    if (narrow && wide) plan.push({ index, show: "always" });
    else if (wide) plan.push({ index, show: "wide" });
    else if (narrow) plan.push({ index, show: "narrow" });
  }
  return plan;
}

/** Le dernier point connu d'une série (celui que l'on accentue) ; `null` quand rien n'est connu. */
export function lastKnownIndex(values: (number | null)[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null && Number.isFinite(value)) return index;
  }
  return null;
}

/** Le complément écrit sous la valeur dans l'infobulle : le lien avec les autres chiffres du créneau. */
export function bucketDetail(bucket: SeriesBucket, measure: MeasureKey): string | null {
  switch (measure) {
    case "revenue":
      return bucket.purchased > 0 ? `${formatNumber(bucket.purchased)} ${bucket.purchased > 1 ? "conseils achetés" : "conseil acheté"}` : null;
    case "proposed":
      return `dont ${formatNumber(bucket.accepted)} ${bucket.accepted > 1 ? "acceptés" : "accepté"}`;
    case "accepted":
      return `sur ${formatNumber(bucket.proposed)} ${bucket.proposed > 1 ? "proposés" : "proposé"}`;
    default:
      return bucket.acceptanceRate === null ? "Moins de 3 conseils tranchés : pas de taux" : null;
  }
}
