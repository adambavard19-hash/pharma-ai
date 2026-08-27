import type { AdviceOpportunityResult, CatalogProduct } from "../types";

/**
 * Appariement catalogue (étape E).
 *
 * On ne cherche des produits QU'APRÈS avoir établi qu'un conseil est pertinent.
 * Ce module ne juge pas de la pertinence clinique : il restreint le catalogue
 * aux références plausibles pour une opportunité donnée. Le classement est
 * ensuite l'affaire du moteur de score.
 */

const norm = (value: string) => value.toLowerCase().trim();

function tokenize(values: string[]): Set<string> {
  return new Set(
    values
      .flatMap((v) => norm(v).split(/[\s,;/'()]+/))
      .filter((token) => token.length > 2),
  );
}

export type MatchCandidate = {
  product: CatalogProduct;
  /** Nombre d'étiquettes de l'opportunité retrouvées sur le produit. */
  tagHits: number;
  categoryMatch: boolean;
};

export function findCandidateProducts(params: {
  opportunity: AdviceOpportunityResult;
  catalog: CatalogProduct[];
  /** Inclure les produits en rupture (signalés, mais non retenus par défaut). */
  includeOutOfStock?: boolean;
  maxCandidates?: number;
}): MatchCandidate[] {
  const { opportunity, catalog, includeOutOfStock = false, maxCandidates = 12 } = params;

  const opportunityTokens = tokenize(opportunity.matchingTags);

  const candidates: MatchCandidate[] = [];

  for (const product of catalog) {
    if (!product.isActive) continue;

    const available =
      product.stockQuantity > 0 || product.availableInSiblingPharmacy;
    if (!available && !includeOutOfStock) continue;

    const productTokens = tokenize([
      product.name,
      product.subCategory ?? "",
      product.description ?? "",
      ...product.matchingTags,
      ...product.commercialClaims,
    ]);

    let tagHits = 0;
    for (const token of opportunityTokens) {
      if (productTokens.has(token)) tagHits += 1;
    }

    const categoryMatch = product.category === opportunity.category;

    // Une référence sans lien de catégorie ni d'étiquette n'est pas candidate.
    if (!categoryMatch && tagHits === 0) continue;

    candidates.push({ product, tagHits, categoryMatch });
  }

  return candidates
    .sort((a, b) => {
      if (a.categoryMatch !== b.categoryMatch) return a.categoryMatch ? -1 : 1;
      if (b.tagHits !== a.tagHits) return b.tagHits - a.tagHits;
      return b.product.stockQuantity - a.product.stockQuantity;
    })
    .slice(0, maxCandidates);
}

/** Recherche libre dans le catalogue, pour l'ajout manuel d'un conseil. */
export function searchCatalog(
  catalog: CatalogProduct[],
  query: string,
  limit = 20,
): CatalogProduct[] {
  const q = norm(query);
  if (!q) return catalog.slice(0, limit);

  return catalog
    .filter((product) => {
      const haystack = [
        product.name,
        product.brand ?? "",
        product.reference,
        product.ean ?? "",
        product.subCategory ?? "",
        ...product.matchingTags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, limit);
}
