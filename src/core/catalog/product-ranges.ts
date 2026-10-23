/**
 * Les gammes proposées SANS parfum imposé (fondateur, 22 oct. 2026 : « propose la gamme Hydratis de façon générale, le
 * patient choisira le goût qu'il veut ») et leur posologie, relue à la source.
 *
 * La bannière du comptoir montre le nom de la gamme au lieu de la référence de stock retenue (souvent un parfum), et sa
 * posologie : combien, combien de fois par jour, la dose maximale — jamais un conseil de prudence (celui-là se dit au
 * patient, il a sa place à part). Une gamme n'entre ici qu'avec une posologie lue sur une source française fiable
 * (laboratoire, Vidal, Claude Bernard), citée avec la date de lecture.
 */

export type ProductRange = {
  key: string;
  /** Reconnaît une référence de la gamme dans le nom du produit (minuscules, accents compris). */
  test: RegExp;
  /** Le nom affiché au comptoir. */
  name: string;
  /** Le nom court, dans une phrase à dire au patient. */
  short: string;
  /** La posologie, en une phrase courte par public. */
  posology: string[];
  source: { label: string; url: string; readOn: string };
};

export const PRODUCT_RANGES: ProductRange[] = [
  {
    key: "hydratis",
    test: /\bhydratis\b/i,
    name: "Hydratis, pastilles d'électrolytes · goût au choix",
    short: "Hydratis",
    posology: [
      "Adulte : 1 pastille dans un verre d'eau (250 ml) matin et soir, ou 2 pastilles dans 500 ml au fil de la journée ; 5 pastilles par jour au maximum.",
      "Enfant de 4 à 10 ans, adulte de plus de 50 ans : 2 pastilles par jour, 3 au maximum.",
      "Dès 3 ans ; avis d'un professionnel de santé de 3 à 4 ans.",
    ],
    source: { label: "Laboratoire Hydratis, fiche produit « Conseils d'utilisation »", url: "https://www.hydratis.co/products/pastilles-electrolytes-saveur-neutre", readOn: "2026-10-22" },
  },
];

/** La gamme d'un produit, d'après son nom ; null : un produit qui se propose tel quel. */
export function rangeOf(productName: string | null | undefined): ProductRange | null {
  if (!productName) return null;
  return PRODUCT_RANGES.find((range) => range.test.test(productName)) ?? null;
}
