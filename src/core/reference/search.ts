/**
 * Normalisation des textes du catalogue pour la recherche.
 *
 * Au comptoir, personne ne tape « PARACÉTAMOL » avec son accent. Or la source
 * en met partout : 10 765 des 14 280 noms de spécialité et 2 309 des 3 988
 * libellés de substance sont accentués. Chercher sur le texte brut reviendrait
 * donc à cacher les trois quarts du catalogue à qui tape vite.
 *
 * La règle : décomposer, retirer les signes diacritiques, passer en majuscules,
 * réduire les espaces. Elle s'applique des DEUX côtés — au texte stocké lors de
 * l'import, et à ce que le pharmacien tape — sinon elle ne servirait à rien.
 *
 * Les valeurs officielles ne sont jamais modifiées : cette forme normalisée
 * vit dans une colonne à part, à côté du libellé d'origine intact.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
