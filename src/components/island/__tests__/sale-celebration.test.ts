import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { CounterIsland, type IslandAdvice } from "../counter-island";

/** « Chaque vente terminée où il y a eu un conseil vendu, à la fin le robot doit faire une petite animation » (fondateur, 14 oct. 2026). */

const ITEMS: IslandAdvice[] = [
  { name: "FLORE ÉQUILIBRE", price: "14,90 €", stock: "IN_STOCK" },
  { name: "SÉRUM PHYSIOLOGIQUE", price: "5,90 €", stock: "IN_STOCK" },
];

const render = (outcomes: ("SOLD" | "NOT_SOLD" | null)[]) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "done", outcomes },
      items: ITEMS,
      drug: "AMOXICILLINE",
      alert: null,
      pills: [],
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
    }),
  ).replaceAll("&#x27;", "'");

describe("la fête du robot à la fin d'une vente", () => {
  it("au moins un conseil vendu : le robot en blouse fête la vente, confettis et « Bravo ! »", () => {
    const html = render(["SOLD", "NOT_SOLD"]);
    expect(html).toContain("data-ile-fete");
    expect(html).toContain("isl-cheer");
    expect(html).toContain("isl-burst");
    expect(html).toContain("Bravo !");
    expect(html).toContain("1 conseil vendu · 14,90 €");
    expect(html).toContain('data-mood="celebrate"');
  });

  it("aucun conseil vendu : pas de fête, un merci sobre, jamais le mot « délivrance »", () => {
    const html = render(["NOT_SOLD", null]);
    expect(html).not.toContain("data-ile-fete");
    expect(html).not.toContain("Bravo !");
    expect(html).not.toContain('data-mood="celebrate"');
    expect(html).toContain("Merci, à la prochaine vente.");
    expect(html).not.toContain("délivrance");
  });
});
