import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UniverseRow } from "@/core/performance/types";
import { allElements, mount, nativeButton } from "./hooks-u2";

/**
 * Les barres par univers : la bascule chiffre d'affaires / conseils acceptés,
 * l'ordre, les largeurs, et les états vides. Sans navigateur : on rend l'arbre,
 * on « clique » sur le bouton, on rend à nouveau.
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks-u2");
  return { ...actual, useState: hooks.useState };
});

const { UniverseBars } = await import("../universe-bars");

const row = (overrides: Partial<UniverseRow> & Pick<UniverseRow, "category" | "label">): UniverseRow => ({
  proposed: 0,
  accepted: 0,
  purchased: 0,
  revenueTtcCents: 0,
  acceptanceRate: null,
  ...overrides,
});

const UNIVERSES: UniverseRow[] = [
  row({ category: "DERMATOLOGIE", label: "Dermatologie", proposed: 20, accepted: 14, purchased: 6, revenueTtcCents: 18900, acceptanceRate: 0.7 }),
  row({ category: "VITAMINES", label: "Vitamines", proposed: 30, accepted: 12, purchased: 5, revenueTtcCents: 9500, acceptanceRate: 0.4 }),
  row({ category: "MEDICAMENT", label: "Médicaments conseil", proposed: 10, accepted: 9, purchased: 0, revenueTtcCents: 0, acceptanceRate: 0.9 }),
  row({ category: "HYGIENE", label: "Hygiène", proposed: 5, accepted: 1, purchased: 0, revenueTtcCents: 0, acceptanceRate: 0.2 }),
];

const html = (tree: ReactNode) =>
  renderToStaticMarkup(tree as ReactElement)
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ");
const plain = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** Les libellés d'univers dans l'ordre d'affichage. */
const order = (markup: string) => [...markup.matchAll(/<span class="min-w-0 truncate[^"]*" title="([^"]*)">/g)].map((match) => match[1]);
const widths = (markup: string) => [...markup.matchAll(/style="width:([\d.]+)%"/g)].map((match) => Number(match[1]));
const pressed = (tree: ReactNode, label: string) => nativeButton(tree, label).props["aria-pressed"];

describe("les barres par univers : le chiffre d'affaires d'abord", () => {
  const view = mount(UniverseBars, { universes: UNIVERSES });
  const tree = view.render();
  const markup = html(tree);

  it("s'ouvre sur le chiffre d'affaires quand il y en a, et le dit sur le bouton enfoncé", () => {
    expect(pressed(tree, "Chiffre d'affaires")).toBe(true);
    expect(pressed(tree, "Conseils acceptés")).toBe(false);
    expect(markup).toContain('role="group"');
  });

  it("classe du plus gros chiffre d'affaires au plus petit, avec le montant exact", () => {
    expect(order(markup)).toEqual(["Dermatologie", "Vitamines"]);
    const text = plain(markup);
    expect(text).toContain("Dermatologie 189,00 €");
    expect(text).toContain("Vitamines 95,00 €");
  });

  it("règle la largeur des barres sur la plus grande : 100 %, puis 9 500 ÷ 18 900 = 50,3 %", () => {
    expect(widths(markup)).toEqual([100, 50.3]);
  });

  it("ne dessine pas les univers sans chiffre d'affaires", () => {
    expect(markup).not.toContain("Hygiène");
    expect(markup).not.toContain("Médicaments conseil");
  });

  it("dit de quelle date le chiffre d'affaires est compté", () => {
    expect(plain(markup)).toContain("Chiffre d'affaires TTC des ventes confirmées, compté à la date de la vente.");
  });

  it("ne parle pas du taux là où aucun taux n'est écrit (sous les barres de chiffre d'affaires)", () => {
    expect(plain(markup)).not.toContain("ne comptent pas dans le taux");
    expect(plain(markup)).not.toContain("taux d'acceptation");
  });
});

describe("les barres par univers : la bascule", () => {
  it("passe aux conseils acceptés : nouvel ordre, nouvelles largeurs, taux et note honnête", () => {
    const view = mount(UniverseBars, { universes: UNIVERSES });
    const first = view.render();
    (nativeButton(first, "Conseils acceptés").props.onClick as () => void)();
    const tree = view.render();
    const markup = html(tree);
    const text = plain(markup);

    expect(pressed(tree, "Conseils acceptés")).toBe(true);
    expect(pressed(tree, "Chiffre d'affaires")).toBe(false);
    expect(order(markup)).toEqual(["Dermatologie", "Vitamines", "Médicaments conseil", "Hygiène"]);
    expect(widths(markup)).toEqual([100, 85.7, 64.3, 7.1]); // 14, 12, 9, 1 sur 14
    expect(text).toContain("Dermatologie 14");
    expect(text).toContain("20 conseils proposés · taux d'acceptation 70 %");
    expect(text).toContain("5 conseils proposés · taux d'acceptation 20 %");
    expect(text).toContain("Un conseil accepté n'est pas une vente.");
    expect(text).toContain("Les conseils proposés depuis moins de 24 h ne comptent pas dans le taux.");
    expect(text).toContain("comptés à la date où ils ont été proposés");
    expect(text).not.toContain("compté à la date de la vente");
  });

  it("revient au chiffre d'affaires", () => {
    const view = mount(UniverseBars, { universes: UNIVERSES });
    (nativeButton(view.render(), "Conseils acceptés").props.onClick as () => void)();
    (nativeButton(view.render(), "Chiffre d'affaires").props.onClick as () => void)();
    const tree = view.render();
    expect(pressed(tree, "Chiffre d'affaires")).toBe(true);
    expect(order(html(tree))).toEqual(["Dermatologie", "Vitamines"]);
  });

  it("ne réordonne pas la liste reçue (le calcul reste maître de son ordre)", () => {
    const received = [...UNIVERSES];
    const view = mount(UniverseBars, { universes: received });
    (nativeButton(view.render(), "Conseils acceptés").props.onClick as () => void)();
    view.render();
    expect(received.map((universe) => universe.category)).toEqual(UNIVERSES.map((universe) => universe.category));
  });

  it("annonce le classement affiché aux lecteurs d'écran", () => {
    const view = mount(UniverseBars, { universes: UNIVERSES });
    expect(html(view.render())).toContain('aria-live="polite"');
    (nativeButton(view.render(), "Conseils acceptés").props.onClick as () => void)();
    expect(plain(html(view.render()))).toContain("Univers classés par conseils acceptés");
  });
});

describe("les barres par univers : à égalité et en trop grand nombre", () => {
  it("départage à égalité par l'autre mesure, puis par ordre alphabétique", () => {
    const tied = [
      row({ category: "SOINS", label: "Soins", accepted: 5, revenueTtcCents: 1000 }),
      row({ category: "NUTRITION", label: "Nutrition", accepted: 5, revenueTtcCents: 3000 }),
      row({ category: "AUTRE", label: "Autres produits de conseil", accepted: 5, revenueTtcCents: 1000 }),
    ];
    const view = mount(UniverseBars, { universes: tied });
    (nativeButton(view.render(), "Conseils acceptés").props.onClick as () => void)();
    expect(order(html(view.render()))).toEqual(["Nutrition", "Autres produits de conseil", "Soins"]);
  });

  it("n'affiche que les huit premiers univers et dit combien manquent", () => {
    const many = Array.from({ length: 10 }, (_, index) => row({ category: `C${index}`, label: `Univers ${String.fromCharCode(65 + index)}`, accepted: 10 - index, proposed: 20, revenueTtcCents: (10 - index) * 100 }));
    const view = mount(UniverseBars, { universes: many });
    const markup = html(view.render());
    expect(order(markup)).toHaveLength(8);
    expect(plain(markup)).toContain("et 2 autres univers moins importants");
    const nine = mount(UniverseBars, { universes: many.slice(0, 9) });
    expect(plain(html(nine.render()))).toContain("et 1 autre univers moins important");
  });
});

describe("les barres par univers : états vides", () => {
  it("s'ouvre sur les conseils acceptés quand aucun chiffre d'affaires n'existe, plutôt que sur un graphique vide", () => {
    const noRevenue = UNIVERSES.map((universe) => ({ ...universe, revenueTtcCents: 0 }));
    const view = mount(UniverseBars, { universes: noRevenue });
    const tree = view.render();
    expect(pressed(tree, "Conseils acceptés")).toBe(true);
    expect(order(html(tree))).toEqual(["Dermatologie", "Vitamines", "Médicaments conseil", "Hygiène"]);
  });

  it("dit honnêtement qu'aucune vente n'est confirmée au prix connu, quand on choisit le chiffre d'affaires", () => {
    const noRevenue = UNIVERSES.map((universe) => ({ ...universe, revenueTtcCents: 0 }));
    const view = mount(UniverseBars, { universes: noRevenue });
    (nativeButton(view.render(), "Chiffre d'affaires").props.onClick as () => void)();
    const markup = html(view.render());
    expect(plain(markup)).toContain("Aucune vente confirmée au prix connu sur cette période : voyez les conseils acceptés.");
    expect(widths(markup)).toEqual([]);
    expect(markup).not.toContain("0,00 €");
  });

  it("dit qu'aucun conseil n'a été proposé quand il n'y a aucun univers", () => {
    const view = mount(UniverseBars, { universes: [] });
    const markup = html(view.render());
    expect(plain(markup)).toContain("Aucun conseil n'a été proposé sur cette période.");
    expect(widths(markup)).toEqual([]);
  });

  it("dit qu'aucun conseil n'est accepté quand des conseils sont proposés sans réponse", () => {
    const view = mount(UniverseBars, { universes: [row({ category: "SOINS", label: "Soins", proposed: 6 })] });
    expect(plain(html(view.render()))).toContain("Aucun conseil accepté sur cette période.");
  });

  it("n'écrit jamais NaN, undefined ni Infinity, même avec des taux absents", () => {
    const view = mount(UniverseBars, { universes: [row({ category: "SOINS", label: "Soins", proposed: 2, accepted: 1, acceptanceRate: null })] });
    (nativeButton(view.render(), "Conseils acceptés").props.onClick as () => void)();
    const markup = html(view.render());
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    expect(plain(markup)).toContain("taux d'acceptation —");
  });

  it("ne rend que des boutons natifs pour la bascule (deux, aucun autre)", () => {
    const tree = mount(UniverseBars, { universes: UNIVERSES }).render();
    expect(allElements(tree).filter((element) => element.type === "button")).toHaveLength(2);
  });
});
