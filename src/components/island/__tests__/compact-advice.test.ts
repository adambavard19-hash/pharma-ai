import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { COMPACT_WIDTH, compactIndex, CounterIsland, type IslandAdvice } from "../counter-island";

/**
 * « La bannière prend trop de place quand elle affiche les conseils » (fondateur, 13 oct. 2026) : au poste, les conseils
 * arrivent en mode COMPACT — un à la fois, sur une ligne, qui passe tout seul au suivant une fois tranché — et le pharmacien
 * agrandit ou réduit la bannière d'un bouton.
 */

const ITEMS: IslandAdvice[] = [
  { name: "LACTIBIANE REFERENCE GELU BT30", price: "26,95 €", margin: "9,75 €", stock: "IN_STOCK", quantity: 52, reason: "Probiotique" },
  { name: "SÉRUM PHYSIOLOGIQUE 30 unidoses", price: "5,90 €", stock: "LOW_STOCK", quantity: 3 },
];

const render = (props: { compactAdvice?: boolean; outcomes?: ("SOLD" | "NOT_SOLD" | null)[] } = {}) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: props.outcomes ?? [null, null] },
      items: ITEMS,
      drug: "GASTROCYNESINE",
      alert: null,
      pills: [],
      compactAdvice: props.compactAdvice,
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
    }),
  ).replaceAll("&#x27;", "'");

describe("le mode compact des conseils (poste)", () => {
  it("un seul conseil à la fois, sur une ligne : nom, prix, marge et stock en petit, ✓ / ✕, et « 1/2 »", () => {
    const html = render({ compactAdvice: true });
    expect(html).toContain("LACTIBIANE REFERENCE GELU BT30");
    expect(html).not.toContain("SÉRUM PHYSIOLOGIQUE");
    expect(html).toContain("26,95 €");
    expect(html).toContain("Marge 9,75 € HT · En stock · 52");
    expect(html).toContain('aria-label="Vendu"');
    expect(html).toContain('aria-label="Non vendu"');
    expect(html).toContain("1/2");
    expect(html).toContain('aria-label="Agrandir la bannière"');
    expect(html).toContain(`min(${COMPACT_WIDTH}px`);
    // Ni liste, ni e-mail ; terminer reste possible sans tout trancher (petit bouton ✓ de l'en-tête).
    expect(html).not.toContain("Ajouter l'e-mail du patient");
    expect(html).toContain('aria-label="Terminer la vente"');
    expect(html).not.toContain("> Terminer la vente</button>");
  });

  it("tout tranché : « Tous traités » et le bouton de fin apparaît", () => {
    const html = render({ compactAdvice: true, outcomes: ["SOLD", "NOT_SOLD"] });
    expect(html).toContain("Tous traités");
    expect(html).toContain("Terminer la vente");
  });

  it("sans le mode compact (écran de vente), la liste complète, comme avant", () => {
    const html = render();
    expect(html).toContain("SÉRUM PHYSIOLOGIQUE");
    expect(html).not.toContain("Agrandir la bannière");
  });

  it("passe tout seul au premier conseil qui attend une réponse ; les flèches choisissent", () => {
    expect(compactIndex([null, null], 2, null)).toBe(0);
    expect(compactIndex(["SOLD", null], 2, null)).toBe(1);
    expect(compactIndex(["SOLD", "NOT_SOLD"], 2, null)).toBe(1);
    expect(compactIndex(["SOLD", null], 2, 0)).toBe(0);
    expect(compactIndex([null], 1, 5)).toBe(0);
  });
});
