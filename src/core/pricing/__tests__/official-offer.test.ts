import { describe, expect, it } from "vitest";
import { OFFICIAL_OFFER, formatPriceEuros, pricingPlanGaps, referrerPriceCents, resolvePublicPricing, resolveStandardCommissionCents, STANDARD_COMMISSION_MAX_CENTS } from "../official-offer";

describe("l'offre officielle", () => {
  it("dit un seul abonnement : 126 € HT par mois, engagement 12 mois, mise en service unique de 290 € HT, parrainage à 20 %", () => {
    expect(OFFICIAL_OFFER).toMatchObject({ monthlyPriceCents: 12_600, setupFeeCents: 29_000, commitmentMonths: 12, referralDiscountPercent: 20, standardCommissionCents: 25_000 });
  });

  it("n'a plus de formule annuelle", () => {
    expect(Object.keys(OFFICIAL_OFFER)).not.toContain("annual");
    expect(Object.keys(resolvePublicPricing(null))).not.toContain("annual");
  });
});

describe("resolvePublicPricing", () => {
  const plan = { name: "Offre console", monthlyPriceCents: 13_900, setupFeeCents: 31_000 };

  it("sans offre publiée : l'offre officielle", () => {
    expect(resolvePublicPricing(null)).toEqual({ name: "PharmaBoost Officine", source: "OFFICIAL_DEFAULT", monthlyPriceCents: 12_600, setupFeeCents: 29_000, commitmentMonths: 12, referralDiscountPercent: 20 });
  });

  it("une offre COMPLÈTE de la console prime", () => {
    expect(resolvePublicPricing(plan)).toMatchObject({ source: "PLAN", name: "Offre console", monthlyPriceCents: 13_900, setupFeeCents: 31_000, commitmentMonths: 12 });
  });

  it("une offre incomplète ne se mélange jamais à l'officielle : l'officielle d'un bloc", () => {
    for (const partial of [{ ...plan, setupFeeCents: null }, { ...plan, monthlyPriceCents: 0 }]) {
      expect(resolvePublicPricing(partial)).toMatchObject({ source: "OFFICIAL_DEFAULT", monthlyPriceCents: 12_600, setupFeeCents: 29_000 });
    }
  });

  it("une mise en service à 0 est une mise en service OFFERTE, pas une valeur manquante", () => {
    expect(resolvePublicPricing({ ...plan, setupFeeCents: 0 })).toMatchObject({ source: "PLAN", setupFeeCents: 0 });
  });

  it("dit à l'administrateur pourquoi l'offre de la console n'est pas affichée", () => {
    expect(pricingPlanGaps(null)[0]).toContain("Aucune offre par défaut");
    expect(pricingPlanGaps({ ...plan, setupFeeCents: null })[0]).toContain("la mise en service");
    expect(pricingPlanGaps(plan)).toEqual([]);
  });
});

describe("le parrainage : 20 % de moins par mois", () => {
  it("126 € deviennent 100,80 € HT", () => {
    expect(referrerPriceCents(12_600)).toBe(10_080);
    expect(referrerPriceCents(12_600, 20)).toBe(10_080);
  });
  it("arrondit au centime", () => {
    expect(referrerPriceCents(9_999)).toBe(7_999);
  });
});

describe("la commission standard", () => {
  it("vaut 250 € sans réglage, et refuse une valeur absurde", () => {
    expect(resolveStandardCommissionCents(undefined)).toBe(25_000);
    expect(resolveStandardCommissionCents({ amountCents: 30_000 })).toBe(30_000);
    for (const bad of [{ amountCents: 0 }, { amountCents: -5 }, { amountCents: 12.5 }, { amountCents: STANDARD_COMMISSION_MAX_CENTS + 1 }, { amountCents: "250" }, "x", null]) {
      expect(resolveStandardCommissionCents(bad)).toBe(25_000);
    }
  });
});

describe("formatPriceEuros", () => {
  it("espaces insécables, virgule française, pas de décimales inutiles", () => {
    expect(formatPriceEuros(12_600)).toBe("126\u00a0€");
    expect(formatPriceEuros(29_000)).toBe("290\u00a0€");
    expect(formatPriceEuros(10_080)).toBe("100,80\u00a0€");
    expect(formatPriceEuros(500_000)).toBe("5\u00a0000\u00a0€");
  });
});
