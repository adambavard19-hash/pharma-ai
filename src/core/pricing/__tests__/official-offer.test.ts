import { describe, expect, it } from "vitest";
import { OFFICIAL_OFFER, formatPriceEuros, formulaQuery, parseFormula, pricingPlanGaps, resolvePublicPricing, resolveStandardCommissionCents, STANDARD_COMMISSION_MAX_CENTS } from "../official-offer";

describe("l'offre officielle", () => {
  it("dit 99 € HT par mois avec 390 € de mise en service, et 1 188 € HT par an avec mise en service offerte", () => {
    expect(OFFICIAL_OFFER.monthly).toEqual({ priceCents: 9_900, setupFeeCents: 39_000 });
    expect(OFFICIAL_OFFER.annual).toEqual({ priceCents: 118_800, setupFeeCents: 0, commitmentMonths: 12 });
    expect(OFFICIAL_OFFER.standardCommissionCents).toBe(25_000);
  });

  it("l'annuel coûte autant que douze mois : l'avantage est la mise en service offerte, pas un prix inventé", () => {
    const pricing = resolvePublicPricing(null);
    expect(pricing.annual.priceCents).toBe(pricing.monthly.priceCents * 12);
    expect(pricing.annual.monthlyEquivalentCents).toBe(9_900);
    expect(pricing.monthly.setupFeeCents - pricing.annual.setupFeeCents).toBe(39_000);
  });
});

describe("resolvePublicPricing", () => {
  const plan = { name: "Offre console", monthlyPriceCents: 10_900, annualPriceCents: 130_800, setupFeeCents: 45_000, annualSetupFeeCents: 0 };

  it("sans offre publiée : l'offre officielle", () => {
    expect(resolvePublicPricing(null)).toMatchObject({ source: "OFFICIAL_DEFAULT", name: "PharmaBoost Officine", monthly: { priceCents: 9_900 } });
  });

  it("une offre COMPLÈTE de la console prime", () => {
    const pricing = resolvePublicPricing(plan);
    expect(pricing.source).toBe("PLAN");
    expect(pricing.monthly).toEqual({ priceCents: 10_900, setupFeeCents: 45_000 });
    expect(pricing.annual.priceCents).toBe(130_800);
    expect(pricing.annual.setupFeeCents).toBe(0);
  });

  it("une offre incomplète ne se mélange jamais à l'officielle : l'officielle d'un bloc", () => {
    for (const partial of [{ ...plan, annualPriceCents: null }, { ...plan, setupFeeCents: null }, { ...plan, annualSetupFeeCents: null }, { ...plan, monthlyPriceCents: 0 }]) {
      const pricing = resolvePublicPricing(partial);
      expect(pricing.source).toBe("OFFICIAL_DEFAULT");
      expect(pricing.monthly).toEqual(OFFICIAL_OFFER.monthly);
    }
  });

  it("une mise en service annuelle à 0 est une mise en service OFFERTE, pas une valeur manquante", () => {
    expect(resolvePublicPricing({ ...plan, annualSetupFeeCents: 0 }).source).toBe("PLAN");
  });

  it("dit à l'administrateur pourquoi l'offre de la console n'est pas affichée", () => {
    expect(pricingPlanGaps(null)[0]).toContain("Aucune offre par défaut");
    expect(pricingPlanGaps({ ...plan, annualPriceCents: null })[0]).toContain("le prix annuel");
    expect(pricingPlanGaps(plan)).toEqual([]);
  });
});

describe("la formule dans l'adresse du site", () => {
  it("se lit en français et en anglais, et refuse le reste", () => {
    expect(parseFormula("annuelle")).toBe("ANNUAL");
    expect(parseFormula(" MENSUELLE ")).toBe("MONTHLY");
    expect(parseFormula("annual")).toBe("ANNUAL");
    expect(parseFormula("trimestrielle")).toBeNull();
    expect(parseFormula(undefined)).toBeNull();
    expect(formulaQuery("ANNUAL")).toBe("annuelle");
    expect(formulaQuery("MONTHLY")).toBe("mensuelle");
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
    expect(formatPriceEuros(9_900)).toBe("99 €");
    expect(formatPriceEuros(118_800)).toBe("1 188 €");
    expect(formatPriceEuros(39_000)).toBe("390 €");
    expect(formatPriceEuros(1_250)).toBe("12,50 €");
  });
});
