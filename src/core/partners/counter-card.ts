import { UNIVERSES } from "../../config/universes";

/**
 * La carte « Gamme partenaire » du comptoir.
 *
 * Elle se calcule APRÈS le moteur, à partir des conseils qu'il a déjà rendus,
 * et n'y retourne jamais : le moteur ne lit aucune donnée partenaire, une
 * marque ne peut ni faire entrer un produit, ni monter un score, ni passer
 * devant une référence mieux adaptée. La carte dit seulement qu'une autre
 * gamme existe dans l'univers d'un besoin que le moteur a déjà retenu.
 *
 * Elle ne s'affiche pas :
 *  - pour un besoin bloqué par la sécurité, ou que le patient a écarté ;
 *  - pour un conseil refusé ou qui porte une contre-indication avérée pour ce patient ;
 *  - quand le produit conseillé est déjà de cette marque (ce ne serait pas une alternative) ;
 *  - pour une marque masquée ou refusée par l'officine (filtré en amont, cf. visibility.ts).
 *
 * Au plus `MAX_COUNTER_CARDS` cartes, une marque une seule fois, dans l'ordre
 * clinique des conseils.
 */

export const MAX_COUNTER_CARDS = 2;

export type CounterAdvice = {
  recommendationId: string;
  /** Catégorie du besoin (AdviceOpportunity.category). */
  category: string | null;
  opportunityBlocked: boolean;
  /** Réponse du patient à la question du besoin : false = écarté. */
  patientAnswer: boolean | null;
  status: string;
  /** Une contre-indication avérée pour ce patient sur la proposition. */
  contraindicated: boolean;
  /** Marque normalisée du produit conseillé, s'il en a une. */
  productBrandKey: string | null;
};

export type CounterBrand = {
  brandId: string;
  slug: string;
  name: string;
  brandKey: string;
  partnerName: string;
  logoUrl: string | null;
  /** Univers de la marque et de ses gammes publiées. */
  universes: string[];
};

export type CounterCard = {
  brandId: string;
  slug: string;
  name: string;
  partnerName: string;
  logoUrl: string | null;
  universe: string;
  recommendationId: string;
};

/**
 * Un univers couvre-t-il ce besoin ? Plus strict que `universeAppliesTo` :
 * un univers sans catégorie liée (bébé, vétérinaire…) ne correspond à aucun
 * besoin du moteur, il ne déclenche donc jamais de carte.
 */
export function universeCoversCategory(universeKey: string, category: string | null): boolean {
  if (!category) return false;
  const universe = UNIVERSES.find((u) => u.key === universeKey);
  return Boolean(universe && (universe.categories as string[]).includes(category));
}

/** Conseils écartés au comptoir : refusés, retirés ou remplacés par le pharmacien. */
const CLOSED = new Set(["DECLINED", "REMOVED", "REPLACED"]);

export function selectCounterCards(advices: CounterAdvice[], brands: CounterBrand[], max = MAX_COUNTER_CARDS): CounterCard[] {
  const cards: CounterCard[] = [];
  const used = new Set<string>();
  const ordered = [...brands].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  for (const advice of advices) {
    if (cards.length >= max) break;
    if (advice.opportunityBlocked || advice.patientAnswer === false || advice.contraindicated || CLOSED.has(advice.status)) continue;
    for (const brand of ordered) {
      if (used.has(brand.brandId)) continue;
      if (advice.productBrandKey && advice.productBrandKey === brand.brandKey) continue;
      const universe = brand.universes.find((key) => universeCoversCategory(key, advice.category));
      if (!universe) continue;
      cards.push({ brandId: brand.brandId, slug: brand.slug, name: brand.name, partnerName: brand.partnerName, logoUrl: brand.logoUrl, universe, recommendationId: advice.recommendationId });
      used.add(brand.brandId);
      break;
    }
  }
  return cards;
}
