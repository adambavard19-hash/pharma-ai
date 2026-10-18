/**
 * Le programme d'affiliation de PharmaBoost (18 oct. 2026, à la place de « Devenir commercial ») : l'affilié touche
 * 10 % de l'abonnement mensuel de chaque pharmacie qu'il a apportée, chaque mois, aussi longtemps qu'elle reste abonnée.
 * Une seule source pour le site, l'extranet, la console et le calcul des commissions.
 */
export const AFFILIATE_RECURRING_RATE = 0.1;

/** Le taux affiché : « 10 % ». */
export const AFFILIATE_RATE_LABEL = `${Math.round(AFFILIATE_RECURRING_RATE * 100)} %`;

/** La commission mensuelle, en centimes, pour un abonnement mensuel HT donné (arrondie au centime). */
export function monthlyAffiliateCommissionCents(monthlySubscriptionCents: number): number {
  return Math.round(monthlySubscriptionCents * AFFILIATE_RECURRING_RATE);
}

/**
 * Les primes uniques (précision du fondateur, 18 oct. 2026), dues seulement une fois la mise en service RÉELLEMENT
 * réglée par la pharmacie, une seule fois par pharmacie : 100 € HT à l'affilié qui l'a apportée, 50 € HT au directeur
 * commercial pour une pharmacie signée par son équipe. En centimes HT.
 */
export const AFFILIATE_SIGNUP_BONUS_CENTS = 10000;
export const DIRECTOR_SIGNUP_BONUS_CENTS = 5000;
