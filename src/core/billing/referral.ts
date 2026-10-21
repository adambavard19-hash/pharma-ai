import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";

/**
 * Le parrainage, côté règles pures : la forme d'un code et la remise.
 *
 * Chaque officine a un code « PB-XXXXXX ». Dès qu'au moins UNE officine qu'elle
 * parraine est abonnée (un filleul actif), son abonnement passe à 10 % de moins
 * par mois : 10 % de son prix CONTRACTUEL, arrondi au centime. Deux filleuls actifs
 * ou plus : 20 % (fondateur, 21 oct. 2026 : « parrainez 2 confrères, 20 % »). Jamais
 * plus de 20 %, quel que soit le nombre de filleuls.
 *
 * Exception explicite : une OFFRE de parrainage de la console fait apporter à
 * chaque nouveau filleul, pendant sa durée, un montant fixe par mois. Ce montant
 * est figé sur la fiche du filleul à son inscription (`Pharmacy.referralAmountCents`,
 * `null` hors offre). Le parrain bénéficie alors du plus avantageux entre les 10 %
 * et la somme des montants d'offre de ses filleuls actifs, jamais plus que son prix.
 *
 * La remise est CALCULÉE ici, une seule fois pour tous : l'écran du titulaire, la
 * console et Stripe lisent le même calcul. Quand le parrain a un abonnement Stripe,
 * elle y est appliquée par un coupon `amount_off` permanent (synchronisation dans
 * `server/billing/referral-discount.ts`), recalculée dès qu'un filleul devient
 * actif, résilie ou ne paie plus. Le filleul, lui, paie le plein tarif.
 */

/**
 * Un filleul compte-t-il ? Son officine doit être ouverte, et son abonnement,
 * quand il est suivi, en règle :
 *   - en essai : oui ;
 *   - actif : oui si l'abonnement n'est pas payé par Stripe (règlement hors Stripe),
 *     sinon seulement après un premier paiement reçu — un prélèvement SEPA encore
 *     « en cours » ne fait pas baisser le prix du parrain ;
 *   - impayé, résilié, à finaliser, suspendu : non.
 * Sans abonnement suivi (officine d'avant la facturation en ligne) : l'officine ouverte suffit.
 */
export function isActiveReferral(filleul: { pharmacyActive: boolean; subscription: { status: string; stripeLinked: boolean; hasPayment: boolean } | null }): boolean {
  if (!filleul.pharmacyActive) return false;
  const sub = filleul.subscription;
  if (!sub) return true;
  if (sub.status === "TRIALING") return true;
  if (sub.status === "ACTIVE") return !sub.stripeLinked || sub.hasPayment;
  return false;
}

/** Le pourcentage de la remise : celui de l'offre officielle, une seule source. */
export const REFERRAL_DISCOUNT_PERCENT = OFFICIAL_OFFER.referralDiscountPercent;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^PB-[A-Z2-9]{6}$/.test(code) ? code : null;
}

const isPrice = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Le nombre de filleuls actifs à partir duquel la remise est la plus forte (deux confrères : deux fois 10 %). */
export const REFERRAL_MAX_COUNTED = 2;

/** Le pourcentage pour ce nombre de filleuls actifs : 0, 10 % pour un, 20 % pour deux ou plus. */
export function referralPercentFor(activeReferrals: number, basePercent: number = REFERRAL_DISCOUNT_PERCENT): number {
  return Math.max(0, Math.min(Math.floor(activeReferrals), REFERRAL_MAX_COUNTED)) * basePercent;
}

/** Ce pourcentage (10 % par défaut) du prix contractuel, arrondi au centime ; 0 sans prix connu (pas d'abonnement) ou à prix nul. */
export function referralPercentDiscountCents(monthlyPriceCents: number | null, percent: number = REFERRAL_DISCOUNT_PERCENT): number {
  return isPrice(monthlyPriceCents) ? Math.round((monthlyPriceCents * percent) / 100) : 0;
}

/** La remise mensuelle : 10 % dès UN filleul actif, 20 % dès deux, jamais davantage ; 0 sans filleul actif. */
export function referralDiscountCents(activeReferrals: number, monthlyPriceCents: number | null): number {
  return referralPercentDiscountCents(monthlyPriceCents, referralPercentFor(activeReferrals));
}

/** Le montant d'offre figé sur ce filleul à son inscription, ou `null` : hors offre, c'est la règle des 10 % qui s'applique. */
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
  /** D'où elle vient : les 10 %, ou la somme des montants d'offre (quand elle est plus avantageuse) ; `null` sans remise. */
  basis: "PERCENT" | "OFFERS" | null;
};

/**
 * La remise d'un parrain : le plus avantageux entre les 10 % (dès un filleul
 * actif) et la somme des montants d'offre de ses filleuls actifs, bornée par son
 * prix contractuel. À égalité, les 10 % (la règle, pas l'exception).
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
