import { unitMarginHt } from "@/core/catalog/margin";
import type { CatalogProduct, ScoredRecommendation } from "./types";

/**
 * Les trois conseils que voit le comptoir (fondateur, 27 oct. 2026) : « maximum trois conseils, laisse les alternatives ;
 * toujours ceux où la marge est la plus importante, et bien évidemment s'il est en date courte, challenge ou surstock ».
 *
 * Le choix, dans cet ordre :
 *   1. un produit en surstock de la pharmacie ;
 *   2. la règle n° 1 de la vente (la flore intestinale sous antibiotique, ou l'ordre choisi dans Console → Priorités) ;
 *   3. un conseil de sécurité (jamais retiré pour de la marge) ;
 *   4. un produit en date courte, puis un produit en challenge ;
 *   5. la meilleure marge HT par unité.
 * Les trois retenus gardent l'ordre du moteur et leurs alternatives. Les conseils de l'arbre de questions, cachés tant que le
 * pharmacien n'a pas cliqué leur réponse, ne comptent pas.
 *
 * Module PUR.
 */
export function capShownAdvice(params: {
  recommendations: ScoredRecommendation[];
  max: number;
  catalogById: ReadonlyMap<string, CatalogProduct>;
  /** Hors plafond : un conseil de l'arbre de questions, encore caché. */
  isHidden: (item: ScoredRecommendation) => boolean;
  isSafety: (item: ScoredRecommendation) => boolean;
}): { kept: ScoredRecommendation[]; dropped: ScoredRecommendation[] } {
  const { recommendations, max, catalogById, isHidden, isSafety } = params;
  const visible = recommendations.filter((item) => !isHidden(item));
  if (visible.length <= max) return { kept: recommendations, dropped: [] };

  // La règle n° 1 : le premier conseil du moteur, dans l'ordre de la priorité clinique (une routine compte pour un).
  const isOverstock = (item: ScoredRecommendation) => item.source === "OVERSTOCK" || item.overstock === true;
  const firstEngine = visible.find((item) => !isOverstock(item) && item.source !== "ASSOCIATION");
  const product = (item: ScoredRecommendation) => catalogById.get(item.productId);
  const margin = (item: ScoredRecommendation) => {
    if (typeof item.marginCents === "number") return item.marginCents;
    const found = product(item);
    return found ? (unitMarginHt(found)?.marginCents ?? -1) : -1;
  };
  const rank = (item: ScoredRecommendation): number[] => [
    isOverstock(item) ? 1 : 0,
    item === firstEngine || (item.routine && firstEngine?.routine?.key === item.routine.key) ? 1 : 0,
    isSafety(item) ? 1 : 0,
    item.shortDate || product(item)?.shortDate ? 1 : 0,
    product(item)?.activeChallenge ? 1 : 0,
    margin(item),
  ];
  const compare = (a: ScoredRecommendation, b: ScoredRecommendation) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let index = 0; index < ra.length; index += 1) if (ra[index] !== rb[index]) return rb[index] - ra[index];
    return visible.indexOf(a) - visible.indexOf(b);
  };

  // Une routine compte pour un conseil : ses étapes entrent ou sortent ensemble.
  const units: ScoredRecommendation[][] = [];
  for (const item of visible) {
    const key = item.routine?.key;
    const unit = key ? units.find((group) => group[0].routine?.key === key) : undefined;
    if (unit) unit.push(item);
    else units.push([item]);
  }
  const chosen = [...units].sort((a, b) => compare(a[0], b[0])).slice(0, max);
  const keptSet = new Set(chosen.flat());
  return {
    kept: recommendations.filter((item) => keptSet.has(item) || isHidden(item)),
    dropped: visible.filter((item) => !keptSet.has(item)),
  };
}
