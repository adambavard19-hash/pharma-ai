import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline, sparkGeometry } from "../sparkline";

/** La mini-courbe : une géométrie honnête (le zéro en bas) et un rendu lisible par un lecteur d'écran. */

const render = (props: Partial<Parameters<typeof Sparkline>[0]> = {}) =>
  renderToStaticMarkup(createElement(Sparkline, { values: [1, 3, 2, 8, 5], ariaLabel: "Évolution des conseils", ...props }));

/** Toutes les ordonnées écrites dans un tracé SVG. */
const ordinates = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, index) => index % 2 === 1);

describe("sparkGeometry", () => {
  it("le zéro est le bas de la courbe, le maximum le haut", () => {
    const { end, max, runs } = sparkGeometry([0, 5, 10]);
    expect(max).toBe(10);
    expect(runs).toHaveLength(1);
    expect(end).toEqual({ x: 100, y: 0 });
    expect(runs[0].line.startsWith("M 0 100")).toBe(true);
  });

  it("une petite variation autour d'une grande valeur reste plate : elle ne devient pas une montagne", () => {
    const { runs } = sparkGeometry([100, 101, 100, 102, 100]);
    const ys = ordinates(runs[0].line);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3);
  });

  it("une série de zéros est une ligne posée en bas, pas une courbe inventée", () => {
    const { runs, end, max } = sparkGeometry([0, 0, 0, 0]);
    expect(max).toBe(0);
    expect(new Set(ordinates(runs[0].line))).toEqual(new Set([100]));
    expect(end).toEqual({ x: 100, y: 100 });
  });

  it("la courbe ne sort jamais du cadre (0 à 100)", () => {
    const { runs } = sparkGeometry([0, 50, 0, 50, 0, 100, 0]);
    const ys = ordinates(runs[0].line);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("l'aire se referme sur la base", () => {
    const { runs } = sparkGeometry([1, 2, 3]);
    expect(runs[0].area.endsWith("L 100 100 L 0 100 Z")).toBe(true);
  });

  it("un seul point : pas de trait, un point final centré", () => {
    const { runs, end } = sparkGeometry([7]);
    expect(runs).toEqual([]);
    expect(end).toEqual({ x: 50, y: 0 });
  });

  it("une valeur illisible coupe la courbe, elle ne vaut jamais zéro", () => {
    const { runs, end } = sparkGeometry([1, 2, Number.NaN, 3, 4]);
    expect(runs).toHaveLength(2);
    expect(end?.x).toBe(100);
  });

  it("une série vide ne dessine rien", () => {
    expect(sparkGeometry([])).toEqual({ runs: [], end: null, max: 0 });
  });
});

describe("rendu", () => {
  it("une image nommée pour les lecteurs d'écran, avec un tracé, une aire et un point final", () => {
    const html = render();
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Évolution des conseils"');
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html).toContain('vector-effect="non-scaling-stroke"');
    expect(html).toContain("rounded-full");
  });

  it("le trait garde 2 px et l'aire n'est qu'un lavis léger", () => {
    const html = render();
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('fill-opacity="0.1"');
  });

  it("trois tons : marque (défaut), succès, neutre", () => {
    expect(render()).toContain("text-brand-600");
    expect(render({ tone: "success" })).toContain("text-success-600");
    expect(render({ tone: "neutral" })).toContain("text-text-tertiary");
    expect(render({ tone: "neutral" })).toContain('data-tone="neutral"');
  });

  it("les teintes du trait n'ont pas de variante « dark: » : lisibles sur carte claire comme sur fond sombre", () => {
    expect(render()).not.toContain("dark:");
  });

  it("des valeurs vides ne rendent rien (pas de cadre vide)", () => {
    expect(render({ values: [] })).toBe("");
  });

  it("le point final est positionné en pourcentage (il reste rond, quelle que soit la largeur)", () => {
    expect(render({ values: [0, 10] })).toContain("left:100%;top:0%");
  });
});
