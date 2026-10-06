import { describe, expect, it } from "vitest";
import { computeRevenue, selectCountedLines } from "../revenue";
import type { AdviceOrigin, ConfirmedLineRow } from "../types";

const DAY = new Date("2026-10-06T09:30:00Z");

let seq = 0;
function line(overrides: Partial<ConfirmedLineRow> & { saleId?: string } = {}): ConfirmedLineRow {
  seq += 1;
  const unitPriceCents = overrides.unitPriceCents ?? 1000;
  const quantity = overrides.quantity ?? 1;
  return {
    saleId: `s${seq}`,
    saleCreatedAt: DAY,
    lineId: `l${seq}`,
    recommendationId: `r${seq}`,
    origin: "AI" as AdviceOrigin,
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    quantity,
    unitPriceCents,
    totalCents: unitPriceCents * quantity,
    vatRate: 20,
    ...overrides,
  };
}

describe("selectCountedLines", () => {
  it("garde les lignes de conseils IA et règle, écarte les ajouts manuels", () => {
    const ai = line({ origin: "AI" });
    const rule = line({ origin: "RULE" });
    const manual = line({ origin: "MANUAL" });
    expect(selectCountedLines([ai, manual, rule])).toEqual([ai, rule]);
  });

  it("accepte une liste vide", () => {
    expect(selectCountedLines([])).toEqual([]);
  });
});

