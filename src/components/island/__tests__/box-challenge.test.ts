import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { rewardShortLabel } from "@/core/challenges/terms";
import { CounterIsland, type IslandAdvice } from "../counter-island";

/** « Le pharmacien qui vend la boîte d'Olioseptil doit savoir dès le début qu'il y a un challenge » (fondateur, 15 oct. 2026). */

const BOX = { id: "l1", name: "OLIOSEPTIL INHALATION CAPS 15", challenge: "Olioseptil 3ème trimestre", reward: "1 € par boîte dès 200 boîtes vendues" };
const render = (items: IslandAdvice[], boxes = [BOX]) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: items.map(() => null) },
      items,
      drug: BOX.name,
      alert: null,
      pills: [],
      compactAdvice: true,
      boxes,
      onRemoveBox: vi.fn(),
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
    }),
  );

describe("une boîte scannée en challenge", () => {
  it("sans conseil : la bannière s'ouvre quand même, le challenge en doré avec sa récompense", () => {
    const html = render([]);
    expect(html).toContain("data-ile-challenge-seul");
    expect(html).toContain("Produit en challenge");
    expect(html).toContain("Olioseptil 3ème trimestre");
    expect(html).toContain("1 € par boîte dès 200 boîtes vendues");
  });

  it("avec un conseil : le challenge sous le nom de la boîte", () => {
    const html = render([{ name: "MOUCHOIRS", price: "2,50 €", stock: "IN_STOCK", drug: BOX.name }]);
    expect(html).toContain("data-ile-challenge");
    expect(html).toContain("Olioseptil 3ème trimestre");
  });

  it("la récompense dite en quelques mots", () => {
    // L'objectif de boîtes ne regarde que le titulaire et son commercial (fondateur, 21 oct. 2026).
    expect(rewardShortLabel({ bonusPerUnitCents: 100, targetUnits: 200, tiers: null })).toBe("1 € par boîte");
    expect(rewardShortLabel({ bonusPerUnitCents: 150, targetUnits: null, tiers: null })).toBe("1,50 € par boîte");
    expect(rewardShortLabel({ bonusPerUnitCents: null, targetUnits: 50, tiers: null })).toBe("");
    expect(rewardShortLabel({ bonusPerUnitCents: null, targetUnits: null, tiers: [{ units: 100, bonusCents: 5000 }] })).toBe("Prime à la clé");
  });
});
