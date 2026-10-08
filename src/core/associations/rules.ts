/**
 * Les règles d'une association de produits, sans base de données : ce qu'un pharmacien peut écrire, et ce qu'on
 * refuse. Le service les applique ; l'écran les affiche.
 */

/** La phrase que le pharmacien dit au patient : courte, écrite par lui, jamais générée. */
export const MAX_SENTENCE_LENGTH = 240;

export type AssociationDraft = { triggerProductId: string; adviceProductId: string; sentence: string | null };

/** Espaces et retours à la ligne ramenés à un seul espace ; vide → absent. */
export function cleanSentence(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** Un produit ne s'associe pas à lui-même, et la phrase tient dans la limite. `null` quand tout va bien. */
export function associationError(draft: AssociationDraft): string | null {
  if (!draft.triggerProductId || !draft.adviceProductId) return "Choisissez les deux produits.";
  if (draft.triggerProductId === draft.adviceProductId) return "Un produit ne peut pas être associé à lui-même.";
  if (draft.sentence && draft.sentence.length > MAX_SENTENCE_LENGTH) return `La phrase est trop longue (${MAX_SENTENCE_LENGTH} caractères au plus).`;
  return null;
}
