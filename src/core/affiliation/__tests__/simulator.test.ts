import { describe, expect, it } from "vitest";
import { clampPharmacies, estimateAffiliateRevenue, SIMULATOR_DEFAULT_PHARMACIES, SIMULATOR_MAX_PHARMACIES } from "../simulator";
import { AFFILIATE_RECURRING_RATE } from "../terms";

describe("le simulateur de revenus de l'affiliation", () => {
  it("N pharmacies × abonnement mensuel HT × 10 %", () => {
    expect(AFFILIATE_RECURRING_RATE).toBe(0.1);
    const r = estimateAffiliateRevenue(50, 12_600);
    expect(r.perPharmacyCents).toBe(1_260);
    expect(r.perMonthCents).toBe(63_000);
    expect(r.perYearCents).toBe(756_000);
  });

  it("suit le prix de l'abonnement qu'on lui donne, arrondi au centime par pharmacie", () => {
    expect(estimateAffiliateRevenue(3, 9_999).perPharmacyCents).toBe(1_000);
    expect(estimateAffiliateRevenue(3, 9_999).perMonthCents).toBe(3_000);
  });

  it("zéro pharmacie, zéro revenu ; le curseur est borné de 0 à 500", () => {
    expect(estimateAffiliateRevenue(0, 12_600).perMonthCents).toBe(0);
    expect(clampPharmacies(-4)).toBe(0);
    expect(clampPharmacies(9_999)).toBe(SIMULATOR_MAX_PHARMACIES);
    expect(clampPharmacies(12.6)).toBe(13);
    expect(clampPharmacies(Number.NaN)).toBe(SIMULATOR_DEFAULT_PHARMACIES);
    expect(estimateAffiliateRevenue(10_000, 12_600).pharmacies).toBe(500);
  });
});
