import { universeAppliesTo } from "../../config/universes";
import { productMatchesBrand } from "./brand";

/**
 * Les gammes privilégiées d'une officine, telles que le moteur les lit.
 *
 * Elles ne servent qu'à DÉPARTAGER des références que le moteur juge déjà
 * également pertinentes et sûres pour le patient (voir pipeline.ts). Jamais
 * une gamme ne fait entrer un produit, ne relève un score ni ne passe devant
 * une référence mieux adaptée : ce module ne renvoie qu'un rang.
 */
export type PreferredRangeInput = {
  id: string;
  universe: string;
  brandKey: string;
  /** 1 = la plus prioritaire de l'univers. */
  priority: number;
  /** Produits explicitement concernés ; vide = toute la marque. */
  productIds: string[];
};

export type RangeCandidate = { id: string; name: string; brand?: string | null; category?: string | null };

/** La gamme couvre-t-elle ce produit (liste explicite, sinon la marque) ? */
export function rangeCoversProduct(range: PreferredRangeInput, product: RangeCandidate): boolean {
  if (range.productIds.length > 0) return range.productIds.includes(product.id);
  return productMatchesBrand(product, range.brandKey);
}

/**
 * Le rang de préférence d'un produit pour un conseil de cette catégorie :
 * la meilleure priorité (la plus petite) parmi les gammes actives qui le
 * couvrent et dont l'univers s'applique. Null : aucune gamme ne le concerne.
 */
export function rangeRankFor(product: RangeCandidate, opportunityCategory: string | null, ranges: PreferredRangeInput[]): number | null {
  let best: number | null = null;
  for (const range of ranges) {
    if (!universeAppliesTo(range.universe, opportunityCategory, product.category ?? null)) continue;
    if (!rangeCoversProduct(range, product)) continue;
    const priority = Math.max(1, Math.round(range.priority));
    if (best === null || priority < best) best = priority;
  }
  return best;
}

/**
 * Ce que le moteur lit des gammes enregistrées : seulement les actives, et
 * seulement les champs du départage (ni remise, ni notes : jamais un critère).
 */
export function engineRangesFrom(stored: { id: string; universe: string; brandKey: string; priority: number; productIds: string[]; isActive: boolean }[]): PreferredRangeInput[] {
  return stored
    .filter((range) => range.isActive)
    .map((range) => ({ id: range.id, universe: range.universe, brandKey: range.brandKey, priority: range.priority, productIds: range.productIds }));
}
