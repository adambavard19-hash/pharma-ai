import { formatEuros, formatFrenchDate } from "./subscription";

/**
 * Le paiement de l'abonnement, côté règles pures : ce que porte la session
 * Checkout Stripe, ce que dit la première facture, l'engagement et la date
 * d'effet d'une résiliation. Aucun appel réseau ici : le serveur assemble, ce
 * module décide (et se teste sans Stripe).
 *
 * Règles du fondateur (11 oct. 2026) :
 *   - prélèvement SEPA ou carte, au choix du titulaire ;
 *   - la mise en service (150 € HT) est payée AVEC le premier mois : première
 *     facture 150 + 126 € HT, puis 126 € HT par mois ;
 *   - montants HT, TVA 20 % ajoutée (taux exclusif) ;
 *   - engagement de 12 mois : une résiliation demandée avant prend effet à la fin
 *     de l'engagement, jamais avant.
 */

/** Les moyens de paiement proposés : prélèvement SEPA et carte. */
export const CHECKOUT_PAYMENT_METHODS = ["sepa_debit", "card"] as const;

/** TVA française : 20 %, ajoutée aux montants HT. */
export const VAT_PERCENT = 20;

/** La ligne récurrente : le prix Stripe de l'offre, ou le tarif contractuel posé sur le produit de l'offre. */
export type RecurringLine = { priceId: string } | { productId: string; unitAmountCents: number; currency: string };

/** La ligne ponctuelle : le prix Stripe de l'offre, ou un montant exact posé sur le produit « mise en service ». */
export type SetupLine = { priceId: string } | { productId: string; unitAmountCents: number; currency: string };

export type CheckoutInput = {
  customerId: string;
  recurring: RecurringLine;
  /** La mise en service (ligne ponctuelle de la première facture) ; `null` : aucune sur cette souscription. */
  setup: SetupLine | null;
  taxRateId: string;
  trialDays: number;
  /** Rattache la future Subscription (et la session) à l'officine ou au dossier : jamais une autorisation. */
  metadata: Record<string, string>;
  clientReferenceId: string;
  description: string;
  submitMessage: string;
  successUrl: string;
  cancelUrl: string;
  /** Secondes UNIX. */
  expiresAt: number;
};

/**
 * Les paramètres de la session Checkout (mode abonnement). La mise en service
 * est une ligne ponctuelle : Stripe l'ajoute à la PREMIÈRE facture seulement.
 * La TVA s'applique aux deux lignes, et reste le taux par défaut de
 * l'abonnement (une ligne changée plus tard par la console reste taxée).
 */
export function buildSubscriptionCheckout(input: CheckoutInput) {
  const recurring =
    "priceId" in input.recurring
      ? { price: input.recurring.priceId, quantity: 1, tax_rates: [input.taxRateId] }
      : { price_data: { currency: input.recurring.currency, product: input.recurring.productId, unit_amount: input.recurring.unitAmountCents, recurring: { interval: "month" as const } }, quantity: 1, tax_rates: [input.taxRateId] };
  const setup = !input.setup
    ? []
    : "priceId" in input.setup
      ? [{ price: input.setup.priceId, quantity: 1, tax_rates: [input.taxRateId] }]
      : [{ price_data: { currency: input.setup.currency, product: input.setup.productId, unit_amount: input.setup.unitAmountCents }, quantity: 1, tax_rates: [input.taxRateId] }];
  const lineItems = [recurring, ...setup];
  const trialDays = Math.max(0, Math.floor(input.trialDays));
  return {
    mode: "subscription" as const,
    customer: input.customerId,
    customer_update: { address: "auto" as const, name: "auto" as const },
    payment_method_types: [...CHECKOUT_PAYMENT_METHODS],
    line_items: lineItems,
    payment_method_collection: "always" as const,
    subscription_data: {
      ...(trialDays > 0 ? { trial_period_days: trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } } : {}),
      default_tax_rates: [input.taxRateId],
      metadata: input.metadata,
      description: input.description,
    },
    metadata: input.metadata,
    client_reference_id: input.clientReferenceId,
    locale: "fr" as const,
    allow_promotion_codes: false,
    billing_address_collection: "required" as const,
    tax_id_collection: { enabled: true },
    custom_text: { submit: { message: input.submitMessage } },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: input.expiresAt,
  };
}

/** Un montant HT augmenté de la TVA, arrondi au centime. */
export function withVat(cents: number, vatPercent = VAT_PERCENT): number {
  return Math.round((cents * (100 + vatPercent)) / 100);
}

export type FirstInvoice = {
  monthlyCents: number;
  setupFeeCents: number;
  /** Ce qui est facturé à la souscription, HT et TTC (0 pendant un essai, mise en service à part). */
  todayCents: number;
  todayWithVatCents: number;
};

/** La première facture : la mise en service et, sans essai, le premier mois. */
export function firstInvoice(input: { monthlyCents: number; setupFeeCents: number; trialDays: number }): FirstInvoice {
  const setup = Math.max(0, input.setupFeeCents);
  const today = setup + (input.trialDays > 0 ? 0 : input.monthlyCents);
  return { monthlyCents: input.monthlyCents, setupFeeCents: setup, todayCents: today, todayWithVatCents: withVat(today) };
}