describe("computeRevenue : le chiffre d'affaires attribué", () => {
  it("additionne le TTC des lignes au prix connu, en centimes entiers", () => {
    const lines = [line({ unitPriceCents: 1299 }), line({ unitPriceCents: 850, quantity: 2 }), line({ unitPriceCents: 4_999 })];
    const { revenue } = computeRevenue({ lines, previousLines: [] });
    expect(revenue.confirmedTtcCents.value).toBe(1299 + 1700 + 4999);
    expect(Number.isInteger(revenue.confirmedTtcCents.value)).toBe(true);
    expect(revenue.pricedLines).toBe(3);
    expect(revenue.unpricedLines).toBe(0);
  });

  it("exclut du CA une ligne au prix 0, mais la compte à part et dans les unités vendues", () => {
    const lines = [line({ unitPriceCents: 2000 }), line({ unitPriceCents: 0, quantity: 3 })];
    const out = computeRevenue({ lines, previousLines: [] });
    expect(out.revenue.confirmedTtcCents.value).toBe(2000);
    expect(out.revenue.pricedLines).toBe(1);
    expect(out.revenue.unpricedLines).toBe(1);
    expect(out.unpricedConfirmedLines).toBe(1);
    // l'unité sans prix a bien été vendue : elle figure dans les unités, jamais dans le CA
    expect(out.revenue.unitsSold).toBe(1 + 3);
  });

  it("une ligne au prix 0 dont le total est incohérent ne vaut jamais de CA", () => {
    const sneaky = line({ unitPriceCents: 0, totalCents: 5000 });
    const { revenue } = computeRevenue({ lines: [sneaky], previousLines: [] });
    expect(revenue.confirmedTtcCents.value).toBe(0);
    expect(revenue.unpricedLines).toBe(1);
  });

  it("un ticket de trois lignes est UNE vente, pas trois", () => {
    const ticket = "ticket-1";
    const lines = [
      line({ saleId: ticket, unitPriceCents: 1500 }),
      line({ saleId: ticket, unitPriceCents: 900 }),
      line({ saleId: ticket, unitPriceCents: 600 }),
    ];
    const { revenue } = computeRevenue({ lines, previousLines: [] });
    expect(revenue.confirmedSales.value).toBe(1);
    expect(revenue.pricedLines).toBe(3);
    expect(revenue.confirmedTtcCents.value).toBe(3000);
    expect(revenue.averageBasketCents).toBe(3000);
  });

  it("compte deux tickets distincts comme deux ventes", () => {
    const lines = [line({ saleId: "a", unitPriceCents: 1000 }), line({ saleId: "a", unitPriceCents: 1000 }), line({ saleId: "b", unitPriceCents: 3000 })];
    const { revenue } = computeRevenue({ lines, previousLines: [] });
    expect(revenue.confirmedSales.value).toBe(2);
    expect(revenue.confirmedTtcCents.value).toBe(5000);
    expect(revenue.averageBasketCents).toBe(2500);
  });

  it("un ticket qui ne contient qu'une ligne sans prix n'est pas une vente au prix connu", () => {
    const lines = [line({ saleId: "x", unitPriceCents: 0 }), line({ saleId: "y", unitPriceCents: 800 })];
    const { revenue } = computeRevenue({ lines, previousLines: [] });
    expect(revenue.confirmedSales.value).toBe(1);
    expect(revenue.averageBasketCents).toBe(800);
  });

  it("un ticket mêlant ligne au prix connu et ligne sans prix compte une fois, et seule la première fait du CA", () => {
    const lines = [line({ saleId: "m", unitPriceCents: 1200 }), line({ saleId: "m", unitPriceCents: 0 })];
    const out = computeRevenue({ lines, previousLines: [] });
    expect(out.revenue.confirmedSales.value).toBe(1);
    expect(out.revenue.confirmedTtcCents.value).toBe(1200);
    expect(out.revenue.unpricedLines).toBe(1);
  });

  it("exclut les lignes MANUAL du CA, des ventes et des unités, et les compte à part", () => {
    const lines = [line({ unitPriceCents: 1000 }), line({ origin: "MANUAL", unitPriceCents: 9000, quantity: 4 }), line({ origin: "MANUAL", unitPriceCents: 0 })];
    const out = computeRevenue({ lines, previousLines: [] });
    expect(out.manualExcludedLines).toBe(2);
    expect(out.revenue.confirmedTtcCents.value).toBe(1000);
    expect(out.revenue.confirmedSales.value).toBe(1);
    expect(out.revenue.unitsSold).toBe(1);
    expect(out.revenue.pricedLines).toBe(1);
    // une ligne manuelle sans prix n'est pas une ligne PharmaBoost sans prix
    expect(out.unpricedConfirmedLines).toBe(0);
  });

  it("un ticket composé uniquement de lignes manuelles ne compte pas comme une vente", () => {
    const { revenue, manualExcludedLines } = computeRevenue({
      lines: [line({ saleId: "z", origin: "MANUAL" }), line({ saleId: "z", origin: "MANUAL" })],
      previousLines: [],
    });
    expect(manualExcludedLines).toBe(2);
    expect(revenue.confirmedSales.value).toBe(0);
    expect(revenue.confirmedTtcCents.value).toBe(0);
  });

  it("les lignes manuelles de la période précédente n'entrent ni dans la comparaison ni dans les écarts", () => {
    const out = computeRevenue({ lines: [line({ unitPriceCents: 1000 })], previousLines: [line({ origin: "MANUAL", unitPriceCents: 5000 })] });
    expect(out.revenue.confirmedTtcCents.previous).toBe(0);
    expect(out.manualExcludedLines).toBe(0);
  });
});

