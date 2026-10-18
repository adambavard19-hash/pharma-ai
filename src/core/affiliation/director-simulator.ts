import { DIRECTOR_SIGNUP_BONUS_CENTS } from "./director-terms";
import { clampPharmacies, estimateAffiliateRevenue } from "./simulator";

/** Le simulateur du directeur commercial, à part du simulateur de l'affilié (lu par le site et l'extranet). */

/** Le curseur du simulateur du directeur commercial : de 1 à 500 pharmacies signées par l'équipe, 10 au départ. */
export const DIRECTOR_SIMULATOR_MIN = 1;
export const DIRECTOR_SIMULATOR_DEFAULT = 10;

/**
 * Ce que rapportent N pharmacies signées par l'équipe : la prime du directeur (N × 50 € HT, une fois chaque mise en
 * service réglée) et, pour information, ce que l'équipe d'affiliés touche chaque mois (N × abonnement × taux du palier
 * atteint par N, comme si un seul affilié les avait apportées : une estimation haute, le palier étant propre à chaque
 * affilié).
 */
export function estimateDirectorBonuses(pharmacies: number, monthlyPriceCents: number): { pharmacies: number; bonusCents: number; teamPerMonthCents: number; teamRatePercent: number } {
  const n = Math.max(DIRECTOR_SIMULATOR_MIN, clampPharmacies(pharmacies));
  const team = estimateAffiliateRevenue(n, monthlyPriceCents);
  return { pharmacies: n, bonusCents: n * DIRECTOR_SIGNUP_BONUS_CENTS, teamPerMonthCents: team.perMonthCents, teamRatePercent: team.ratePercent };
}