/**
 * La phrase dite avant le paiement (Checkout, page du lien, formulaire) :
 * « Aujourd'hui : 150 € de mise en service + 126 € pour le premier mois, soit
 * 276 € HT (331,20 € TTC). Puis 126 € HT par mois. Engagement de 12 mois. »
 */
export function firstInvoiceSentence(input: { monthlyCents: number; setupFeeCents: number; trialDays: number; trialEndsAt?: Date | null; commitmentMonths: number | null }): string {
  const invoice = firstInvoice(input);
  const monthly = `${formatEuros(input.monthlyCents)} HT par mois`;
  const commitment = input.commitmentMonths ? ` Engagement de ${input.commitmentMonths} mois.` : "";
  if (input.trialDays > 0) {
    const offer = input.trialDays === 30 || input.trialDays === 31 ? "Premier mois offert" : `${input.trialDays} jours offerts`;
    const start = input.trialEndsAt ? ` à partir du ${formatFrenchDate(input.trialEndsAt)}` : "";
    const setup = invoice.setupFeeCents > 0 ? `Aujourd'hui : ${formatEuros(invoice.setupFeeCents)} HT de mise en service (${formatEuros(invoice.todayWithVatCents)} TTC). ` : "";
    return `${setup}${offer}, puis ${monthly}${start}.${commitment}`;
  }
  const parts = invoice.setupFeeCents > 0 ? `${formatEuros(invoice.setupFeeCents)} de mise en service + ${formatEuros(input.monthlyCents)} pour le premier mois, soit ${formatEuros(invoice.todayCents)} HT` : `${formatEuros(invoice.todayCents)} HT pour le premier mois`;
  return `Aujourd'hui : ${parts} (${formatEuros(invoice.todayWithVatCents)} TTC). Puis ${monthly}.${commitment}`;
}

// ---------------------------------------------------------------- Engagement

/**
 * La fin de l'engagement : le début de l'abonnement plus N mois, même heure,
 * au même quantième (borné à la fin du mois, comme la date d'échéance Stripe :
 * 31 janvier + 1 mois = 28 ou 29 février). Elle tombe donc sur une échéance.
 */
export function commitmentEndDate(start: Date, months: number): Date {
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return target;
}

/** L'engagement court-il encore ? */
export function commitmentRunning(commitmentEndsAt: Date | null, now: Date): boolean {
  return Boolean(commitmentEndsAt && commitmentEndsAt.getTime() > now.getTime());
}

/**
 * Quand une résiliation demandée aujourd'hui prend effet : à la fin de
 * l'engagement s'il court encore, sinon à la fin de la période payée. Jamais
 * plus tôt : la console ne l'avance pas.
 */
export function cancellationTiming(input: { commitmentEndsAt: Date | null; currentPeriodEnd: Date | null; now: Date }): { kind: "COMMITMENT_END"; at: Date } | { kind: "PERIOD_END"; at: Date | null } {
  if (input.commitmentEndsAt && commitmentRunning(input.commitmentEndsAt, input.now)) return { kind: "COMMITMENT_END", at: input.commitmentEndsAt };
  return { kind: "PERIOD_END", at: input.currentPeriodEnd };
}

/** La durée d'engagement portée par les métadonnées d'un abonnement Stripe (« 12 »), ou `null`. */
export function commitmentMonthsFromMetadata(metadata: Record<string, string>): number | null {
  const months = Number(metadata.commitmentMonths);
  return Number.isInteger(months) && months > 0 && months <= 60 ? months : null;
}

/** La mise en service portée par les métadonnées (« 15000 »), ou `null`. */
export function setupFeeFromMetadata(metadata: Record<string, string>): number | null {
  if (metadata.setupFeeCents === undefined || metadata.setupFeeCents === "") return null;
  const cents = Number(metadata.setupFeeCents);
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

// ---------------------------------------------------------------- Parrainage chez Stripe

/** Le préfixe des coupons de parrainage : un coupon par montant, partagé par tous les parrains au même montant. */
export const REFERRAL_COUPON_PREFIX = "pb-parrainage-";

export function referralCouponId(amountCents: number): string {
  return `${REFERRAL_COUPON_PREFIX}${amountCents}`;
}

export function isReferralCoupon(couponId: string | null | undefined): boolean {
  return Boolean(couponId && couponId.startsWith(REFERRAL_COUPON_PREFIX));
}

/**
 * Les remises à poser sur l'abonnement du parrain : les autres remises sont
 * gardées telles quelles, celle du parrainage est remplacée (ou retirée à 0).
 * `changed: false` quand rien n'est à envoyer à Stripe.
 */
export function referralDiscountPlan(current: { discountId: string; couponId: string | null }[], desiredCents: number): { changed: boolean; discounts: ({ discount: string } | { coupon: string })[] } {
  const ours = current.filter((d) => isReferralCoupon(d.couponId));
  const others = current.filter((d) => !isReferralCoupon(d.couponId));
  const desiredCoupon = desiredCents > 0 ? referralCouponId(desiredCents) : null;
  const alreadyRight = desiredCoupon ? ours.length === 1 && ours[0].couponId === desiredCoupon : ours.length === 0;
  const discounts = [...others.map((d) => ({ discount: d.discountId })), ...(desiredCoupon ? [{ coupon: desiredCoupon }] : [])];
  return { changed: !alreadyRight, discounts };
}
