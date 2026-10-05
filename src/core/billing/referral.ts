import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";

/**
 * Le parrainage, côté règles pures : la forme d'un code et la remise.
 *
 * Chaque officine a un code « PB-XXXXXX ». Dès qu'au moins UNE officine qu'elle
 * parraine est abonnée (un filleul actif), son abonnement passe à 20 % de moins
 * par mois : 20 % de son prix CONTRACTUEL, arrondi au centime. La remise ne se
 * cumule pas : deux filleuls, c'est toujours 20 %, jamais 40 %.
 *
 * Exception explicite : une OFFRE de parrainage de la console fait apporter à
 * chaque nouveau filleul, pendant sa durée, un montant fixe par mois. Ce montant
 * est figé sur la fiche du filleul à son inscription (`Pharmacy.referralAmountCents`,
 * `null` hors offre). Le parrain bénéficie alors du plus avantageux entre les 20 %
 * et la somme des montants d'offre de ses filleuls actifs, jamais plus que son prix.
 *
 * La remise est CALCULÉE et AFFICHÉE ici ; aucune remise Stripe n'est créée : elle
 * est appliquée à l'abonnement par l'équipe PharmaBoost.
 */

/** Le pourcentage de la remise : celui de l'offre officielle, une seule source. */
export const REFERRAL_DISCOUNT_PERCENT = OFFICIAL_OFFER.referralDiscountPercent;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^PB-[A-Z2-9]{6}$/.test(code) ? code : null;
}

const isPrice = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** 20 % du prix contractuel, arrondi au centime ; 0 sans prix connu (pas d'abonnement) ou à prix nul. */
export function referralPercentDiscountCents(monthlyPriceCents: number | null): number {
  return isPrice(monthlyPriceCents) ? Math.round((monthlyPriceCents * REFERRAL_DISCOUNT_PERCENT) / 100) : 0;
}

/** La remise mensuelle des 20 % : dès UN filleul actif, jamais davantage quel que soit leur nombre ; 0 sans filleul actif. */
export function referralDiscountCents(activeReferrals: number, monthlyPriceCents: number | null): number {
  return activeReferrals >= 1 ? referralPercentDiscountCents(monthlyPriceCents) : 0;
}

/** Le montant d'offre figé sur ce filleul à son inscription, ou `null` : hors offre, c'est la règle des 20 % qui s'applique. */
export function referralOfferAmountFor(filleul: { referralAmountCents: number | null }): number | null {
  const amount = filleul.referralAmountCents;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** La somme des montants d'offre de ces filleuls, bornée par le prix contractuel, jamais négative ; sans prix connu, 0. */
export function referralDiscountForAmounts(amountsCents: number[], monthlyPriceCents: number | null): number {
  if (!isPrice(monthlyPriceCents)) return 0;
  const raw = amountsCents.reduce((sum, cents) => sum + (Number.isFinite(cents) ? Math.max(0, cents) : 0), 0);
  return Math.min(raw, monthlyPriceCents);
}

export type ReferralBenefit = {
  /** La remise mensuelle HT, en centimes. */
  discountCents: number;
  /** D'où elle vient : les 20 %, ou la somme des montants d'offre (quand elle est plus avantageuse) ; `null` sans remise. */
  basis: "PERCENT" | "OFFERS" | null;
};

/**
 * La remise d'un parrain : le plus avantageux entre les 20 % (dès un filleul
 * actif) et la somme des montants d'offre de ses filleuls actifs, bornée par son
 * prix contractuel. À égalité, les 20 % (la règle, pas l'exception).
 */
export function referralBenefit(filleuls: { active: boolean; offerAmountCents: number | null }[], monthlyPriceCents: number | null): ReferralBenefit {
  const active = filleuls.filter((f) => f.active);
  const percent = referralDiscountCents(active.length, monthlyPriceCents);
  const offers = referralDiscountForAmounts(active.flatMap((f) => (f.offerAmountCents === null ? [] : [f.offerAmountCents])), monthlyPriceCents);
  if (offers > percent) return { discountCents: offers, basis: "OFFERS" };
  return percent > 0 ? { discountCents: percent, basis: "PERCENT" } : { discountCents: 0, basis: null };
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
