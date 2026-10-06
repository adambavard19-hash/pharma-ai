import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Metric, RateMetric } from "@/core/performance/types";
import { DeltaBadge, DeltaChip } from "../delta-chip";

/** La pastille de variation : flèche + couleur + mots, et jamais de pourcentage sur une base nulle. */

const metric = (overrides: Partial<Metric> = {}): Metric => ({ value: 12, previous: 10, deltaPct: 20, trend: "up", ...overrides });
const rate = (overrides: Partial<RateMetric> = {}): RateMetric => ({ value: 0.6, previous: 0.5, deltaPoints: 10, trend: "up", ...overrides });
const chip = (props: Parameters<typeof DeltaChip>[0]) => renderToStaticMarkup(createElement(DeltaChip, props));

describe("DeltaChip", () => {
  it("un nombre en hausse : vert, flèche, texte et phrase lue", () => {
    const html = chip({ metric: metric(), comparison: "vs hier" });
    expect(html).toContain('data-trend="up"');
    expect(html).toContain("success");
    expect(html).toContain("+20 %");
    expect(html).toContain("En hausse de 20 % vs hier");
    expect(html).toContain("<svg");
  });

  it("un nombre en baisse : rouge", () => {
    const html = chip({ metric: metric({ value: 5, deltaPct: -50, trend: "down" }) });
    expect(html).toContain('data-trend="down"');
    expect(html).toContain("danger");
    expect(html).toContain("−50 %");
  });

  it("une base nulle : « Nouveau » (marque) ou « — » (gris), jamais un pourcentage", () => {
    const fresh = chip({ metric: metric({ previous: 0, deltaPct: null }) });
    expect(fresh).toContain('data-trend="new"');
    expect(fresh).toContain("Nouveau");
    expect(fresh).not.toContain("%");
    const none = chip({ metric: metric({ value: 0, previous: 0, deltaPct: null, trend: "none" }) });
    expect(none).toContain('data-trend="none"');
    expect(none).toContain("—");
  });

  it("un taux : en points, au singulier sous 2 pour la voix", () => {
    expect(chip({ rate: rate({ deltaPoints: 5 }) })).toContain("+5 pts");
    expect(chip({ rate: rate({ deltaPoints: 1 }) })).toContain("En hausse de 1 point<");
    expect(chip({ rate: rate({ deltaPoints: -1.5, trend: "down" }) })).toContain("En baisse de 1,5 point<");
    expect(chip({ rate: rate({ deltaPoints: -4, trend: "down" }) })).toContain("En baisse de 4 points<");
  });

  it("la couleur n'est jamais seule : le texte de la pastille est caché à la voix au profit de la phrase complète", () => {
    const html = chip({ metric: metric() });
    expect(html).toContain('aria-hidden="true">+20 %');
    expect(html).toContain('class="sr-only">En hausse de 20 %');
  });

  it("sans nombre ni taux, rien", () => {
    expect(chip({})).toBe("");
  });

  it("la comparaison s'écrit à côté, cachée à la voix (elle est déjà dans la phrase lue)", () => {
    const html = chip({ metric: metric(), comparison: "vs les 7 jours d'avant" });
    expect(html).toContain('aria-hidden="true">vs les 7 jours d&#x27;avant');
  });
});

describe("DeltaChip : pas de redite ni de double tiret", () => {
  /** Ce qui s'affiche (les éléments cachés aux lecteurs d'écran) et ce qui se lit (le reste), sans balisage. */
  const unescape = (value: string) => value.replace(/&#x27;/g, "'");
  const visible = (html: string) => [...html.matchAll(/<span (?:class="[^"]*" )?aria-hidden="true">([^<]*)<\/span>/g)].map((match) => unescape(match[1]));
  const spoken = (html: string) => unescape(/<span class="sr-only">([^<]*)<\/span>/.exec(html)?.[1] ?? "");

  it("« Nouveau : rien sur la période précédente » n'est pas suivi de « vs la période précédente »", () => {
    const html = chip({ metric: metric({ previous: 0, deltaPct: null }), comparison: "vs la période précédente" });
    expect(spoken(html)).toBe("Nouveau : rien sur la période précédente");
    // La comparaison reste écrite à côté de la pastille, pour l'œil.
    expect(visible(html)).toContain("vs la période précédente");
  });

  it("même chose avec « vs hier » : la phrase dit déjà « période précédente », on n'ajoute rien", () => {
    const html = chip({ metric: metric({ value: 0, previous: 0, deltaPct: null, trend: "none" }), comparison: "vs hier" });
    expect(spoken(html)).toBe("Pas de comparaison possible : rien sur la période précédente");
    expect(spoken(html)).not.toContain("vs hier");
  });

  it("une vraie variation garde sa comparaison dans la phrase lue", () => {
    expect(spoken(chip({ metric: metric(), comparison: "vs hier" }))).toBe("En hausse de 20 % vs hier");
    expect(spoken(chip({ rate: rate({ deltaPoints: 5 }), comparison: "vs les 7 jours d'avant" }))).toBe("En hausse de 5 points vs les 7 jours d'avant");
    expect(spoken(chip({ metric: metric({ deltaPct: 0.1, trend: "flat" }), comparison: "vs hier" }))).toBe("Stable vs hier");
  });

  it("la pastille « aucune variation » n'a qu'un seul tiret : pas d'icône à côté du texte « — »", () => {
    const html = chip({ metric: metric({ value: 0, previous: 0, deltaPct: null, trend: "none" }) });
    expect(html).toContain('data-trend="none"');
    expect(html).not.toContain("<svg");
    expect(visible(html)).toEqual(["—"]);
    expect(html.match(/—/g)).toHaveLength(1);
  });

  it("les autres pastilles gardent leur flèche (hausse, baisse, nouveau, stable)", () => {
    expect(chip({ metric: metric() })).toContain("<svg");
    expect(chip({ metric: metric({ value: 5, deltaPct: -50, trend: "down" }) })).toContain("<svg");
    expect(chip({ metric: metric({ previous: 0, deltaPct: null }) })).toContain("<svg");
    expect(chip({ metric: metric({ deltaPct: 0.1, trend: "flat" }) })).toContain("<svg");
  });
});

describe("DeltaBadge", () => {
  it("rend une variation déjà décrite", () => {
    const html = renderToStaticMarkup(createElement(DeltaBadge, { view: { tone: "flat", text: "Stable", spoken: "Stable" } }));
    expect(html).toContain('data-trend="flat"');
    expect(html).toContain("Stable");
  });
});
