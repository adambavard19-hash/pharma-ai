import { nameCarriesBrand, normalizeProductName } from "../ai/engines/product-name";

/**
 * La marque d'un produit, définie une seule fois.
 *
 * Trois écrans en avaient chacun leur version (la page Laboratoires, le moteur,
 * la carte de conseil) : une gamme privilégiée, un challenge ou une formation
 * relié à une marque doit retrouver les mêmes produits partout. Ce module est
 * pur (aucun accès base) pour être testé et partagé entre serveur et moteur.
 */

/** Premiers mots qui ne sont pas des marques : abréviations, formes, mentions de conditionnement. */
export const NOT_A_BRAND = new Set(["HE", "PP", "BD", "KIT", "LOT", "SET", "GEL", "CR", "CREME", "SOL", "SPR", "SPRAY", "SIROP", "CPR", "GELU", "GEL.", "STICK", "PATCH", "BTE", "LES", "LA", "LE", "DE", "DU", "AIG", "PANS", "COMP", "COMPRESSE", "BANDE", "MASQUE", "MASK", "TEST", "AUTOTEST", "CANNE", "GANT", "GANTS", "PRESERV", "TR/SECOUR", "COLL/CERV", "C/ORLIMAN", "C/ORLIM", "ATTEL", "ATTELLE", "FLEURS", "MOUCH", "VIT", "VITAMINE", "SERUM", "BAUME", "HUILE", "EAU", "SAVON", "SHAMP", "SH", "LAIT", "PATE", "POUDRE"]);

/**
 * La marque affichée d'un produit : le champ marque s'il est renseigné, sinon
 * le premier mot du libellé quand il ressemble à une marque. En majuscules,
 * comme dans le logiciel de gestion. Null quand on ne sait pas.
 */
export function brandLabelOf(name: string, brand: string | null | undefined): string | null {
  if (brand && brand.trim()) return brand.trim().toUpperCase();
  const first = name.trim().split(/\s+/)[0]?.replace(/[,;:.]+$/, "") ?? "";
  if (first.length < 3 || /^\d/.test(first) || NOT_A_BRAND.has(first.toUpperCase())) return null;
  return first.toUpperCase();
}

/** La clé de comparaison d'une marque : minuscules, sans accents, espaces réduits. */
export function brandKey(label: string): string {
  return normalizeProductName(label);
}

/**
 * Ce produit appartient-il à cette marque ? Le champ marque d'abord, sinon la
 * marque comme mot entier dans le libellé (jamais une sous-chaîne : « Arko »
 * ne doit pas reconnaître « Arkopharma »… ni l'inverse).
 */
export function productMatchesBrand(product: { name: string; brand?: string | null }, key: string): boolean {
  if (!key) return false;
  if (product.brand && brandKey(product.brand) === key) return true;
  return nameCarriesBrand(product.name, key, product.brand ?? null);
}
