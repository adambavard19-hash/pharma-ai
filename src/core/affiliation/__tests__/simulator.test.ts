import { describe, expect, it } from "vitest";
import { clampPharmacies, estimateAffiliateRevenue, SIMULATOR_DEFAULT_PHARMACIES, SIMULATOR_MAX_PHARMACIES } from "../simulator";
import { AFFILIATE_MAX_RATE_LABEL, AFFILIATE_RECURRING_RATE, AFFILIATE_TIERS, AFFILIATE_TIERS_RATES_LABEL, AFFILIATE_TIERS_SENTENCE, affiliateRateFor, affiliateTierFor, tierRangeLabel } from "../terms";

describe("les paliers d'affiliation", () => {
  it("1 à 9 : 10 % ; 10 à 24 : 12 % ; 25 à 49 : 15 % ; 50 et plus : 20 %", () => {
    expect(AFFILIATE_RECURRING_RATE).toBe(0.1);
    expect(AFFILIATE_TIERS.map((tier) => [tier.min, tier.max, tier.ratePercent])).toEqual([[1, 9, 10], [10, 24, 12], [25, 49, 15], [50, null, 20]]);
    for (const [count, rate] of [[1, 0.1], [9, 0.1], [10, 0.12], [24, 0.12], [25, 0.15], [49, 0.15], [50, 0.2], [500, 0.2], [100_000, 0.2]] as const) expect(affiliateRateFor(count)).toBe(rate);
  });

  it("0 pharmacie (ou une valeur illisible) : le taux de départ", () => {
    expect(affiliateRateFor(0)).toBe(AFFILIATE_RECURRING_RATE);
    expect(affiliateRateFor(-3)).toBe(AFFILIATE_RECURRING_RATE);
    expect(affiliateRateFor(Number.NaN)).toBe(AFFILIATE_RECURRING_RATE);
  });

  it("les libellés", () => {
    expect(AFFILIATE_MAX_RATE_LABEL).toBe("20 %");
    expect(AFFILIATE_TIERS_RATES_LABEL).toBe("10 %, 12 %, 15 % puis 20 %");
    expect(AFFILIATE_TIERS_SENTENCE).toBe("10 % de 1 à 9 pharmacies, 12 % de 10 à 24, 15 % de 25 à 49, 20 % à partir de 50");
    expect(tierRangeLabel(affiliateTierFor(3))).toBe("1 à 9 pharmacies");
    expect(tierRangeLabel(affiliateTierFor(60))).toBe("50 pharmacies et plus");
  });
});

describe("le simulateur de revenus de l'affiliation", () => {
  it("N pharmacies × abonnement mensuel HT × taux du palier atteint par N, appliqué à toutes", () => {
    expect(estimateAffiliateRevenue(5, 12_600)).toMatchObject({ ratePercent: 10, tierIndex: 0, perPharmacyCents: 1_260, perMonthCents: 6_300 });
    expect(estimateAffiliateRevenue(12, 12_600)).toMatchObject({ ratePercent: 12, tierIndex: 1, perPharmacyCents: 1_512, perMonthCents: 18_144 });
    expect(estimateAffiliateRevenue(30, 12_600)).toMatchObject({ ratePercent: 15, tierIndex: 2, perPharmacyCents: 1_890, perMonthCents: 56_700 });
    const r = estimateAffiliateRevenue(60, 12_600);
    expect(r).toMatchObject({ ratePercent: 20, tierIndex: 3, perPharmacyCents: 2_520, perMonthCents: 151_200 });
    expect(r.perYearCents).toBe(151_200 * 12);
  });

  it("plafond à 20 %, même au bout du curseur", () => {
    expect(estimateAffiliateRevenue(500, 12_600)).toMatchObject({ ratePercent: 20, perMonthCents: 500 * 2_520 });
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
