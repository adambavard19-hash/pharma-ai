import { describe, expect, it } from "vitest";
import { metric, rateMetric, ratio } from "../metrics";

describe("metric : un nombre face à sa période précédente", () => {
  it("calcule la variation en pourcentage, arrondie à 0,1", () => {
    expect(metric(150, 100)).toEqual({ value: 150, previous: 100, deltaPct: 50, trend: "up" });
    expect(metric(50, 100)).toEqual({ value: 50, previous: 100, deltaPct: -50, trend: "down" });
    expect(metric(100, 300)).toEqual({ value: 100, previous: 300, deltaPct: -66.7, trend: "down" });
    expect(metric(7, 3)).toEqual({ value: 7, previous: 3, deltaPct: 133.3, trend: "up" });
  });

  it("n'invente aucun pourcentage quand la période précédente vaut 0", () => {
    expect(metric(12, 0)).toEqual({ value: 12, previous: 0, deltaPct: null, trend: "up" });
  });

  it("dit « none » quand les deux périodes sont vides", () => {
    expect(metric(0, 0)).toEqual({ value: 0, previous: 0, deltaPct: null, trend: "none" });
  });

  it("une période courante vide face à une période précédente pleine est une baisse de 100 %", () => {
    expect(metric(0, 40)).toEqual({ value: 0, previous: 40, deltaPct: -100, trend: "down" });
  });

  it("valeurs égales : variation nulle et tendance « flat » (jamais −0)", () => {
    const m = metric(42, 42);
    expect(m).toEqual({ value: 42, previous: 42, deltaPct: 0, trend: "flat" });
    expect(Object.is(m.deltaPct, -0)).toBe(false);
  });

  it("une variation invisible à 0,1 % près est « flat »", () => {
    expect(metric(100001, 100000)).toMatchObject({ deltaPct: 0, trend: "flat" });
    expect(metric(99999, 100000)).toMatchObject({ deltaPct: 0, trend: "flat" });
    expect(Object.is(metric(99999, 100000).deltaPct, -0)).toBe(false);
  });

  it("garde les centimes tels quels : aucune valeur n'est arrondie, seul le pourcentage l'est", () => {
    const m = metric(28_734, 19_999);
    expect(m.value).toBe(28_734);
    expect(m.previous).toBe(19_999);
    expect(m.deltaPct).toBe(43.7);
  });

  it("l'arrondi est symétrique autour de zéro", () => {
    // +12,25 % → 12,3 ; −12,25 % → −12,3 (pas de biais vers le haut)
    expect(metric(1122.5, 1000).deltaPct).toBe(12.3);
    expect(metric(877.5, 1000).deltaPct).toBe(-12.3);
  });

  it("ne propage jamais NaN ni Infinity", () => {
    expect(metric(Number.NaN, 10)).toMatchObject({ value: 0, deltaPct: -100 });
    expect(metric(10, Number.NaN)).toMatchObject({ previous: 0, deltaPct: null, trend: "up" });
    expect(metric(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toEqual({ value: 0, previous: 0, deltaPct: null, trend: "none" });
  });
});

describe("rateMetric : un taux face au taux précédent", () => {
  it("donne l'écart en points de pourcentage, arrondi à 0,1", () => {
    expect(rateMetric(0.5, 0.45)).toEqual({ value: 0.5, previous: 0.45, deltaPoints: 5, trend: "up" });
    expect(rateMetric(0.62, 0.7)).toEqual({ value: 0.62, previous: 0.7, deltaPoints: -8, trend: "down" });
    expect(rateMetric(0.6234, 0.5)).toMatchObject({ deltaPoints: 12.3, trend: "up" });
  });

  it("est « flat » sous 0,5 point et « up/down » à partir de 0,5 point", () => {
    expect(rateMetric(0.452, 0.45)).toMatchObject({ deltaPoints: 0.2, trend: "flat" });
    expect(rateMetric(0.448, 0.45)).toMatchObject({ deltaPoints: -0.2, trend: "flat" });
    expect(rateMetric(0.45, 0.45)).toMatchObject({ deltaPoints: 0, trend: "flat" });
    expect(rateMetric(0.455, 0.45)).toMatchObject({ deltaPoints: 0.5, trend: "up" });
    expect(rateMetric(0.445, 0.45)).toMatchObject({ deltaPoints: -0.5, trend: "down" });
  });

  it("ne renvoie jamais −0", () => {
    expect(Object.is(rateMetric(0.45, 0.45).deltaPoints, -0)).toBe(false);
    expect(Object.is(rateMetric(0.4500001, 0.45).deltaPoints, 0)).toBe(true);
  });

  it("est « none » dès que l'un des deux taux est inconnu", () => {
    expect(rateMetric(null, 0.4)).toEqual({ value: null, previous: 0.4, deltaPoints: null, trend: "none" });
    expect(rateMetric(0.4, null)).toEqual({ value: 0.4, previous: null, deltaPoints: null, trend: "none" });
    expect(rateMetric(null, null)).toEqual({ value: null, previous: null, deltaPoints: null, trend: "none" });
  });

  it("un taux de 0 % est un vrai taux, pas un taux inconnu", () => {
    expect(rateMetric(0, 0.3)).toEqual({ value: 0, previous: 0.3, deltaPoints: -30, trend: "down" });
    expect(rateMetric(0.3, 0)).toEqual({ value: 0.3, previous: 0, deltaPoints: 30, trend: "up" });
    expect(rateMetric(0, 0)).toMatchObject({ deltaPoints: 0, trend: "flat" });
  });

  it("ne produit pas de traîne de virgule flottante", () => {
    expect(rateMetric(0.3, 0.2).deltaPoints).toBe(10);
    expect(rateMetric(0.55, 0.5).deltaPoints).toBe(5);
    expect(rateMetric(0.7, 0.6).deltaPoints).toBe(10);
  });
});

describe("ratio : une division honnête", () => {
  it("divise", () => {
    expect(ratio(21, 34)).toBeCloseTo(0.6176, 4);
    expect(ratio(0, 12)).toBe(0);
    expect(ratio(5, 5)).toBe(1);
  });

  it("renvoie null quand le dénominateur est 0 ou négatif", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(5, -2)).toBeNull();
  });

  it("renvoie null sur une valeur qui n'est pas un nombre", () => {
    expect(ratio(Number.NaN, 4)).toBeNull();
    expect(ratio(4, Number.NaN)).toBeNull();
    expect(ratio(4, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
