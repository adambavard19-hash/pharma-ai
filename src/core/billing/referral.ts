/**
 * Le parrainage, côté règles pures : la forme d'un code et la remise.
 * Chaque officine a un code « PB-XXXXXX ». Chaque filleul actif réduit
 * l'abonnement du parrain d'un montant par mois, jusqu'à zéro. Ce montant est
 * le montant standard, sauf offre de parrainage en cours à l'inscription du
 * filleul : il est alors figé sur la fiche du filleul et ne bouge plus.
 */
export const REFERRAL_DISCOUNT_CENTS = 1000;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^PB-[A-Z2-9]{6}$/.test(code) ? code : null;
}

/** La remise ne dépasse jamais le prix payé : un prix inconnu ne la borne pas. */
function cappedByPrice(rawCents: number, monthlyPriceCents: number | null): number {
  return monthlyPriceCents === null ? rawCents : Math.min(rawCents, Math.max(0, monthlyPriceCents));
}

/** La remise mensuelle : bornée par le prix, jamais négative. */
export function referralDiscountCents(activeReferrals: number, monthlyPriceCents: number | null): number {
  return cappedByPrice(Math.max(0, activeReferrals) * REFERRAL_DISCOUNT_CENTS, monthlyPriceCents);
}

/** Ce que ce filleul apporte par mois : le montant figé à son inscription, à défaut le montant standard (filleuls d'avant les offres). */
export function referralAmountFor(filleul: { referralAmountCents: number | null }): number {
  return filleul.referralAmountCents ?? REFERRAL_DISCOUNT_CENTS;
}

/** La remise mensuelle quand chaque filleul actif apporte son propre montant : leur somme, bornée par le prix, jamais négative. */
export function referralDiscountForAmounts(amountsCents: number[], monthlyPriceCents: number | null): number {
  const raw = amountsCents.reduce((sum, cents) => sum + (Number.isFinite(cents) ? Math.max(0, cents) : 0), 0);
  return cappedByPrice(raw, monthlyPriceCents);
}

export type ReferralOfferWindow = { amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null };

/**
 * L'offre de parrainage en cours : non annulée, démarrée, non échue (la date de
 * fin est exclue). Si plusieurs le sont, la plus récemment démarrée l'emporte ;
 * à démarrage égal, la première de la liste (l'appelant la trie de la plus
 * récemment créée à la plus ancienne).
 */
export function pickActiveReferralOffer<T extends ReferralOfferWindow>(offers: T[], now: Date): T | null {
  let best: T | null = null;
  for (const offer of offers) {
    if (offer.canceledAt) continue;
    if (offer.startsAt.getTime() > now.getTime()) continue;
    if (offer.endsAt && offer.endsAt.getTime() <= now.getTime()) continue;
    if (!best || offer.startsAt.getTime() > best.startsAt.getTime()) best = offer;
  }
  return best;
}
