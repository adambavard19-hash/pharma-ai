import { describe, expect, it } from "vitest";
import { indexFromPointer, labelStride, monotonePath, niceScale, splitRuns, xPercent, yPercent, type Point } from "../chart-math";

/**
 * La géométrie des graphiques : des graduations rondes, une courbe qui ne
 * dépasse jamais les valeurs réelles, des abscisses sans division par zéro.
 */

describe("niceScale", () => {
  it("un maximum de 10 conseils donne 0 · 5 · 10, jamais 0 · 3 · 6 · 9 · 12", () => {
    expect(niceScale(10, { integer: true })).toEqual({ max: 10, ticks: [0, 5, 10] });
  });

  it("un maximum de 3 conseils donne un pas de 1", () => {
    expect(niceScale(3, { integer: true })).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
  });

  it("en entier, 2,5 n'est jamais arrondi à 3 : on monte au pas rond suivant", () => {
    for (let max = 1; max <= 400; max += 1) {
      const { ticks } = niceScale(max, { integer: true });
      const step = ticks[1] - ticks[0];
      expect(Number.isInteger(step), `max ${max}`).toBe(true);
      // Un pas rond : 1, 2, 5, 10, 20, 25, 50, 100…
      expect([1, 2, 5].includes(step / 10 ** Math.floor(Math.log10(step))) || step === 25 || step === 250, `pas ${step} pour ${max}`).toBe(true);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it("un maximum de 100 garde le pas de 25 (0 · 25 · 50 · 75 · 100)", () => {
    expect(niceScale(100, { integer: true }).ticks).toEqual([0, 25, 50, 75, 100]);
  });

  it("des montants en centimes restent des centimes entiers", () => {
    const { max, ticks } = niceScale(28_700, { integer: true });
    expect(max).toBe(30_000);
    expect(ticks).toEqual([0, 10_000, 20_000, 30_000]);
  });

  it("sans entier, le pas 2,5 est permis (un taux, une moyenne)", () => {
    expect(niceScale(10).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it("un maximum nul, négatif ou illisible retombe sur la valeur de repli, jamais sur une boucle infinie", () => {
    expect(niceScale(0, { integer: true, fallbackMax: 4 }).ticks).toEqual([0, 1, 2, 3, 4]);
    expect(niceScale(-5, { fallbackMax: 4 }).max).toBeGreaterThanOrEqual(4);
    expect(niceScale(Number.NaN).ticks.length).toBeGreaterThan(1);
    expect(niceScale(Number.POSITIVE_INFINITY).ticks.length).toBeGreaterThan(1);
    expect(niceScale(1e-12).ticks.length).toBeGreaterThan(1);
  });

  it("le sommet couvre toujours le maximum", () => {
    for (const max of [1, 7, 8, 13, 99, 101, 1234, 987_654]) {
      expect(niceScale(max, { integer: true }).max).toBeGreaterThanOrEqual(max);
      expect(niceScale(max).max).toBeGreaterThanOrEqual(max);
    }
  });
});

describe("monotonePath", () => {
  /** Reconstitue les ordonnées des points de contrôle d'un tracé « M x y C … ». */
  const controlYs = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, index) => index % 2 === 1);

  it("ne descend jamais sous le point le plus bas ni ne monte au-dessus du plus haut", () => {
    const points: Point[] = [
      [0, 100],
      [20, 10],
      [40, 100],
      [60, 100],
      [80, 5],
      [100, 100],
    ];
    const ys = controlYs(monotonePath(points));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("vide, un point et deux points : pas d'exception, un tracé minimal", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([[10, 20]])).toBe("M 10 20");
    expect(monotonePath([[0, 100], [100, 0]])).toBe("M 0 100 L 100 0");
  });

  it("un plateau reste horizontal (aucune ondulation)", () => {
    const ys = controlYs(monotonePath([[0, 40], [50, 40], [100, 40]]));
    expect(new Set(ys)).toEqual(new Set([40]));
  });
});

describe("splitRuns", () => {
  it("un null coupe la courbe : il ne vaut jamais zéro", () => {
    expect(splitRuns([1, 2, null, 3, null, null, 4, 5])).toEqual([
      { from: 0, indices: [0, 1] },
      { from: 3, indices: [3] },
      { from: 6, indices: [6, 7] },
    ]);
  });

  it("des valeurs illisibles (NaN) coupent aussi, et une série vide ne donne rien", () => {
    expect(splitRuns([Number.NaN, 1])).toEqual([{ from: 1, indices: [1] }]);
    expect(splitRuns([])).toEqual([]);
    expect(splitRuns([null, null])).toEqual([]);
  });

  it("zéro est une vraie valeur", () => {
    expect(splitRuns([0, 0, 0])).toEqual([{ from: 0, indices: [0, 1, 2] }]);
  });
});

describe("repères", () => {
  it("indexFromPointer : le point le plus proche, borné à la série", () => {
    expect(indexFromPointer(100, 100, 400, 5)).toBe(0);
    expect(indexFromPointer(300, 100, 400, 5)).toBe(2);
    expect(indexFromPointer(500, 100, 400, 5)).toBe(4);
    expect(indexFromPointer(-50, 100, 400, 5)).toBe(0);
    expect(indexFromPointer(9999, 100, 400, 5)).toBe(4);
  });

  it("indexFromPointer : un seul point, une largeur nulle ou une série vide ne plantent pas", () => {
    expect(indexFromPointer(250, 100, 400, 1)).toBe(0);
    expect(indexFromPointer(250, 100, 0, 5)).toBe(0);
    expect(indexFromPointer(250, 100, 400, 0)).toBe(0);
  });

  it("xPercent : un point seul est centré, les extrémités touchent les bords", () => {
    expect(xPercent(0, 1)).toBe(50);
    expect(xPercent(0, 5)).toBe(0);
    expect(xPercent(4, 5)).toBe(100);
    expect(xPercent(1, 5)).toBe(25);
  });

  it("yPercent : zéro en bas, jamais hors du cadre, maximum nul sans division par zéro", () => {
    expect(yPercent(0, 10)).toBe(100);
    expect(yPercent(10, 10)).toBe(0);
    expect(yPercent(5, 10)).toBe(50);
    expect(yPercent(50, 10)).toBe(0);
    expect(yPercent(-3, 10)).toBe(100);
    expect(yPercent(3, 0)).toBe(100);
  });

  it("labelStride : une demi-douzaine d'étiquettes au plus", () => {
    expect(labelStride(5)).toBe(1);
    expect(labelStride(6)).toBe(1);
    expect(labelStride(7)).toBe(2);
    expect(labelStride(30)).toBe(5);
    expect(Math.ceil(30 / labelStride(30))).toBeLessThanOrEqual(6);
  });
});
