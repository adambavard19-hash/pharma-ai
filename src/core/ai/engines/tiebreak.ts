import type { ScoreBreakdown, ScoredRecommendation } from "../types";
import type { ShortDate } from "../../stock/expiry";
import { SCORE_WEIGHTS } from "./scoring";

/**
 * Le choix d'une référence parmi les candidates d'un même conseil.
 *
 * D'abord la clinique, seule : pertinence, sécurité, adéquation au patient.
 * Ensuite seulement, et uniquement entre références au MÊME niveau clinique
 * (même sécurité, même adéquation, mêmes précautions et vigilances, écart de
 * pertinence négligeable), les critères de l'officine départagent, dans cet
 * ordre : formule préférée par la règle, préférence déclarée, gamme
 * privilégiée, date courte, challenge laboratoire en cours, disponibilité,
 * historique, marge.
 *
 * Une préférence, une gamme partenaire, une date courte, un challenge ou une
 * marge ne fait donc jamais passer une référence moins adaptée, plus signalée
 * ou moins sûre devant une autre. À niveau clinique égal, la boîte à date
 * courte passe d'abord (on évite la perte), puis celle qui participe à un
 * challenge en cours.
 */

/** Écart de score clinique sous lequel deux références sont équivalentes. */
export const CLINICAL_EQUIVALENCE = 0.02;

/**
 * Une date courte ne départage que si la boîte tient encore au moins ce délai :
 * on n'écoule pas une boîte qui périmerait pendant le traitement.
 */
export const SHORT_DATE_MIN_DAYS = 14;

export function clinicalScore(breakdown: ScoreBreakdown): number {
  return breakdown.relevance * SCORE_WEIGHTS.relevance + breakdown.safety * SCORE_WEIGHTS.safety + breakdown.patientFit * SCORE_WEIGHTS.patientFit;
}

/** Ce qui doit être identique pour que deux références soient interchangeables. */
export function clinicalSignature(item: ScoredRecommendation): string {
  const vigilances = (item.vigilances ?? []).map((v) => `${v.population}:${v.level}:${v.status}`).sort().join(",");
  return [item.breakdown.safety.toFixed(4), item.breakdown.patientFit.toFixed(4), [...item.precautions].sort().join("§"), vigilances].join("|");
}

export function clinicallyEquivalent(a: ScoredRecommendation, b: ScoredRecommendation): boolean {
  return Math.abs(clinicalScore(a.breakdown) - clinicalScore(b.breakdown)) < CLINICAL_EQUIVALENCE && clinicalSignature(a) === clinicalSignature(b);
}

/** L'ordre clinique : le meilleur score clinique, puis la référence la moins signalée. */
export function compareClinical(a: ScoredRecommendation, b: ScoredRecommendation): number {
  return (
    clinicalScore(b.breakdown) - clinicalScore(a.breakdown) ||
    b.breakdown.safety - a.breakdown.safety ||
    b.breakdown.patientFit - a.breakdown.patientFit ||
    (a.vigilances?.length ?? 0) - (b.vigilances?.length ?? 0) ||
    b.totalScore - a.totalScore
  );
}

export type TiebreakCriterion =
  | "FORMULE"
  | "PREFERENCE_OFFICINE"
  | "GAMME_PRIVILEGIEE"
  | "DATE_COURTE"
  | "CHALLENGE"
  | "DISPONIBILITE"
  | "HISTORIQUE"
  | "COMMERCIAL";

export const TIEBREAK_LABELS: Record<TiebreakCriterion, string> = {
  FORMULE: "formule préférée par la règle",
  PREFERENCE_OFFICINE: "préférence déclarée par l'officine",
  GAMME_PRIVILEGIEE: "gamme privilégiée de l'officine",
  DATE_COURTE: "date courte",
  CHALLENGE: "challenge laboratoire en cours",
  DISPONIBILITE: "disponibilité en rayon",
  HISTORIQUE: "historique de validation",
  COMMERCIAL: "marge",
};

export type TiebreakContext = {
  /** Rang de la formule préférée par la règle (0 = la première). */
  formulaRank: (item: ScoredRecommendation) => number;
  /** Rang de gamme privilégiée (1 = prioritaire) ; null hors gamme. */
  rangeRank: (item: ScoredRecommendation) => number | null;
  /** Date courte de la référence ; null si inconnue. */
  shortDate: (item: ScoredRecommendation) => ShortDate | null;
  /** La référence participe-t-elle à un challenge laboratoire actif ? Absent : non. */
  hasChallenge?: (item: ScoredRecommendation) => boolean;
};

/** Plus petit = favorisé. Une boîte périmée, lointaine ou trop courte ne départage rien. */
export function shortDateKey(shortDate: ShortDate | null): number {
  if (!shortDate || shortDate.level === "OK" || shortDate.level === "EXPIRED" || shortDate.daysLeft < SHORT_DATE_MIN_DAYS) return Number.POSITIVE_INFINITY;
  return shortDate.daysLeft;
}

export type TiebreakResult = {
  chosen: ScoredRecommendation;
  /** La meilleure référence au sens clinique seul. */
  best: ScoredRecommendation;
  /** Les références cliniquement équivalentes à la meilleure (elle comprise). */
  equivalents: ScoredRecommendation[];
  /** Le critère qui a tranché, ou null si la clinique a suffi. */
  criterion: TiebreakCriterion | null;
};

export function chooseAmongEquivalents(list: ScoredRecommendation[], context: TiebreakContext): TiebreakResult {
  const ordered = [...list].sort(compareClinical);
  const best = ordered[0];
  const equivalents = ordered.filter((item) => clinicallyEquivalent(item, best));
  if (equivalents.length < 2) return { chosen: best, best, equivalents, criterion: null };

  const steps: [TiebreakCriterion, (item: ScoredRecommendation) => number][] = [
    ["FORMULE", (item) => context.formulaRank(item)],
    ["PREFERENCE_OFFICINE", (item) => -item.breakdown.pharmacistPreference],
    ["GAMME_PRIVILEGIEE", (item) => context.rangeRank(item) ?? Number.POSITIVE_INFINITY],
    ["DATE_COURTE", (item) => shortDateKey(context.shortDate(item))],
    ["CHALLENGE", (item) => (context.hasChallenge?.(item) ? 0 : 1)],
    ["DISPONIBILITE", (item) => -item.breakdown.availability],
    ["HISTORIQUE", (item) => -item.breakdown.validationHistory],
    ["COMMERCIAL", (item) => -item.breakdown.commercial],
  ];
  let pool = equivalents;
  let decisive: TiebreakCriterion | null = null;
  for (const [criterion, key] of steps) {
    const values = pool.map(key);
    const min = Math.min(...values);
    const next = pool.filter((_, index) => values[index] === min);
    if (next.length < pool.length) {
      pool = next;
      decisive = criterion;
      if (pool.length === 1) break;
    }
  }
  return { chosen: pool[0], best, equivalents, criterion: decisive };
}
