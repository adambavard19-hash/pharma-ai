/**
 * La phrase du comptoir — une, et courte.
 *
 * Une carte de conseil dispose d'une seconde d'attention. Elle a droit à une
 * phrase pour dire POURQUOI ce produit, et le pharmacien doit pouvoir la lire
 * sans s'arrêter. Deux phrases ne sont pas lues deux fois plus vite : elles ne
 * sont pas lues du tout.
 *
 * Le moteur produit deux textes. `shortReason` est écrit pour le comptoir.
 * `rationale` est la version longue, souvent en deux phrases, et sert de
 * repli — sur la base de démonstration, deux tiers des recommandations n'ont
 * pas de `shortReason` et affichaient donc un paragraphe.
 *
 * Ce module ne réécrit rien et n'invente rien : il choisit la première phrase,
 * et coupe au mot près si elle dépasse encore. Il signale toujours quand il a
 * coupé — `shortened` permet à l'écran de dire où lire la suite. Un texte
 * raccourci sans le dire serait un texte tronqué.
 *
 * Ce qu'il ne touche jamais : les précautions. Elles ne passent pas par ici,
 * ne sont jamais raccourcies et ne se replient pas.
 */

/** Au-delà, la phrase déborde sur deux lignes et cesse d'être lue d'un coup. */
export const COUNTER_SENTENCE_MAX = 120;

/**
 * Une phrase trop courte n'en est pas une : un « 1 g. » ou un « Dr. » ne doit
 * pas être pris pour une fin de phrase.
 */
const MIN_SENTENCE_LENGTH = 40;

export type CounterSentence = {
  sentence: string;
  /** Le texte d'origine disait davantage : l'écran doit dire où le lire. */
  shortened: boolean;
};

export function counterSentence(input: {
  shortReason: string | null | undefined;
  rationale: string | null | undefined;
}): CounterSentence | null {
  const short = (input.shortReason ?? "").trim();
  if (short.length > 0) return fit(short, short);

  const long = (input.rationale ?? "").trim();
  if (long.length === 0) return null;

  const first = firstSentence(long);
  return fit(first, long);
}

/** La première phrase d'un texte, ponctuation comprise. */
function firstSentence(text: string): string {
  // Un terminateur ne compte que suivi d'une espace puis d'une majuscule : sans
  // cela, « 300 mg. poudre » ou « Dr. Mercier » couperaient au mauvais endroit.
  const pattern = /[.!?](?=\s+[A-ZÀ-ÖØ-Þ])/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + 1;
    if (end >= MIN_SENTENCE_LENGTH) return text.slice(0, end);
  }

  return text;
}

/** Coupe au mot près si la phrase dépasse encore, et le dit. */
function fit(sentence: string, source: string): CounterSentence {
  const clean = sentence.trim();
  const complete = clean.length >= source.trim().length;

  if (clean.length <= COUNTER_SENTENCE_MAX) {
    return { sentence: clean, shortened: !complete };
  }

  const cut = clean.slice(0, COUNTER_SENTENCE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  // Un mot unique plus long que la limite : on préfère le laisser entier
  // plutôt que de le rendre méconnaissable.
  const trimmed = lastSpace > COUNTER_SENTENCE_MAX / 2 ? cut.slice(0, lastSpace) : cut;

  return { sentence: `${trimmed.replace(/[\s,;:]+$/, "")}…`, shortened: true };
}
