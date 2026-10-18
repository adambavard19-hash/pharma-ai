import { AFFILIATE_SIGNUP_BONUS_CENTS, DIRECTOR_SIGNUP_BONUS_CENTS, monthlyAffiliateCommissionCents } from "./terms";

/** Le curseur du simulateur de la page Affiliation : de 0 à 500 pharmacies, 50 au départ. */
export const SIMULATOR_MIN_PHARMACIES = 0;
export const SIMULATOR_MAX_PHARMACIES = 500;
export const SIMULATOR_DEFAULT_PHARMACIES = 50;

/** Un nombre de pharmacies lisible : entier, borné au curseur. */
export function clampPharmacies(value: number): number {
  if (!Number.isFinite(value)) return SIMULATOR_DEFAULT_PHARMACIES;
  return Math.min(SIMULATOR_MAX_PHARMACIES, Math.max(SIMULATOR_MIN_PHARMACIES, Math.round(value)));
}

/**
 * Les revenus récurrents estimés d'un affilié : N pharmacies × abonnement mensuel HT × taux d'affiliation. Une estimation
 * avant impôts et charges, à titre d'illustration : seules les pharmacies réellement abonnées comptent.
 */
export function estimateAffiliateRevenue(pharmacies: number, monthlyPriceCents: number): { pharmacies: number; perPharmacyCents: number; perMonthCents: number; perYearCents: number } {
  const n = clampPharmacies(pharmacies);
  const perPharmacyCents = monthlyAffiliateCommissionCents(monthlyPriceCents);
  const perMonthCents = n * perPharmacyCents;
  return { pharmacies: n, perPharmacyCents, perMonthCents, perYearCents: perMonthCents * 12 };
}

/** Les primes d'arrivée de l'affilié pour N pharmacies (100 € HT chacune, une fois la mise en service réglée). */
export function estimateAffiliateSignupBonuses(pharmacies: number): number {
  return clampPharmacies(pharmacies) * AFFILIATE_SIGNUP_BONUS_CENTS;
}

/** Le curseur du simulateur du directeur commercial : de 1 à 500 pharmacies signées par l'équipe, 10 au départ. */
export const DIRECTOR_SIMULATOR_MIN = 1;
export const DIRECTOR_SIMULATOR_DEFAULT = 10;

/**
 * Ce que rapportent N pharmacies signées par l'équipe : la prime du directeur (N × 50 € HT, une fois chaque mise en
 * service réglée) et, pour information, ce que l'équipe d'affiliés touche chaque mois (N × 10 % de l'abonnement).
 */
export function estimateDirectorBonuses(pharmacies: number, monthlyPriceCents: number): { pharmacies: number; bonusCents: number; teamPerMonthCents: number } {
  const n = Math.max(DIRECTOR_SIMULATOR_MIN, clampPharmacies(pharmacies));
  return { pharmacies: n, bonusCents: n * DIRECTOR_SIGNUP_BONUS_CENTS, teamPerMonthCents: n * monthlyAffiliateCommissionCents(monthlyPriceCents) };
}