describe("computeRevenue : panier moyen", () => {
  it("panier moyen = CA ÷ nombre de ventes, arrondi au centime", () => {
    const lines = [line({ saleId: "a", unitPriceCents: 1000 }), line({ saleId: "b", unitPriceCents: 1000 }), line({ saleId: "c", unitPriceCents: 1001 })];
    const { revenue } = computeRevenue({ lines, previousLines: [] });
    expect(revenue.confirmedTtcCents.value).toBe(3001);
    expect(revenue.averageBasketCents).toBe(1000); // 1000,33 → 1000
    expect(Number.isInteger(revenue.averageBasketCents as number)).toBe(true);
  });

  it("panier moyen null sans vente (jamais 0 €)", () => {
    expect(computeRevenue({ lines: [], previousLines: [] }).revenue.averageBasketCents).toBeNull();
    expect(computeRevenue({ lines: [line({ unitPriceCents: 0 })], previousLines: [] }).revenue.averageBasketCents).toBeNull();
    expect(computeRevenue({ lines: [line({ origin: "MANUAL" })], previousLines: [] }).revenue.averageBasketCents).toBeNull();
  });

  it("calcule aussi le panier moyen de la période précédente", () => {
    const { revenue } = computeRevenue({
      lines: [line({ saleId: "a", unitPriceCents: 3000 })],
      previousLines: [line({ saleId: "p1", unitPriceCents: 1000 }), line({ saleId: "p2", unitPriceCents: 2000 })],
    });
    expect(revenue.averageBasketCents).toBe(3000);
    expect(revenue.previousAverageBasketCents).toBe(1500);
  });

  it("panier précédent null quand la période précédente est vide", () => {
    const { revenue } = computeRevenue({ lines: [line({ unitPriceCents: 1000 })], previousLines: [] });
    expect(revenue.previousAverageBasketCents).toBeNull();
  });
});

describe("computeRevenue : deltas", () => {
  it("compare le CA et les ventes à la période précédente", () => {
    const { revenue } = computeRevenue({
      lines: [line({ saleId: "a", unitPriceCents: 15_000 }), line({ saleId: "b", unitPriceCents: 15_000 })],
      previousLines: [line({ saleId: "p", unitPriceCents: 20_000 })],
    });
    expect(revenue.confirmedTtcCents).toEqual({ value: 30_000, previous: 20_000, deltaPct: 50, trend: "up" });
    expect(revenue.confirmedSales).toEqual({ value: 2, previous: 1, deltaPct: 100, trend: "up" });
  });

  it("précédent = 0 : aucun pourcentage, tendance « up »", () => {
    const { revenue } = computeRevenue({ lines: [line({ unitPriceCents: 4000 })], previousLines: [] });
    expect(revenue.confirmedTtcCents).toEqual({ value: 4000, previous: 0, deltaPct: null, trend: "up" });
    expect(revenue.confirmedSales).toEqual({ value: 1, previous: 0, deltaPct: null, trend: "up" });
  });

  it("les deux périodes vides : « none »", () => {
    const { revenue } = computeRevenue({ lines: [], previousLines: [] });
    expect(revenue.confirmedTtcCents).toEqual({ value: 0, previous: 0, deltaPct: null, trend: "none" });
    expect(revenue.confirmedSales).toEqual({ value: 0, previous: 0, deltaPct: null, trend: "none" });
    expect(revenue.unitsSold).toBe(0);
  });

  it("des lignes sans prix seulement : zéro CA mais des lignes sans prix signalées", () => {
    const out = computeRevenue({ lines: [line({ unitPriceCents: 0 }), line({ unitPriceCents: 0 })], previousLines: [] });
    expect(out.revenue.confirmedTtcCents.value).toBe(0);
    expect(out.revenue.confirmedSales.value).toBe(0);
    expect(out.revenue.unpricedLines).toBe(2);
    expect(out.unpricedConfirmedLines).toBe(2);
  });

  it("une baisse à zéro est une baisse de 100 %", () => {
    const { revenue } = computeRevenue({ lines: [], previousLines: [line({ unitPriceCents: 5000 })] });
    expect(revenue.confirmedTtcCents).toEqual({ value: 0, previous: 5000, deltaPct: -100, trend: "down" });
  });

  it("les lignes sans prix de la période précédente ne comptent pas dans son CA", () => {
    const { revenue } = computeRevenue({ lines: [line({ unitPriceCents: 1000 })], previousLines: [line({ unitPriceCents: 0 })] });
    expect(revenue.confirmedTtcCents.previous).toBe(0);
    expect(revenue.confirmedTtcCents.deltaPct).toBeNull();
  });
});
