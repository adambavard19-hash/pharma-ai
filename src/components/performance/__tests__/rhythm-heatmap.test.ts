import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RhythmCell, RhythmStats } from "@/core/performance/types";
import { allElements, cellButton, find, fakeHooks, mount, textOf } from "./hooks-u2";

/**
 * La carte de chaleur des jours et des heures. Sans navigateur : on rend
 * l'arbre, on lit le HTML produit, puis on appelle les gestionnaires (survol,
 * toucher, flèches) comme le ferait l'utilisateur et on rend à nouveau.
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks-u2");
  return { ...actual, useState: hooks.useState };
});

const { RhythmHeatmap } = await import("../rhythm-heatmap");

void fakeHooks;

/** Toutes les cases de la semaine à zéro, puis les cases choisies. */
function rhythm(cells: Partial<RhythmCell>[], overrides: Partial<RhythmStats> = {}): RhythmStats {
  const all: RhythmCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const given = cells.find((cell) => cell.weekday === weekday && cell.hour === hour);
      all.push({ weekday, hour, proposed: 0, accepted: 0, decided: 0, ...given });
    }
  }
  return { windowDays: 90, cells: all, enoughData: true, bestWeekday: null, bestWindow: null, ...overrides };
}

/** Un rythme réaliste : mardi 10 h–12 h est la meilleure plage. */
const FULL = rhythm(
  [
    { weekday: 1, hour: 10, proposed: 14, accepted: 9, decided: 14 }, // 64 %
    { weekday: 1, hour: 11, proposed: 10, accepted: 8, decided: 10 }, // 80 %
    { weekday: 0, hour: 9, proposed: 2, accepted: 1, decided: 1 }, // trop peu de tranchés
    { weekday: 2, hour: 14, proposed: 12, accepted: 2, decided: 10 }, // 20 %
    { weekday: 3, hour: 8, proposed: 5, accepted: 5, decided: 5 }, // 100 % mais 5 tranchés : pâle
  ],
  {
    bestWeekday: { weekday: 1, label: "mardi", acceptanceRate: 0.68, decided: 24 },
    bestWindow: { fromHour: 10, toHour: 12, acceptanceRate: 0.67, decided: 24 },
  },
);

const mounted = (stats: RhythmStats = FULL) => mount(RhythmHeatmap, { rhythm: stats });
const html = (tree: ReactNode) =>
  renderToStaticMarkup(tree as ReactElement)
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ");
const plain = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** Les espaces insécables (avant « % ») se lisent comme des espaces. */
const spaced = (value: unknown) => String(value).replace(/[\u00a0\u202f]/g, " ");
const label = (button: { props: Record<string, unknown> }) => spaced(button.props["aria-label"]);
const detail = (tree: ReactNode) => spaced(textOf(find(tree, (element) => element.props["data-detail"] !== undefined, "la ligne de détail").props.children));
const key = (name: string) => ({ key: name, preventDefault: vi.fn() });

