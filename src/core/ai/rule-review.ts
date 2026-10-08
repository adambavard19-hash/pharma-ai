/**
 * La relecture des règles de conseil par la pharmacienne.
 *
 * Les règles du moteur sont écrites et testées, mais aucune n'avait été relue par un pharmacien : au comptoir, une règle
 * mal réglée (un soluté de réhydratation pour un laxatif, un bain de bouche pour une bouche sèche) fait perdre la confiance
 * en tout le reste. La pharmacienne décide donc, règle par règle, pour SON officine :
 *
 *  • VALIDATED — elle peut parler au comptoir, y compris dans la fenêtre du poste de caisse ;
 *  • REJECTED  — elle ne se déclenche plus jamais dans cette officine ;
 *  • TO_REVIEW — personne ne l'a relue : elle s'affiche sur l'écran complet de la vente, jamais dans la fenêtre du poste.
 *
 * La décision porte sur une VERSION : une règle réécrite depuis (version différente) redevient « à relire ».
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
 * Seulement si la pharmacienne l'a validée. Une règle inconnue (supprimée depuis) n'est jamais montrée au comptoir.
 */
export function mayShowAtCounter(ruleKey: string | null | undefined, rules: ReviewableRule[], reviews: ReadonlyMap<string, RuleReviewRow>): boolean {
  if (!ruleKey) return false;
  const rule = rules.find((candidate) => candidate.key === ruleKey);
  return rule ? ruleState(rule, reviews) === "VALIDATED" : false;
}

export const RULE_STATE_LABELS: Record<RuleState, string> = {
  VALIDATED: "Validée",
  REJECTED: "Refusée",
  TO_REVIEW: "À relire",
};
