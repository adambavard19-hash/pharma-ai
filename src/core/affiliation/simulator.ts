import { AFFILIATE_SIGNUP_BONUS_CENTS, AFFILIATE_TIERS, affiliateRateFor, affiliateTierFor, monthlyAffiliateCommissionCents } from "./terms";

/** Le curseur du simulateur de la page Affiliation : de 0 à 500 pharmacies, 50 au départ. */
export const SIMULATOR_MIN_PHARMACIES = 0;
export const SIMULATOR_MAX_PHARMACIES = 500;
export const SIMULATOR_DEFAULT_PHARMACIES = 50;

/** Un nombre de pharmacies lisible : entier, borné au curseur. */
export function clampPharmacies(value: number): number {
  if (!Number.isFinite(value)) return SIMULATOR_DEFAULT_PHARMACIES;
  return Math.min(SIMULATOR_MAX_PHARMACIES, Math.max(SIMULATOR_MIN_PHARMACIES, Math.round(value)));
}

export type AffiliateEstimate = {
  pharmacies: number;
  /** Le taux du palier atteint, en pourcentage entier (10, 12, 15, 20). */
  ratePercent: number;
  /** L'index du palier atteint dans `AFFILIATE_TIERS` (0 à 3). */
  tierIndex: number;
  perPharmacyCents: number;
  perMonthCents: number;
  perYearCents: number;
};

/**
 * Les revenus récurrents estimés d'un affilié : N pharmacies × abonnement mensuel HT × taux du palier atteint par N
 * (10, 12, 15 ou 20 %, appliqué à toutes). Une estimation avant impôts et charges, à titre d'illustration : seules les
 * pharmacies réellement abonnées comptent.
 */
export function estimateAffiliateRevenue(pharmacies: number, monthlyPriceCents: number): AffiliateEstimate {
  const n = clampPharmacies(pharmacies);
  const tier = affiliateTierFor(n);
  const perPharmacyCents = monthlyAffiliateCommissionCents(monthlyPriceCents, affiliateRateFor(n));
  const perMonthCents = n * perPharmacyCents;
  return { pharmacies: n, ratePercent: tier.ratePercent, tierIndex: AFFILIATE_TIERS.indexOf(tier), perPharmacyCents, perMonthCents, perYearCents: perMonthCents * 12 };
}

/** Les primes d'arrivée de l'affilié pour N pharmacies (100 € HT chacune, une fois la mise en service réglée). */
export function estimateAffiliateSignupBonuses(pharmacies: number): number {
  return clampPharmacies(pharmacies) * AFFILIATE_SIGNUP_BONUS_CENTS;
}
