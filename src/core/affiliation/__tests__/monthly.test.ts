import { describe, expect, it } from "vitest";
import { AFFILIATE_RULE_SENTENCE, AFFILIATION_PROGRAM_START, affiliateCommissionForMonth, setupPaidAt, signupBonusDue, monthLabelOf, monthPeriodOf, monthlySubscriptionCents, previousMonthPeriod, subscribedAtMonthEnd, type SubscriptionFacts } from "../monthly";

/**
 * La commission mensuelle d'affiliation, règles pures : le mois écoulé (heure de Paris), « abonnée à la fin du mois »,
 * l'abonnement réellement facturé, et 10 % de celui-ci.
 */

const october = monthPeriodOf(new Date("2026-10-15T12:00:00Z"));
const sub = (overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  status: "ACTIVE",
  createdAt: new Date("2026-06-01T10:00:00Z"),
  trialEndsAt: null,
  endedAt: null,
  canceledAt: null,
  contractPriceCents: 12_600,
  referralDiscountCents: null,
  plan: { monthlyPriceCents: 14_900 },
  ...overrides,
});

describe("le mois commissionné", () => {
  it("le mois civil de Paris : clé, libellé, bornes", () => {
    expect(october.key).toBe("2026-10");
    expect(october.label).toBe("octobre 2026");
    // Minuit à Paris le 1er octobre (UTC+2) et le 1er novembre (UTC+1, après le changement d'heure).
    expect(october.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(october.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("un passage le 1er novembre à 8 h commissionne octobre ; un passage le 31 octobre au soir, septembre", () => {
    expect(previousMonthPeriod(new Date("2026-11-01T07:00:00Z")).key).toBe("2026-10");
    expect(previousMonthPeriod(new Date("2026-10-31T22:30:00Z")).key).toBe("2026-09");
    // Le 1er novembre à 0 h 30 à Paris (31 octobre 23 h 30 UTC) : déjà novembre, donc octobre.
    expect(previousMonthPeriod(new Date("2026-10-31T23:30:00Z")).key).toBe("2026-10");
    // Janvier : décembre de l'année d'avant.
    expect(previousMonthPeriod(new Date("2027-01-01T08:00:00Z")).key).toBe("2026-12");
  });

  it("le libellé d'une clé", () => {
    expect(monthLabelOf("2026-10")).toBe("octobre 2026");
    expect(monthLabelOf("2027-01")).toBe("janvier 2027");
    expect(monthLabelOf(null)).toBe("");
    expect(monthLabelOf("n'importe")).toBe("n'importe");
  });
});

describe("abonnée à la fin du mois", () => {
  it("abonnement actif, essai terminé : oui", () => {
    expect(subscribedAtMonthEnd(sub(), october)).toBe(true);
    expect(subscribedAtMonthEnd(sub({ trialEndsAt: new Date("2026-10-10T00:00:00Z") }), october)).toBe(true);
  });

  it("sans abonnement, encore en essai à la fin du mois, ou né après le mois : non", () => {
    expect(subscribedAtMonthEnd(null, october)).toBe(false);
    expect(subscribedAtMonthEnd(sub({ trialEndsAt: new Date("2026-11-05T00:00:00Z") }), october)).toBe(false);
    expect(subscribedAtMonthEnd(sub({ status: "TRIALING", trialEndsAt: new Date("2026-11-05T00:00:00Z") }), october)).toBe(false);
    expect(subscribedAtMonthEnd(sub({ createdAt: new Date("2026-11-02T00:00:00Z") }), october)).toBe(false);
  });

  it("désabonnée : plus de commission ; résiliée APRÈS la fin du mois : le mois compte encore", () => {
    expect(subscribedAtMonthEnd(sub({ status: "CANCELED", endedAt: new Date("2026-10-20T00:00:00Z") }), october)).toBe(false);
    expect(subscribedAtMonthEnd(sub({ status: "CANCELED", endedAt: null, canceledAt: null }), october)).toBe(false);
    expect(subscribedAtMonthEnd(sub({ status: "CANCELED", endedAt: new Date("2026-11-03T00:00:00Z") }), october)).toBe(true);
  });

  it("impayée, suspendue, en pause, incomplète : non (en cas de doute, rien)", () => {
    for (const status of ["PAST_DUE", "UNPAID", "SUSPENDED", "PAUSED", "INCOMPLETE", "INCOMPLETE_EXPIRED"]) {
      expect(subscribedAtMonthEnd(sub({ status }), october)).toBe(false);
    }
  });
});

describe("le montant", () => {
  it("10 % du tarif contractuel figé de la pharmacie (pas du catalogue)", () => {
    expect(monthlySubscriptionCents(sub())).toBe(12_600);
    expect(affiliateCommissionForMonth(sub(), october)).toBe(1_260);
  });

  it("sans tarif contractuel : le prix de son offre", () => {
    expect(affiliateCommissionForMonth(sub({ contractPriceCents: null }), october)).toBe(1_490);
  });

  it("la remise de parrainage reçue est déduite : 10 % de ce qui est réellement facturé, arrondi au centime", () => {
    // 126 € − 20 % (25,20 €) = 100,80 € → 10,08 €.
    expect(affiliateCommissionForMonth(sub({ referralDiscountCents: 2_520 }), october)).toBe(1_008);
    expect(monthlySubscriptionCents(sub({ referralDiscountCents: 50_000 }))).toBe(0);
    expect(affiliateCommissionForMonth(sub({ contractPriceCents: 12_345 }), october)).toBe(1_235);
  });

  it("pas abonnée : 0", () => {
    expect(affiliateCommissionForMonth(sub({ status: "CANCELED", endedAt: new Date("2026-10-02T00:00:00Z") }), october)).toBe(0);
    expect(affiliateCommissionForMonth(null, october)).toBe(0);
  });

  it("la phrase de la règle", () => {
    expect(AFFILIATE_RULE_SENTENCE.replace(/\s/g, " ")).toBe("10 % de l'abonnement de chaque pharmacie, chaque mois, à vie");
  });
});

describe("la mise en service réellement réglée (primes uniques)", () => {
  const paid = (iso: string, amountCents = 29_000 + 12_600) => ({ status: "PAID", paidAt: new Date(iso), amountCents });

  it("le premier paiement encaissé couvrant la mise en service", () => {
    expect(setupPaidAt(29_000, [paid("2026-11-03T10:00:00Z"), paid("2026-10-20T10:00:00Z")])?.toISOString()).toBe("2026-10-20T10:00:00.000Z");
  });

  it("rien tant qu'aucun paiement encaissé ne la couvre (échoué, en attente, montant trop faible)", () => {
    expect(setupPaidAt(29_000, [])).toBeNull();
    expect(setupPaidAt(29_000, [{ status: "FAILED", paidAt: null, amountCents: 41_600 }, { status: "OPEN", paidAt: null, amountCents: 41_600 }])).toBeNull();
    expect(setupPaidAt(29_000, [paid("2026-10-20T10:00:00Z", 12_600)])).toBeNull();
  });

  it("mise en service offerte ou inconnue : jamais réglée, donc aucune prime", () => {
    expect(setupPaidAt(0, [paid("2026-10-20T10:00:00Z")])).toBeNull();
    expect(setupPaidAt(null, [paid("2026-10-20T10:00:00Z")])).toBeNull();
  });

  it("aucune prime rétroactive : réglée avant le début du programme (18 oct. 2026), rien", () => {
    expect(signupBonusDue(29_000, [paid("2026-10-17T21:00:00Z")])).toBe(false);
    expect(signupBonusDue(29_000, [paid("2026-10-18T08:00:00Z")])).toBe(true);
    expect(AFFILIATION_PROGRAM_START.toISOString()).toBe("2026-10-17T22:00:00.000Z");
  });
});

describe("les simulateurs avec primes", () => {
  it("affilié : N × 100 € de primes d'arrivée, bornées au curseur", async () => {
    const { estimateAffiliateSignupBonuses } = await import("../simulator");
    expect(estimateAffiliateSignupBonuses(1)).toBe(10_000);
    expect(estimateAffiliateSignupBonuses(50)).toBe(500_000);
    expect(estimateAffiliateSignupBonuses(9999)).toBe(500 * 10_000);
  });

  it("directeur : 1 → 50 €, 2 → 100 €… jusqu'à 500 ; l'équipe touche N × 12,60 € par mois", async () => {
    const { estimateDirectorBonuses } = await import("../simulator");
    expect(estimateDirectorBonuses(1, 12_600)).toEqual({ pharmacies: 1, bonusCents: 5_000, teamPerMonthCents: 1_260 });
    expect(estimateDirectorBonuses(2, 12_600).bonusCents).toBe(10_000);
    expect(estimateDirectorBonuses(0, 12_600).pharmacies).toBe(1);
    expect(estimateDirectorBonuses(800, 12_600)).toEqual({ pharmacies: 500, bonusCents: 2_500_000, teamPerMonthCents: 630_000 });
  });
});
