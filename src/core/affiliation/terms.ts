/**
 * Le programme d'affiliation de PharmaBoost (18 oct. 2026, à la place de « Devenir commercial ») : l'affilié touche un
 * pourcentage de l'abonnement mensuel de chaque pharmacie qu'il a apportée, chaque mois, aussi longtemps qu'elle reste
 * abonnée. Ce pourcentage AUGMENTE avec le nombre de pharmacies apportées encore abonnées (paliers, 18 oct. 2026) :
 * 10 %, puis 12 %, puis 15 %, au maximum 20 %. Le taux du palier atteint s'applique à TOUTES ses pharmacies ce mois-là.
 * Une seule source pour le site, l'extranet, la console et le calcul des commissions.
 */

/** Le taux de départ (premier palier). */
export const AFFILIATE_RECURRING_RATE = 0.1;

export type AffiliateTier = {
  /** Nombre minimal de pharmacies actives apportées pour atteindre le palier (inclus). */
  min: number;
  /** Nombre maximal (inclus), `null` pour le dernier palier. */
  max: number | null;
  /** Le taux, en pourcentage entier (10, 12, 15, 20). */
  ratePercent: number;
};

/**
 * Les paliers, selon le nombre de pharmacies actives apportées par l'affilié à la fin du mois :
 * 1 à 9 → 10 % ; 10 à 24 → 12 % ; 25 à 49 → 15 % ; 50 et plus → 20 % (plafond).
 */
export const AFFILIATE_TIERS: readonly AffiliateTier[] = [
  { min: 1, max: 9, ratePercent: 10 },
  { min: 10, max: 24, ratePercent: 12 },
  { min: 25, max: 49, ratePercent: 15 },
  { min: 50, max: null, ratePercent: 20 },
];

/** Le taux maximal : « 20 % ». */
export const AFFILIATE_MAX_RATE_PERCENT = AFFILIATE_TIERS[AFFILIATE_TIERS.length - 1].ratePercent;

/** Le palier atteint pour un nombre de pharmacies actives (0 ou moins : le premier palier, le taux de départ). */
export function affiliateTierFor(activeCount: number): AffiliateTier {
  const n = Number.isFinite(activeCount) ? Math.floor(activeCount) : 0;
  for (let index = AFFILIATE_TIERS.length - 1; index >= 0; index -= 1) {
    if (n >= AFFILIATE_TIERS[index].min) return AFFILIATE_TIERS[index];
  }
  return AFFILIATE_TIERS[0];
}

/** Le taux (0,10 ; 0,12 ; 0,15 ; 0,20) pour un nombre de pharmacies actives apportées. */
export function affiliateRateFor(activeCount: number): number {
  return affiliateTierFor(activeCount).ratePercent / 100;
}

/** Un taux lisible : 0,12 → « 12 % ». */
export function rateLabel(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}

/** Le taux de départ affiché : « 10 % ». */
export const AFFILIATE_RATE_LABEL = rateLabel(AFFILIATE_RECURRING_RATE);

/** Le plafond affiché : « 20 % ». */
export const AFFILIATE_MAX_RATE_LABEL = `${AFFILIATE_MAX_RATE_PERCENT} %`;

/** « 10 %, 12 %, 15 % puis 20 % ». */
export const AFFILIATE_TIERS_RATES_LABEL = `${AFFILIATE_TIERS.slice(0, -1).map((tier) => `${tier.ratePercent} %`).join(", ")} puis ${AFFILIATE_MAX_RATE_LABEL}`;

/** « 1 à 9 pharmacies », « 50 pharmacies et plus ». */
export function tierRangeLabel(tier: AffiliateTier): string {
  return tier.max === null ? `${tier.min} pharmacies et plus` : `${tier.min} à ${tier.max} pharmacies`;
}

/** Les paliers en une phrase : « 10 % de 1 à 9 pharmacies, 12 % de 10 à 24, 15 % de 25 à 49, 20 % à partir de 50 ». */
export const AFFILIATE_TIERS_SENTENCE = AFFILIATE_TIERS.map((tier, index) =>
  tier.max === null ? `${tier.ratePercent} % à partir de ${tier.min}` : `${tier.ratePercent} % de ${tier.min} à ${tier.max}${index === 0 ? " pharmacies" : ""}`,
).join(", ");

/** La commission mensuelle, en centimes, pour un abonnement mensuel HT donné et un taux (arrondie au centime). */
export function monthlyAffiliateCommissionCents(monthlySubscriptionCents: number, rate: number = AFFILIATE_RECURRING_RATE): number {
  return Math.round(monthlySubscriptionCents * rate);
}

/**
 * La prime unique de l'affilié (précision du fondateur, 18 oct. 2026, confirmée avec les paliers) : 100 € HT par pharmacie
 * apportée, due seulement une fois sa mise en service RÉELLEMENT réglée, une seule fois par pharmacie, EN PLUS de la
 * commission mensuelle. En centimes HT.
 *
 * La prime du directeur commercial vit à part (`director-terms.ts`) : ce fichier est lu par le site public et l'extranet
 * des affiliés, qui ne doivent jamais la voir.
 */
export const AFFILIATE_SIGNUP_BONUS_CENTS = 10000;
