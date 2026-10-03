import { describe, expect, it } from "vitest";
import { catalogDiffers, contractualPrice, initialContractPriceCents, mrrCents, validateContractPriceChange } from "../contract-price";

/**
 * Le parcours d'un tarif, de la signature à la modification explicite :
 * catalogue et tarif contractuel ne se confondent jamais.
 */
describe("tarif contractuel : de la souscription à la modification", () => {
  it("à la souscription, le tarif du contrat signé l'emporte sur le catalogue", () => {
    expect(initialContractPriceCents({ contractMonthlyPriceCents: 29_000, planMonthlyPriceCents: 34_900 })).toBe(29_000);
  });

  it("sans contrat (ou contrat sans montant exploitable), le catalogue du moment est figé", () => {
    expect(initialContractPriceCents({ contractMonthlyPriceCents: null, planMonthlyPriceCents: 34_900 })).toBe(34_900);
    expect(initialContractPriceCents({ planMonthlyPriceCents: 34_900 })).toBe(34_900);
    expect(initialContractPriceCents({ contractMonthlyPriceCents: 0, planMonthlyPriceCents: 34_900 })).toBe(34_900);
  });

  it("une hausse du catalogue ne change pas le prix d'un abonnement existant", () => {
    const subscription = { contractPriceCents: initialContractPriceCents({ contractMonthlyPriceCents: 29_000, planMonthlyPriceCents: 29_000 }) };
    const planToday = { monthlyPriceCents: 34_900 };
    expect(contractualPrice(subscription, planToday)).toEqual({ cents: 29_000, source: "CONTRACT" });
    expect(catalogDiffers(subscription, planToday)).toBe(true);
  });

  it("une fiche sans tarif figé lit le catalogue, et le dit", () => {
    expect(contractualPrice({ contractPriceCents: null }, { monthlyPriceCents: 34_900 })).toEqual({ cents: 34_900, source: "CATALOG_FALLBACK" });
    expect(catalogDiffers({ contractPriceCents: null }, { monthlyPriceCents: 34_900 })).toBe(false);
  });

  it("le MRR additionne les tarifs contractuels, pas le catalogue", () => {
    const rows = [
      { status: "ACTIVE", contractPriceCents: 29_000, planMonthlyPriceCents: 34_900, cancelAtPeriodEnd: false },
      { status: "PAST_DUE", contractPriceCents: null, planMonthlyPriceCents: 34_900, cancelAtPeriodEnd: false },
      { status: "ACTIVE", contractPriceCents: 25_000, planMonthlyPriceCents: 34_900, cancelAtPeriodEnd: true },
      { status: "TRIALING", contractPriceCents: 29_000, planMonthlyPriceCents: 34_900, cancelAtPeriodEnd: false },
    ];
    expect(mrrCents(rows)).toBe(29_000 + 34_900);
    expect(mrrCents(rows, { includeTrials: true })).toBe(29_000 + 34_900 + 29_000);
  });

  it("une modification exige un nouveau montant réel et un motif", () => {
    expect(validateContractPriceChange({ previousCents: 29_000, nextCents: 31_000, reason: "" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29_000, nextCents: 29_000, reason: "Avenant signé" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29_000, nextCents: 50, reason: "Avenant signé" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29_000, nextCents: 31_000, reason: "  Avenant   signé  " })).toEqual({ ok: true, reason: "Avenant signé" });
  });
});
