/**
 * Le parrainage, côté règles pures : la forme d'un code et la remise.
 * Chaque officine a un code « PB-XXXXXX ». Chaque filleul actif réduit
 * l'abonnement du parrain d'un montant fixe par mois, jusqu'à zéro.
 */
export const REFERRAL_DISCOUNT_CENTS = 1000;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^PB-[A-Z2-9]{6}$/.test(code) ? code : null;
}

/** La remise mensuelle : bornée par le prix, jamais négative. */
export function referralDiscountCents(activeReferrals: number, monthlyPriceCents: number | null): number {
  const raw = Math.max(0, activeReferrals) * REFERRAL_DISCOUNT_CENTS;
  return monthlyPriceCents === null ? raw : Math.min(raw, Math.max(0, monthlyPriceCents));
}
