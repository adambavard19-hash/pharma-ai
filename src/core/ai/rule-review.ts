/**
 * La relecture des règles de conseil par la pharmacienne — un OUTIL FACULTATIF, jamais un prérequis.
 *
 * Les règles du moteur vivent dans le code : toute officine, dès que son stock est envoyé, en bénéficie sans rien régler.
 * Ce qu'une pharmacienne peut faire, pour SON officine seulement :
 *
 *  • REJECTED  — refuser une règle : elle ne se déclenche plus jamais dans cette officine (ni à l'écran, ni au poste) ;
 *  • VALIDATED — dire qu'elle la cautionne : une trace signée et datée, sans effet sur ce qui s'affiche ;
 *  • TO_REVIEW — personne n'a rien décidé : la règle fonctionne comme pour toutes les officines.
 *
 * La décision porte sur une VERSION : une règle réécrite depuis (version différente) redevient « pas relue ».
 * Module pur : aucune base, aucune horloge.
 */

export type RuleDecision = "VALIDATED" | "REJECTED";
export type RuleState = RuleDecision | "TO_REVIEW";

export type RuleReviewRow = { ruleKey: string; ruleVersion: string; decision: RuleDecision };

/** Ce qu'il faut savoir d'une règle pour dire où elle en est. */
export type ReviewableRule = { key: string; version: string; validation: { status: "PENDING" } | { status: "VALIDATED" } };

export function reviewsByKey(rows: RuleReviewRow[]): Map<string, RuleReviewRow> {
  return new Map(rows.map((row) => [row.ruleKey, row]));
}

/** Où en est une règle dans cette officine. */
export function ruleState(rule: ReviewableRule, reviews: ReadonlyMap<string, RuleReviewRow>): RuleState {
  const review = reviews.get(rule.key);
  if (review && review.ruleVersion === rule.version) return review.decision;
  return rule.validation.status === "VALIDATED" ? "VALIDATED" : "TO_REVIEW";
}

/** Les règles que la pharmacienne a refusées : elles sortent du moteur pour cette officine. */
export function disabledRuleKeys(rules: ReviewableRule[], reviews: ReadonlyMap<string, RuleReviewRow>): string[] {
  return rules.filter((rule) => ruleState(rule, reviews) === "REJECTED").map((rule) => rule.key);
}

/**
 * Le conseil qui sort de cette règle peut-il s'afficher dans la fenêtre du poste de caisse ?
 * Oui, sauf si la pharmacienne a refusé la règle. Une règle inconnue (supprimée depuis) n'est jamais montrée au comptoir.
 */
export function mayShowAtCounter(ruleKey: string | null | undefined, rules: ReviewableRule[], reviews: ReadonlyMap<string, RuleReviewRow>): boolean {
  if (!ruleKey) return false;
  const rule = rules.find((candidate) => candidate.key === ruleKey);
  return rule ? ruleState(rule, reviews) !== "REJECTED" : false;
}

export const RULE_STATE_LABELS: Record<RuleState, string> = {
  VALIDATED: "Validée",
  REJECTED: "Refusée",
  TO_REVIEW: "Pas relue",
};
