import type { CoachSuggestion } from "./rules";

/**
 * La voix du coach — le seul endroit où un modèle de langage pourra entrer plus tard.
 *
 * Partage des rôles, non négociable : les RÈGLES décident (quoi suggérer, à qui, sur quels chiffres — `decideCoach`) ;
 * le narrateur ne fait que formuler. Il reçoit la suggestion déjà décidée, avec ses agrégats, et rend une phrase. Il ne
 * peut ni ajouter une suggestion, ni en retirer, ni changer un chiffre ; s'il échoue ou rend une phrase vide, la phrase
 * des règles est gardée.
 *
 * Version 1 : `ruleNarrator`, la phrase écrite par les règles. Pour brancher un modèle plus tard, écrire un narrateur
 * qui appelle le fournisseur d'IA du registre (`getAIProvider()`, src/server/ai/registry.ts) avec la suggestion
 * SEULE (aucun patient, aucune vente : il n'y en a pas dans la suggestion), puis le passer à `narrate`.
 */
export interface CoachNarrator {
  readonly name: string;
  explain(suggestion: CoachSuggestion): Promise<string>;
}

export const ruleNarrator: CoachNarrator = {
  name: "règles",
  explain: async (suggestion) => suggestion.explanation,
};

/** La phrase finale : celle du narrateur si elle est utilisable, sinon celle des règles. */
export async function narrate(suggestion: CoachSuggestion, narrator: CoachNarrator = ruleNarrator): Promise<string> {
  try {
    const text = (await narrator.explain(suggestion)).trim();
    return text.length > 0 && text.length <= 400 ? text : suggestion.explanation;
  } catch {
    return suggestion.explanation;
  }
}
