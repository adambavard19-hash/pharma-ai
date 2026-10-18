import { describe, expect, it } from "vitest";
import {
  buildSubscriptionCheckout,
  cancellationTiming,
  commitmentEndDate,
  commitmentMonthsFromMetadata,
  firstInvoice,
  firstInvoiceSentence,
  referralCouponId,
  referralDiscountPlan,
  setupFeeFromMetadata,
  withVat,
} from "../checkout";
import { isActiveReferral } from "../referral";

const base = {
  customerId: "cus_1",
  recurring: { priceId: "price_mensuel" },
  setup: { priceId: "price_mise_en_service" },
  taxRateId: "txr_tva",
  trialDays: 0,
  metadata: { prospectId: "p_1", source: "SELF_SERVICE" },
  clientReferenceId: "p_1",
  description: "Abonnement PharmaBoost — Pharmacie du Port",
  submitMessage: "…",
  successUrl: "https://pharmaboost.test/abonnement/merci",
  cancelUrl: "https://pharmaboost.test/decouvrir/abonnement",
  expiresAt: 1_800_000_000,
};

describe("la session Checkout de l'abonnement", () => {
  it("prélèvement SEPA et carte, mode abonnement, TVA sur chaque ligne et par défaut sur l'abonnement", () => {
    const params = buildSubscriptionCheckout(base);
    expect(params.mode).toBe("subscription");
    expect(params.payment_method_types).toEqual(["sepa_debit", "card"]);
    expect(params.subscription_data.default_tax_rates).toEqual(["txr_tva"]);
    expect(params.line_items.every((line) => line.tax_rates[0] === "txr_tva")).toBe(true);
    expect(params.billing_address_collection).toBe("required");
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.allow_promotion_codes).toBe(false);
  });

  it("la mise en service est une ligne ponctuelle à côté du mois : elle n'est facturée que sur la première facture", () => {
    const params = buildSubscriptionCheckout(base);
    expect(params.line_items).toEqual([
      { price: "price_mensuel", quantity: 1, tax_rates: ["txr_tva"] },
      { price: "price_mise_en_service", quantity: 1, tax_rates: ["txr_tva"] },
    ]);
  });

  it("un montant de mise en service hors catalogue est posé tel quel sur le produit « mise en service », sans récurrence", () => {
    const params = buildSubscriptionCheckout({ ...base, setup: { productId: "pharmaboost_mise_en_service", unitAmountCents: 15_000, currency: "eur" } });
    expect(params.line_items[1]).toEqual({ price_data: { currency: "eur", product: "pharmaboost_mise_en_service", unit_amount: 15_000 }, quantity: 1, tax_rates: ["txr_tva"] });
  });

  it("sans mise en service : une seule ligne ; tarif contractuel : prix posé sur le produit de l'offre", () => {
    const params = buildSubscriptionCheckout({ ...base, setup: null, recurring: { productId: "prod_offre", unitAmountCents: 9_900, currency: "eur" } });
    expect(params.line_items).toEqual([{ price_data: { currency: "eur", product: "prod_offre", unit_amount: 9_900, recurring: { interval: "month" } }, quantity: 1, tax_rates: ["txr_tva"] }]);
  });

  it("aucun essai sans jours offerts ; un essai garde la règle « annulé sans moyen de paiement »", () => {
    expect(buildSubscriptionCheckout(base).subscription_data).not.toHaveProperty("trial_period_days");
    const trial = buildSubscriptionCheckout({ ...base, trialDays: 30 }).subscription_data;
    expect(trial).toMatchObject({ trial_period_days: 30, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } });
  });

  it("les métadonnées rattachent la session ET l'abonnement au dossier", () => {
    const params = buildSubscriptionCheckout(base);
    expect(params.metadata).toEqual(base.metadata);
    expect(params.subscription_data.metadata).toEqual(base.metadata);
  });
});

describe("la première facture", () => {
  it("150 € + 126 € HT = 276 € HT, soit 331,20 € TTC ; puis 126 € HT", () => {
    expect(firstInvoice({ monthlyCents: 12_600, setupFeeCents: 15_000, trialDays: 0 })).toEqual({ monthlyCents: 12_600, setupFeeCents: 15_000, todayCents: 27_600, todayWithVatCents: 33_120 });
    expect(withVat(12_600)).toBe(15_120);
  });

  it("la phrase dit le détail, le TTC, la suite et l'engagement", () => {
    const sentence = firstInvoiceSentence({ monthlyCents: 12_600, setupFeeCents: 15_000, trialDays: 0, commitmentMonths: 12 });
    expect(sentence).toBe("Aujourd'hui : 150 € de mise en service + 126 € pour le premier mois, soit 276 € HT (331,20 € TTC). Puis 126 € HT par mois. Engagement de 12 mois.");
  });

  it("mise en service offerte : seulement le premier mois", () => {
    expect(firstInvoiceSentence({ monthlyCents: 12_600, setupFeeCents: 0, trialDays: 0, commitmentMonths: null })).toBe("Aujourd'hui : 126 € HT pour le premier mois (151,20 € TTC). Puis 126 € HT par mois.");
  });

  it("avec un essai (contrat signé) : la mise en service aujourd'hui, l'abonnement après l'essai", () => {
    const sentence = firstInvoiceSentence({ monthlyCents: 12_600, setupFeeCents: 15_000, trialDays: 30, trialEndsAt: new Date("2026-11-11T10:00:00Z"), commitmentMonths: 12 });
    expect(sentence).toBe("Aujourd'hui : 150 € HT de mise en service (180 € TTC). Premier mois offert, puis 126 € HT par mois à partir du 11/11/2026. Engagement de 12 mois.");
  });
});