describe("la carte de chaleur : le cas plein", () => {
  const markup = html(mounted().render());
  const text = plain(markup);

  it("dit le meilleur jour et la meilleure plage de deux heures, avec leur effectif", () => {
    expect(text).toContain("Meilleur jour Mardi 68 % de conseils acceptés · 24 conseils tranchés");
    expect(text).toContain("Meilleure plage de 2 heures 10 h – 12 h 67 % de conseils acceptés · 24 conseils tranchés");
    expect(text).toContain("Sur les 90 derniers jours, quelle que soit la période choisie.");
  });

  it("colore sur une échelle fixe : 20 % → niveau 1, 64 % → 3, 80 % → 4 ; jamais relative au meilleur", () => {
    const tree = mounted().render();
    expect(cellButton(tree, 2, 14).props["data-level"]).toBe(1);
    expect(cellButton(tree, 1, 10).props["data-level"]).toBe(3);
    expect(cellButton(tree, 1, 11).props["data-level"]).toBe(4);
  });

  it("n'attribue aucune couleur de taux à une case de moins de 3 conseils tranchés (pointillé)", () => {
    const tree = mounted().render();
    const monday9 = cellButton(tree, 0, 9);
    expect(monday9.props["data-level"]).toBeUndefined();
    expect(String(monday9.props.className)).toContain("border-dashed");
    expect(label(monday9)).toBe("Lundi, 9 h : 2 conseils proposés, 1 seulement est tranché : trop peu pour donner un taux.");
  });

  it("laisse sans couleur et sans pointillé une case où rien n'a été proposé", () => {
    const empty = cellButton(mounted().render(), 4, 15);
    expect(empty.props["data-level"]).toBeUndefined();
    expect(String(empty.props.className)).not.toContain("border-dashed");
    expect(label(empty)).toBe("Vendredi, 15 h : aucun conseil proposé.");
  });

  it("écrit pour chaque case une phrase complète (lecteurs d'écran), avec le taux", () => {
    const tree = mounted().render();
    expect(label(cellButton(tree, 1, 10))).toBe("Mardi, 10 h : 9 acceptés sur 14 tranchés (64 %).");
    expect(label(cellButton(tree, 2, 14))).toBe("Mercredi, 14 h : 2 acceptés sur 10 tranchés (20 %).");
  });

  it("pâlit une case de 3 à 7 conseils tranchés et le dit", () => {
    const thursday8 = cellButton(mounted().render(), 3, 8);
    expect(String(thursday8.props.className)).toContain("opacity-55");
    expect(label(thursday8)).toBe("Jeudi, 8 h : 5 acceptés sur 5 tranchés (100 %). Peu de conseils : à prendre avec prudence.");
    expect(String(cellButton(mounted().render(), 1, 10).props.className)).not.toContain("opacity-55");
  });

  it("met en avant le meilleur jour et les deux heures de la meilleure plage, et elles seules", () => {
    expect(markup.match(/border-b-2 border-brand-500/g)).toHaveLength(2);
    expect(markup.match(/<th scope="row" class="[^"]*text-brand-700[^"]*">/g)).toHaveLength(1);
    expect(markup).toMatch(/<th scope="row" class="[^"]*font-semibold text-brand-700[^"]*"><span aria-hidden="true">Mar\.<\/span>/);
  });

  it("ne garde qu'une case dans l'ordre de tabulation : la meilleure plage", () => {
    const tree = mounted().render();
    const stops = allElements(tree).filter((element) => element.type === "button" && element.props.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].props["data-weekday"]).toBe(1);
    expect(stops[0].props["data-hour"]).toBe(10);
  });

  it("affiche 8 h → 20 h par défaut : 7 × 13 cases", () => {
    const tree = mounted().render();
    const buttons = allElements(tree).filter((element) => element.type === "button");
    expect(buttons).toHaveLength(7 * 13);
    expect(buttons.some((element) => element.props["data-hour"] === 7)).toBe(false);
    expect(buttons.some((element) => element.props["data-hour"] === 21)).toBe(false);
  });

  it("élargit la grille quand des conseils sortent des heures habituelles", () => {
    const wide = rhythm(
      [
        { weekday: 5, hour: 6, proposed: 3, accepted: 1, decided: 3 },
        { weekday: 5, hour: 22, proposed: 1, accepted: 0, decided: 0 },
      ],
      { enoughData: true },
    );
    const buttons = allElements(mounted(wide).render()).filter((element) => element.type === "button");
    expect(buttons).toHaveLength(7 * 17);
    expect(buttons.some((element) => element.props["data-hour"] === 6)).toBe(true);
    expect(buttons.some((element) => element.props["data-hour"] === 22)).toBe(true);
    expect(buttons.some((element) => element.props["data-hour"] === 23)).toBe(false);
  });

  it("garde le tableau lisible : légende, titre de tableau et en-têtes de ligne et de colonne", () => {
    expect(markup).toContain("Taux d'acceptation des conseils, par jour de la semaine et par heure, sur les 90 derniers jours.");
    expect(markup.match(/<th scope="row"/g)).toHaveLength(7);
    expect(text).toContain("Aucun conseil");
    expect(text).toContain("Moins de 3 conseils tranchés");
    expect(text).toContain("Pâle : moins de 8 conseils tranchés");
    expect(text).toContain("Taux faible");
  });

  it("n'utilise ni rouge ni orange : le taux bas n'est pas une alerte", () => {
    expect(markup).not.toMatch(/danger|warning/);
  });

  it("garde chaque seuil de l'échelle : 19 % → niveau 0, 20 % → 1, 40 % → 2, 60 % → 3, 80 % → 4", () => {
    const stats = rhythm(
      [
        { weekday: 0, hour: 8, proposed: 100, accepted: 19, decided: 100 },
        { weekday: 0, hour: 9, proposed: 10, accepted: 2, decided: 10 },
        { weekday: 0, hour: 10, proposed: 10, accepted: 4, decided: 10 },
        { weekday: 0, hour: 11, proposed: 10, accepted: 6, decided: 10 },
        { weekday: 0, hour: 12, proposed: 10, accepted: 8, decided: 10 },
      ],
      { enoughData: true },
    );
    const tree = mounted(stats).render();
    expect([8, 9, 10, 11, 12].map((hour) => cellButton(tree, 0, hour).props["data-level"])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("la carte de chaleur : survol, toucher et clavier", () => {
  it("invite d'abord à survoler une case", () => {
    expect(detail(mounted().render())).toBe("Passez sur une case, ou touchez-la, pour voir le détail.");
  });

  it("écrit le détail de la case survolée, sans l'annoncer deux fois aux lecteurs d'écran", () => {
    const view = mounted();
    const first = view.render();
    (cellButton(first, 1, 10).props.onMouseEnter as () => void)();
    const next = view.render();
    expect(detail(next)).toBe("Mardi, 10 h : 9 acceptés sur 14 tranchés (64 %).");
    expect(find(next, (element) => element.props["data-detail"] !== undefined, "détail").props["aria-hidden"]).toBe("true");
    expect(String(cellButton(next, 1, 10).props.className)).toContain("ring-2");
    expect(String(cellButton(next, 1, 11).props.className)).not.toContain("ring-2");
  });

  it("réagit au toucher (clic) et au focus clavier de la même façon", () => {
    const view = mounted();
    (cellButton(view.render(), 2, 14).props.onClick as () => void)();
    expect(detail(view.render())).toBe("Mercredi, 14 h : 2 acceptés sur 10 tranchés (20 %).");
    (cellButton(view.render(), 3, 8).props.onFocus as () => void)();
    expect(detail(view.render())).toContain("Jeudi, 8 h : 5 acceptés sur 5 tranchés (100 %).");
  });

  it("déplace la case tabulable avec la sélection : jamais deux cases dans l'ordre de tabulation", () => {
    const view = mounted();
    (cellButton(view.render(), 4, 16).props.onMouseEnter as () => void)();
    const tree = view.render();
    const stops = allElements(tree).filter((element) => element.type === "button" && element.props.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].props["data-weekday"]).toBe(4);
    expect(stops[0].props["data-hour"]).toBe(16);
  });

  it("se déplace aux flèches, d'une case à la fois, sans sortir de la grille", () => {
    const view = mounted();
    const press = (weekday: number, hour: number, name: string) => {
      const event = key(name);
      (cellButton(view.render(), weekday, hour).props.onKeyDown as (e: unknown) => void)(event);
      return event;
    };
    const right = press(1, 10, "ArrowRight");
    expect(right.preventDefault).toHaveBeenCalledOnce();
    expect(detail(view.render())).toContain("Mardi, 11 h");

    press(1, 11, "ArrowDown");
    expect(detail(view.render())).toContain("Mercredi, 11 h");

    press(2, 11, "ArrowUp");
    press(1, 11, "ArrowUp");
    expect(detail(view.render())).toContain("Lundi, 11 h");
    press(0, 11, "ArrowUp"); // lundi : on reste sur lundi
    expect(detail(view.render())).toContain("Lundi, 11 h");

    press(0, 11, "ArrowLeft");
    expect(detail(view.render())).toContain("Lundi, 10 h");
    press(0, 10, "Home");
    expect(detail(view.render())).toContain("Lundi, 8 h");
    press(0, 8, "ArrowLeft"); // première heure : on reste
    expect(detail(view.render())).toContain("Lundi, 8 h");
    press(0, 8, "End");
    expect(detail(view.render())).toContain("Lundi, 20 h");
    press(0, 20, "ArrowRight"); // dernière heure : on reste
    expect(detail(view.render())).toContain("Lundi, 20 h");

    for (let weekday = 0; weekday < 6; weekday += 1) press(weekday, 20, "ArrowDown");
    expect(detail(view.render())).toContain("Dimanche, 20 h");
    press(6, 20, "ArrowDown"); // dimanche : on reste
    expect(detail(view.render())).toContain("Dimanche, 20 h");
  });

  it("laisse passer les autres touches (Tab, Entrée) sans rien bloquer ni changer", () => {
    const view = mounted();
    (cellButton(view.render(), 1, 10).props.onMouseEnter as () => void)();
    const before = detail(view.render());
    for (const name of ["Tab", "Enter", " ", "a"]) {
      const event = key(name);
      (cellButton(view.render(), 1, 10).props.onKeyDown as (e: unknown) => void)(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(detail(view.render())).toBe(before);
  });
});

describe("la carte de chaleur : peu de données", () => {
  const few = (decidedCells: Partial<RhythmCell>[]) => rhythm(decidedCells, { enoughData: false });

  it("n'invente aucun rythme sous 30 conseils tranchés : elle dit combien il en manque, sans grille", () => {
    const stats = few([
      { weekday: 1, hour: 10, proposed: 8, accepted: 4, decided: 7 },
      { weekday: 2, hour: 11, proposed: 6, accepted: 3, decided: 5 },
    ]);
    const markup = html(mounted(stats).render());
    const text = plain(markup);
    expect(text).toContain("12 conseils tranchés sur les 90 derniers jours.");
    expect(text).toContain("Il en faut au moins 30");
    expect(text).toContain("12 sur 30 conseils tranchés");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("Meilleur jour");
    expect(markup).toContain("width:40%");
  });

  it("dit qu'aucun conseil n'est encore tranché, à zéro", () => {
    const markup = html(mounted(few([])).render());
    const text = plain(markup);
    expect(text).toContain("Aucun conseil n'a encore été tranché sur les 90 derniers jours.");
    expect(text).toContain("0 sur 30 conseils tranchés");
    expect(markup).toContain("width:0%");
  });

  it("ne dépasse pas 100 % de la jauge", () => {
    const markup = html(mounted(few([{ weekday: 0, hour: 9, proposed: 40, accepted: 20, decided: 29 }, { weekday: 1, hour: 9, proposed: 40, accepted: 20, decided: 29 }])).render());
    expect(markup).toContain("width:100%");
    expect(plain(markup)).toContain("30 sur 30 conseils tranchés");
  });
});

describe("la carte de chaleur : pas de meilleur jour ni de meilleure plage", () => {
  it("le dit en clair, avec le seuil, au lieu d'en désigner un au hasard", () => {
    const text = plain(html(mounted(rhythm([{ weekday: 1, hour: 10, proposed: 14, accepted: 9, decided: 14 }], { enoughData: true })).render()));
    expect(text).toContain("Pas encore assez de conseils par jour (au moins 8 tranchés) pour en désigner un.");
    expect(text).toContain("Pas encore assez de conseils par plage (au moins 8 tranchés) pour en désigner une.");
  });

  it("garde une case tabulable même sans meilleure plage", () => {
    const stats = rhythm([{ weekday: 4, hour: 17, proposed: 14, accepted: 9, decided: 14 }], { enoughData: true });
    const stops = allElements(mounted(stats).render()).filter((element) => element.type === "button" && element.props.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].props["data-weekday"]).toBe(4);
    expect(stops[0].props["data-hour"]).toBe(17);
  });

  it("garde une case tabulable quand aucun conseil n'a été proposé du tout", () => {
    const stops = allElements(mounted(rhythm([], { enoughData: true })).render()).filter((element) => element.type === "button" && element.props.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].props["data-weekday"]).toBe(0);
    expect(stops[0].props["data-hour"]).toBe(8);
  });

  it("n'écrit jamais NaN, undefined ni Infinity", () => {
    for (const stats of [FULL, rhythm([], { enoughData: true }), rhythm([], { enoughData: false })]) {
      expect(html(mounted(stats).render())).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
