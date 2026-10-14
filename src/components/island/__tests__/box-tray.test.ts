import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { removeBoxWord } from "@/core/poste/island-bridge";
import { CounterIsland, type IslandAdvice } from "../counter-island";

/** « On doit pouvoir retirer un médicament de la bannière » (fondateur, 14 oct. 2026) : chaque boîte de la vente a son ✕. */

const ITEMS: IslandAdvice[] = [{ name: "ULTRA-LEVURE 200 mg", price: "8,90 €", stock: "IN_STOCK", drug: "AMOXICILLINE 1 g" }];
const BOXES = [{ id: "ligne-1", name: "AMOXICILLINE 1 g" }, { id: "ligne-2", name: "DOLIPRANE 1000 mg" }];

const render = (boxes?: typeof BOXES) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: [null] },
      items: ITEMS,
      drug: "AMOXICILLINE 1 g",
      alert: null,
      pills: [],
      compactAdvice: true,
      boxes,
      onRemoveBox: vi.fn(),
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
    }),
  );

describe("retirer une boîte de la bannière", () => {
  it("chaque boîte de la vente s'affiche avec son bouton « Retirer », même celle qui n'a pas de conseil", () => {
    const html = render(BOXES);
    expect(html).toContain("data-ile-boites");
    expect(html).toContain('aria-label="Retirer AMOXICILLINE 1 g de la vente"');
    expect(html).toContain('aria-label="Retirer DOLIPRANE 1000 mg de la vente"');
  });

  it("sans liste de boîtes (poste pas encore à jour) : pas de bouton", () => {
    expect(render(undefined)).not.toContain("data-ile-boites");
  });

  it("le mot envoyé au poste : « RETIRER <vente> <boîte> », jamais avec un identifiant douteux", () => {
    expect(removeBoxWord("vente1", "ligne-1")).toBe("RETIRER vente1 ligne-1");
    expect(removeBoxWord("vente1", "ligne 1; rm")).toBeNull();
  });
});
