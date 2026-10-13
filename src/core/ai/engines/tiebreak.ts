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
 * privilégiée, référence non remboursée, date courte, challenge laboratoire en
 * cours, historique, marge HT, disponibilité.
 *
 * Une préférence, une gamme partenaire, une date courte, un challenge ou une
 * marge ne fait donc jamais passer une référence moins adaptée, plus signalée
 * ou moins sûre devant une autre. À niveau clinique égal :
 *   • ce que l'officine a choisi elle-même (préférence, gamme) passe d'abord ;
 *   • une référence remboursée — prix et marge encadrés — ne passe jamais devant
 *     une équivalente non remboursée (retour du fondateur, 13 oct. 2026 :
 *     AEQUASYAL, inscrit à la LPP, proposé après une cétirizine) ;
 *   • la boîte à date courte (on évite la perte), puis celle d'un challenge ;
 *   • l'historique de validation de l'équipe ;
 *   • la meilleure marge HT par unité, en euros : la référence qui rapporte le
 *     plus à l'officine. Avant la disponibilité : deux boîtes en rayon, l'une à
 *     2 unités, l'autre à 30, répondent pareil au patient — la marge, elle, est
 *     ce que l'officine attend du départage. Une marge inconnue (prix
 *     manquants) n'est ni favorisée ni pénalisée : elle prend la médiane des
 *     marges connues de ses équivalentes.
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
  | "NON_REMBOURSE"
  | "DATE_COURTE"
  | "CHALLENGE"
  | "HISTORIQUE"
  | "COMMERCIAL"
  | "DISPONIBILITE";

export const TIEBREAK_LABELS: Record<TiebreakCriterion, string> = {
  FORMULE: "formule préférée par la règle",
  PREFERENCE_OFFICINE: "préférence déclarée par l'officine",
  GAMME_PRIVILEGIEE: "gamme privilégiée de l'officine",
  NON_REMBOURSE: "référence non remboursée préférée à une remboursée",
  DATE_COURTE: "date courte",
  CHALLENGE: "challenge laboratoire en cours",
  HISTORIQUE: "historique de validation",
  COMMERCIAL: "meilleure marge HT",
  DISPONIBILITE: "disponibilité en rayon",
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

  const steps: [TiebreakCriterion, (item: ScoredRecommendation, pool: ScoredRecommendation[]) => number][] = [
    ["FORMULE", (item) => context.formulaRank(item)],
    ["PREFERENCE_OFFICINE", (item) => -item.breakdown.pharmacistPreference],
    ["GAMME_PRIVILEGIEE", (item) => context.rangeRank(item) ?? Number.POSITIVE_INFINITY],
    // Seule une référence CONNUE comme remboursée recule : « on ne sait pas » ne vaut pas « remboursée ».
    ["NON_REMBOURSE", (item) => (item.reimbursed === true ? 1 : 0)],
    ["DATE_COURTE", (item) => shortDateKey(context.shortDate(item))],
    ["CHALLENGE", (item) => (context.hasChallenge?.(item) ? 0 : 1)],
    ["HISTORIQUE", (item) => -item.breakdown.validationHistory],
    ["COMMERCIAL", (item, pool) => -marginKey(item, pool)],
    ["DISPONIBILITE", (item) => -item.breakdown.availability],
  ];
  let pool = equivalents;
  let decisive: TiebreakCriterion | null = null;
  for (const [criterion, key] of steps) {
    const current = pool;
    const values = current.map((item) => key(item, current));
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

/**
 * La marge HT d'une référence pour le départage. Inconnue (prix manquants), elle prend la médiane des marges connues
 * de ses équivalentes : ni inventée en sa faveur, ni comptée contre elle. Aucune marge connue : toutes à égalité.
 */
export function marginKey(item: ScoredRecommendation, pool: ScoredRecommendation[]): number {
  if (typeof item.marginCents === "number") return item.marginCents;
  const known = pool.map((other) => other.marginCents).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  if (known.length === 0) return 0;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2;
}

/**
 * Ce que le pharmacien lit du départage commercial, à la fin de la justification — jamais sur la fiche du patient.
 * Rien quand la clinique a suffi ou qu'un autre critère a tranché, sauf pour dire qu'une référence remboursée est
 * proposée faute d'équivalente non remboursée.
 */
export function commercialJustification(result: TiebreakResult, formatCents: (cents: number) => string): string | null {
  const { chosen, equivalents, criterion } = result;
  const margin = typeof chosen.marginCents === "number" ? `${formatCents(chosen.marginCents)} HT par unité` : null;
  if (criterion === "COMMERCIAL" && margin) return `Meilleure marge parmi les ${equivalents.length} références équivalentes en stock : ${margin}.`;
  if (criterion === "NON_REMBOURSE") {
    const reimbursed = equivalents.filter((item) => item.reimbursed === true).length;
    return `Préférée à ${reimbursed} référence${reimbursed > 1 ? "s" : ""} équivalente${reimbursed > 1 ? "s" : ""} remboursée${reimbursed > 1 ? "s" : ""}${margin ? ` ; marge ${margin}` : ""}.`;
  }
  if (chosen.reimbursed === true) {
    // Seuls la formule préférée par la règle (un critère clinique) et le choix de l'officine (préférence, gamme)
    // passent avant le remboursement : ce sont les seules raisons pour lesquelles une remboursée peut être en tête.
    if (!equivalents.some((item) => item.reimbursed !== true)) return "Référence remboursée : aucune référence équivalente non remboursée en stock pour ce conseil.";
    return criterion === "FORMULE" ? "Référence remboursée, retenue pour sa formule, préférée par la règle." : "Référence remboursée, retenue par le choix de l'officine.";
  }
  return null;
}
