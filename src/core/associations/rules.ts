/**
 * Les règles d'une association de produits, sans base de données : ce qu'un pharmacien peut écrire, et ce qu'on
 * refuse. Le service les applique ; l'écran les affiche.
 */

/** La phrase que le pharmacien dit au patient : courte, écrite par lui, jamais générée. */
export const MAX_SENTENCE_LENGTH = 240;

/** Combien de produits conseillés au plus en un seul enregistrement, pour un même déclencheur. */
export const MAX_ADVICE_PER_SAVE = 10;

/** Combien de déclencheurs au plus en un seul enregistrement : chacun reçoit tous les produits choisis. */
export const MAX_TRIGGERS_PER_SAVE = 10;

export type AssociationDraft = {
  /** Le déclencheur est un produit du stock… */
  triggerProductId?: string | null;
  /** …ou un médicament du catalogue national : jamais les deux, jamais aucun. */
  triggerSpecialtyId?: string | null;
  /** …ou une famille de médicaments (préfixe ATC, `ASSOCIATION_DRUG_CLASSES`). */
  triggerAtcCode?: string | null;
  adviceProductId: string;
  sentence: string | null;
};

/** Espaces et retours à la ligne ramenés à un seul espace ; vide → absent. */
export function cleanSentence(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** La phrase tient dans la limite. `null` quand tout va bien. */
export function sentenceError(sentence: string | null): string | null {
  return sentence && sentence.length > MAX_SENTENCE_LENGTH ? `La phrase est trop longue (${MAX_SENTENCE_LENGTH} caractères au plus).` : null;
}

/** Un seul déclencheur, un produit conseillé, un produit qui ne s'associe pas à lui-même. `null` quand tout va bien. */
export function associationError(draft: AssociationDraft): string | null {
  const byProduct = Boolean(draft.triggerProductId);
  const byDrug = Boolean(draft.triggerSpecialtyId);
  const byClass = Boolean(draft.triggerAtcCode);
  if (Number(byProduct) + Number(byDrug) + Number(byClass) > 1) return "Choisissez un seul déclencheur : un produit, un médicament ou une famille.";
  if (!byProduct && !byDrug && !byClass) return "Choisissez le produit ou le médicament déclencheur.";
  if (!draft.adviceProductId) return "Choisissez le produit à conseiller.";
  if (byProduct && draft.triggerProductId === draft.adviceProductId) return "Un produit ne peut pas être associé à lui-même.";
  return sentenceError(draft.sentence);
}
