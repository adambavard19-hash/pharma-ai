import { normalizeName } from "./classify";

/**
 * Les mots du nom d'un produit, comme étiquettes de recherche.
 *
 * Ils permettent de retrouver le produit au comptoir (« ultra », « levure »)
 * et servent de repli à l'appariement. Ils ne disent rien de l'USAGE du
 * produit : c'est la classification (dictionnaire, puis modèle) qui ajoute les
 * étiquettes du vocabulaire des règles de conseil.
 */
export function tagsFromName(name: string): string[] {
  return [...new Set(normalizeName(name).split(" ").filter((token) => token.length > 2))];
}
