import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { COLUMNS_WIDTH, COMPACT_WIDTH, compactIndex, CounterIsland, groupByDrug, type IslandAdvice } from "../counter-island";

/**
 * « La bannière prend trop de place quand elle affiche les conseils » (fondateur, 13 oct. 2026) : au poste, les conseils
 * arrivent en mode COMPACT — un à la fois, sur une ligne, qui passe tout seul au suivant une fois tranché — et le pharmacien
 * agrandit ou réduit la bannière d'un bouton.
 */

const ITEMS: IslandAdvice[] = [
  { name: "LACTIBIANE REFERENCE GELU BT30", price: "26,95 €", margin: "9,75 €", stock: "IN_STOCK", quantity: 52, reason: "Probiotique" },
  { name: "SÉRUM PHYSIOLOGIQUE 30 unidoses", price: "5,90 €", stock: "LOW_STOCK", quantity: 3 },
];

const render = (props: { compactAdvice?: boolean; outcomes?: ("SOLD" | "NOT_SOLD" | null)[]; items?: IslandAdvice[] } = {}) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: props.outcomes ?? [null, null] },
      items: props.items ?? ITEMS,
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
    expect(html).toContain("Marge 9,75 € HT");
    expect(html).toContain("En stock · 52");
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

describe("plusieurs boîtes scannées : la bannière se divise, un bloc par boîte", () => {
  const SALE: IslandAdvice[] = [
    { name: "NEOBIANACID CITRON CPR 70", drug: "GAVISCONELL MENTHE", price: "8,90 €", stock: "IN_STOCK", quantity: 10 },
    { name: "NEOBIANACID MENTHE B/45", drug: "GAVISCONELL MENTHE", price: "7,50 €", stock: "IN_STOCK", quantity: 4 },
    { name: "ZAP'X PEIGNE A/LENTE", drug: "PURESSENT POUXDOUX SHP", price: "6,90 €", stock: "IN_STOCK", quantity: 3 },
  ];

  it("regroupe par boîte, dans l'ordre d'arrivée", () => {
    expect(groupByDrug(SALE)).toEqual([
      { drug: "GAVISCONELL MENTHE", indexes: [0, 1] },
      { drug: "PURESSENT POUXDOUX SHP", indexes: [2] },
    ]);
  });

  it("compact : la bannière se divise en colonnes côte à côte — à gauche une boîte et ses conseils, à droite l'autre", () => {
    const html = render({ compactAdvice: true, items: SALE, outcomes: [null, null, null] });
    expect(html.match(/data-advice-group=""/g)).toHaveLength(2);
    // Un bloc par boîte, chacun à sa hauteur, sous la capsule du haut : trois blocs en tout.
    expect(html.match(/<section/g)).toHaveLength(3);
    expect(html).toContain("GAVISCONELL MENTHE");
    expect(html).toContain("PURESSENT POUXDOUX SHP");
    // Chaque colonne montre le ou les conseils de SA boîte : les deux Neobianacid à gauche, le peigne à droite.
    expect(html).toContain("NEOBIANACID CITRON CPR 70");
    expect(html).toContain("NEOBIANACID MENTHE B/45");
    expect(html).toContain("ZAP'X PEIGNE A/LENTE");
    expect(html.indexOf("NEOBIANACID MENTHE B/45")).toBeLessThan(html.indexOf("PURESSENT POUXDOUX SHP"));
    expect(html).toContain(`min(${COLUMNS_WIDTH[2]}px`);
    expect(html).toContain("2 boîtes");
  });

  it("agrandie : un intitulé « Pour : … » avant les conseils de chaque boîte", () => {
    const html = render({ items: SALE, outcomes: [null, null, null] });
    expect(html.match(/data-advice-group=""/g)).toHaveLength(2);
  });
});

describe("l'écran de l'e-mail du patient", () => {
  it("a un bouton pour en sortir : on ne dépend jamais du clavier (Échap) pour quitter", () => {
    const html = renderToStaticMarkup(
      createElement(CounterIsland, {
        state: { ...INITIAL_ISLAND, stage: "email", outcomes: [] },
        items: [],
        drug: "DOLIPRANE 1000 mg",
        alert: null,
        pills: [],
        onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
        onCloseEmail: vi.fn(),
      }),
    ).replaceAll("&#x27;", "'");
    expect(html).toContain('aria-label="Annuler l\'e-mail"');
  });
});