describe("l'engagement", () => {
  it("12 mois après le début, au même quantième et à la même heure : une échéance", () => {
    expect(commitmentEndDate(new Date("2026-10-11T14:30:00Z"), 12).toISOString()).toBe("2027-10-11T14:30:00.000Z");
  });

  it("borné à la fin du mois comme l'échéance Stripe", () => {
    expect(commitmentEndDate(new Date("2027-01-31T08:00:00Z"), 1).toISOString()).toBe("2027-02-28T08:00:00.000Z");
    expect(commitmentEndDate(new Date("2027-01-31T08:00:00Z"), 13).toISOString()).toBe("2028-02-29T08:00:00.000Z");
  });

  it("une résiliation pendant l'engagement prend effet à sa fin, jamais avant ; après, à la fin de la période", () => {
    const end = new Date("2027-10-11T14:30:00Z");
    const periodEnd = new Date("2026-12-11T14:30:00Z");
    expect(cancellationTiming({ commitmentEndsAt: end, currentPeriodEnd: periodEnd, now: new Date("2026-11-20T00:00:00Z") })).toEqual({ kind: "COMMITMENT_END", at: end });
    expect(cancellationTiming({ commitmentEndsAt: end, currentPeriodEnd: periodEnd, now: new Date("2027-10-12T00:00:00Z") })).toEqual({ kind: "PERIOD_END", at: periodEnd });
    expect(cancellationTiming({ commitmentEndsAt: null, currentPeriodEnd: periodEnd, now: new Date("2026-11-20T00:00:00Z") })).toEqual({ kind: "PERIOD_END", at: periodEnd });
  });

  it("les métadonnées : un engagement et une mise en service plausibles, sinon rien", () => {
    expect(commitmentMonthsFromMetadata({ commitmentMonths: "12" })).toBe(12);
    expect(commitmentMonthsFromMetadata({ commitmentMonths: "douze" })).toBeNull();
    expect(commitmentMonthsFromMetadata({})).toBeNull();
    expect(setupFeeFromMetadata({ setupFeeCents: "15000" })).toBe(15_000);
    expect(setupFeeFromMetadata({ setupFeeCents: "0" })).toBe(0);
    expect(setupFeeFromMetadata({ setupFeeCents: "-5" })).toBeNull();
    expect(setupFeeFromMetadata({})).toBeNull();
  });
});

describe("la remise de parrainage posée chez Stripe", () => {
  it("un coupon par montant", () => {
    expect(referralCouponId(2_520)).toBe("pb-parrainage-2520");
  });

  it("pose le coupon quand il manque, sans toucher aux autres remises", () => {
    expect(referralDiscountPlan([{ discountId: "di_autre", couponId: "BIENVENUE" }], 2_520)).toEqual({ changed: true, discounts: [{ discount: "di_autre" }, { coupon: "pb-parrainage-2520" }] });
  });

  it("déjà la bonne remise : rien à envoyer", () => {
    expect(referralDiscountPlan([{ discountId: "di_1", couponId: "pb-parrainage-2520" }], 2_520).changed).toBe(false);
  });

  it("montant changé : remplacé ; plus de filleul actif : retiré", () => {
    expect(referralDiscountPlan([{ discountId: "di_1", couponId: "pb-parrainage-2520" }], 3_000)).toEqual({ changed: true, discounts: [{ coupon: "pb-parrainage-3000" }] });
    expect(referralDiscountPlan([{ discountId: "di_1", couponId: "pb-parrainage-2520" }], 0)).toEqual({ changed: true, discounts: [] });
    expect(referralDiscountPlan([], 0).changed).toBe(false);
  });
});

describe("un filleul qui compte", () => {
  const sub = (status: string, stripeLinked = true, hasPayment = true) => ({ status, stripeLinked, hasPayment });
  it("abonnement Stripe actif ET payé ; un prélèvement SEPA pas encore confirmé ne compte pas", () => {
    expect(isActiveReferral({ pharmacyActive: true, subscription: sub("ACTIVE") })).toBe(true);
    expect(isActiveReferral({ pharmacyActive: true, subscription: sub("ACTIVE", true, false) })).toBe(false);
    expect(isActiveReferral({ pharmacyActive: true, subscription: sub("ACTIVE", false, false) })).toBe(true);
  });

  it("impayé, résilié, à finaliser, ou officine suspendue : non ; en essai ou sans abonnement suivi : oui", () => {
    for (const status of ["PAST_DUE", "CANCELED", "INCOMPLETE", "UNPAID", "SUSPENDED"]) expect(isActiveReferral({ pharmacyActive: true, subscription: sub(status) })).toBe(false);
    expect(isActiveReferral({ pharmacyActive: false, subscription: sub("ACTIVE") })).toBe(false);
    expect(isActiveReferral({ pharmacyActive: true, subscription: sub("TRIALING", true, false) })).toBe(true);
    expect(isActiveReferral({ pharmacyActive: true, subscription: null })).toBe(true);
  });
});
