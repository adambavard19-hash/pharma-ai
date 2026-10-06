import type { Metric, RateMetric } from "./types";

/**
 * Les briques de comparaison du suivi de performance : un nombre face à sa
 * période précédente, un taux face au taux précédent.
 *
 * Règle d'or : on ne fabrique jamais un pourcentage à partir de rien. Quand la
 * période précédente vaut 0, `deltaPct` est `null` (« Nouveau » côté écran) ;
 * quand un taux n'existe pas (dénominateur nul), il reste `null`.
 */

/** Sous ce nombre de points, un taux est dit « stable ». */
const RATE_FLAT_POINTS = 0.5;

/** Une valeur qui n'est pas un nombre fini (ou négative) ne vaut rien : on évite de propager NaN à l'écran. */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Arrondit à `decimals` décimales, symétriquement autour de zéro (−0,25 → −0,3
 * comme +0,25 → 0,3) et sans traîne de virgule flottante. Ne renvoie jamais −0.
 */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-6);
  return rounded / factor + 0;
}

/**
 * Un nombre et sa valeur de comparaison.
 *  - `deltaPct` : variation en %, arrondie à 0,1 ; `null` quand `previous` vaut 0 ;
 *  - `trend` : « up » / « down » / « flat » (variation nulle à 0,1 % près) ;
 *    « none » quand les deux valent 0 ; « up » quand on passe de 0 à plus de 0
 *    (sans pourcentage : il n'y a rien à comparer).
 */
export function metric(value: number, previous: number): Metric {
  const current = safeCount(value);
  const before = safeCount(previous);

  if (before === 0) {
    return { value: current, previous: before, deltaPct: null, trend: current > 0 ? "up" : "none" };
  }

  const deltaPct = roundTo(((current - before) / before) * 100, 1);
  const trend = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  return { value: current, previous: before, deltaPct, trend };
}

/**
 * Un taux (0 → 1) et le taux de comparaison. `deltaPoints` est en points de
 * pourcentage (0,45 → 0,50 donne 5), arrondi à 0,1. « flat » sous 0,5 point ;
 * « none » dès que l'un des deux taux est inconnu.
 */
export function rateMetric(value: number | null, previous: number | null): RateMetric {
  if (value === null || previous === null || !Number.isFinite(value) || !Number.isFinite(previous)) {
    return {
      value: value !== null && Number.isFinite(value) ? value : null,
      previous: previous !== null && Number.isFinite(previous) ? previous : null,
      deltaPoints: null,
      trend: "none",
    };
  }

  const deltaPoints = roundTo((value - previous) * 100, 1);
  const trend = Math.abs(deltaPoints) < RATE_FLAT_POINTS ? "flat" : deltaPoints > 0 ? "up" : "down";
  return { value, previous, deltaPoints, trend };
}

/** Une division honnête : `null` quand il n'y a rien à diviser (dénominateur nul ou négatif). */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}
