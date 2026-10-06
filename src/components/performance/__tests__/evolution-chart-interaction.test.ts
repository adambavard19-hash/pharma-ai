import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { SeriesBucket } from "@/core/performance/types";
import { fakeHooks, find, allElements, mount, textOf } from "./hooks-u1";
import { weekSeries } from "./fixtures-u1";

/**
 * Le graphique d'évolution : survol, toucher, clavier, bascule de mesure et de
 * comparaison. Sans navigateur : les hooks de React sont remplacés (voir
 * `hooks-u1.ts`) et l'on appelle les gestionnaires comme le ferait un événement.
 */

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks-u1");
  return { ...actual, useState: hooks.useState };
});

const { EvolutionChart } = await import("../evolution-chart");

void fakeHooks;
type El = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
type Props = Parameters<typeof EvolutionChart>[0];

const norm = (text: string) => text.replace(/[  ]/g, " ");

const previousWeek = (): SeriesBucket[] =>
  weekSeries().map((b) => ({ ...b, startsAt: new Date(b.startsAt.getTime() - 7 * 86_400_000), proposed: Math.max(0, b.proposed - 1), accepted: Math.max(0, b.accepted - 1), revenueTtcCents: Math.round(b.revenueTtcCents / 2) }));

const baseProps = (overrides: Partial<Props> = {}): Props => ({
  series: { current: weekSeries(), previous: previousWeek() },
  granularity: "day",
  comparisonLabel: "vs les 7 jours d'avant",
  showAcceptanceRate: true,
  ...overrides,
});

const open = (overrides: Partial<Props> = {}) => {
  const props = baseProps(overrides);
  const chart = mount(EvolutionChart, props);
  return { props, chart, tree: () => chart.render() };
};

const handler = (element: El, name: string) => element.props[name] as (event: unknown) => void;
const plot = (tree: ReactNode) => find(tree, (element) => "data-chart-plot" in element.props, "le tracé");
const tooltip = (tree: ReactNode) => allElements(tree).find((element) => "data-tooltip" in element.props);
const button = (tree: ReactNode, label: string) => find(tree, (element) => element.type === "button" && textOf(element.props.children).trim() === label, `bouton « ${label} »`);
const press = (tree: ReactNode, label: string) => handler(button(tree, label), "onClick")({});
const live = (tree: ReactNode) => textOf(find(tree, (element) => "data-live" in element.props, "la zone vocale").props.children);
const root = (tree: ReactNode) => allElements(tree)[0];
const hasAttr = (tree: ReactNode, attr: string) => allElements(tree).some((element) => attr in element.props);
const countAttr = (tree: ReactNode, attr: string, value: string) => allElements(tree).filter((element) => element.props[attr] === value).length;

/** Un événement de pointeur sur un tracé de 600 px de large qui commence à 0. */
const pointer = (clientX: number, pointerType = "mouse") => ({ clientX, pointerType, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 600 }) } });
const key = (name: string) => ({ key: name, preventDefault: vi.fn() });

describe("mesure et comparaison", () => {
  it("un clic sur « Proposés » change la mesure : titre, graduations et courbe suivent", () => {
    const { tree } = open();
    expect(root(tree()).props["data-measure"]).toBe("revenue");
    press(tree(), "Proposés");
    expect(root(tree()).props["data-measure"]).toBe("proposed");
    expect(norm(textOf(tree()))).toContain("Conseils proposés à l'équipe, par jour");
    expect(button(tree(), "Proposés").props["aria-pressed"]).toBe(true);
    expect(button(tree(), "CA attribué").props["aria-pressed"]).toBe(false);
  });

  it("le taux se choisit, et ses graduations sont des pourcentages entiers de 0 à 100", () => {
    const { tree } = open();
    press(tree(), "Taux");
    expect(root(tree()).props["data-measure"]).toBe("rate");
    const text = norm(textOf(tree()));
    for (const tick of ["0 %", "25 %", "50 %", "75 %", "100 %"]) expect(text).toContain(tick);
  });

  it("un taux choisi puis devenu indisponible retombe sur les conseils proposés", () => {
    const { tree, props } = open();
    press(tree(), "Taux");
    props.showAcceptanceRate = false;
    expect(root(tree()).props["data-measure"]).toBe("proposed");
    expect(() => button(tree(), "Taux")).toThrow();
  });

  it("changer de mesure ferme l'infobulle ouverte", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(300));
    expect(tooltip(tree())).toBeDefined();
    press(tree(), "Acceptés");
    expect(tooltip(tree())).toBeUndefined();
  });

  it("la légende de comparaison masque puis rend la courbe en pointillé", () => {
    const { tree } = open();
    expect(countAttr(tree(), "data-series", "previous")).toBeGreaterThan(0);
    const legend = () => button(tree(), "Les 7 jours d'avant");
    expect(legend().props["aria-pressed"]).toBe(true);
    handler(legend(), "onClick")({});
    expect(legend().props["aria-pressed"]).toBe(false);
    expect(countAttr(tree(), "data-series", "previous")).toBe(0);
    handler(legend(), "onClick")({});
    expect(countAttr(tree(), "data-series", "previous")).toBeGreaterThan(0);
  });

  it("l'échelle ne tient plus compte de la courbe masquée", () => {
    const current = weekSeries().map((b) => ({ ...b, revenueTtcCents: 1_000 }));
    const previous = previousWeek().map((b) => ({ ...b, revenueTtcCents: 90_000 }));
    const { tree } = open({ series: { current, previous } });
    // La comparaison monte jusqu'à 900 € : l'axe va à 1 000 €.
    const withPrevious = norm(textOf(tree()));
    expect(withPrevious).toContain("1 000 €");
    expect(withPrevious).toContain("750 €");
    handler(button(tree(), "Les 7 jours d'avant"), "onClick")({});
    // Sans elle, le maximum est 10 € : l'axe se resserre.
    const text = norm(textOf(tree()));
    expect(text).not.toContain("750 €");
    expect(text).toContain("10 €");
  });
});

describe("survol et toucher", () => {
  it("le pointeur au milieu du tracé ouvre l'infobulle datée du point le plus proche", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(300));
    const tip = norm(textOf(tooltip(tree())?.props.children));
    // 7 points, milieu = le 4e : jeudi 8 octobre.
    expect(tip).toContain("Jeudi 8 octobre");
    expect(tip).toContain("98,70 €");
    expect(tip).toContain("3 conseils achetés");
    expect(norm(live(tree()))).toContain("Jeudi 8 octobre : 98,70 €. Les 7 jours d'avant : 49,35 €");
  });

  it("la valeur de la période précédente figure dans la même infobulle, avec sa date", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(300));
    const tip = norm(textOf(tooltip(tree())?.props.children));
    expect(tip).toContain("49,35 €");
    expect(tip).toContain("Les 7 jours d'avant · Jeudi 1 octobre");
  });

  it("masquer la comparaison la retire aussi de l'infobulle", () => {
    const { tree } = open();
    handler(button(tree(), "Les 7 jours d'avant"), "onClick")({});
    handler(plot(tree()), "onPointerMove")(pointer(300));
    expect(norm(textOf(tooltip(tree())?.props.children))).not.toContain("Les 7 jours d'avant");
  });

  it("aux extrémités, le premier et le dernier point", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(0));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Lundi 5 octobre");
    handler(plot(tree()), "onPointerMove")(pointer(600));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
    handler(plot(tree()), "onPointerMove")(pointer(99_999));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
  });

  it("un toucher (pointerdown) ouvre l'infobulle et le doigt qui se lève ne la ferme pas", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerDown")(pointer(100, "touch"));
    expect(tooltip(tree())).toBeDefined();
    handler(plot(tree()), "onPointerLeave")(pointer(100, "touch"));
    expect(tooltip(tree())).toBeDefined();
  });

  it("la souris qui quitte le tracé ferme l'infobulle", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(300));
    handler(plot(tree()), "onPointerLeave")(pointer(900, "mouse"));
    expect(tooltip(tree())).toBeUndefined();
    expect(live(tree())).toBe("");
  });

  it("l'infobulle s'écarte du point : en haut quand le point est bas, en bas quand il est haut", () => {
    const current = weekSeries().map((b, index) => ({ ...b, revenueTtcCents: index === 0 ? 100 : 30_000 }));
    const { tree } = open({ series: { current, previous: [] } });
    handler(plot(tree()), "onPointerMove")(pointer(0));
    expect((tooltip(tree())?.props.style as Record<string, unknown>).top).toBe(4);
    handler(plot(tree()), "onPointerMove")(pointer(600));
    expect((tooltip(tree())?.props.style as Record<string, unknown>).bottom).toBe(4);
  });

  it("l'infobulle reste dans le tracé : ancrée à gauche au bord gauche, à droite au bord droit", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(0));
    expect(tooltip(tree())?.props.style).toMatchObject({ left: "0%", transform: "translateX(-0%)" });
    handler(plot(tree()), "onPointerMove")(pointer(600));
    expect(tooltip(tree())?.props.style).toMatchObject({ left: "100%", transform: "translateX(-100%)" });
  });

  it("un créneau sans taux (moins de 3 conseils tranchés) affiche « — » et le dit", () => {
    const { tree } = open();
    press(tree(), "Taux");
    // Le 3e jour (index 2) n'a pas de taux : pointeur à 2/6 de la largeur.
    handler(plot(tree()), "onPointerMove")(pointer(200));
    const tip = norm(textOf(tooltip(tree())?.props.children));
    expect(tip).toContain("Mercredi 7 octobre");
    expect(tip).toContain("—");
    expect(tip).toContain("Moins de 3 conseils tranchés : pas de taux");
    expect(tip).not.toContain("0 %");
    expect(hasAttr(tree(), "data-point")).toBe(true);
    expect(countAttr(tree(), "data-point", "active")).toBe(0);
  });

  it("un point connu a son point actif et son filet vertical", () => {
    const { tree } = open();
    handler(plot(tree()), "onPointerMove")(pointer(300));
    expect(countAttr(tree(), "data-point", "active")).toBe(1);
    expect(countAttr(tree(), "data-point", "crosshair")).toBe(1);
  });
});

describe("clavier", () => {
  it("la flèche droite part du premier point et avance, bornée au dernier", () => {
    const { tree } = open();
    const onKeyDown = () => handler(plot(tree()), "onKeyDown");
    const event = key("ArrowRight");
    onKeyDown()(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(textOf(tooltip(tree())?.props.children)).toContain("Lundi 5 octobre");
    for (let i = 0; i < 10; i += 1) onKeyDown()(key("ArrowRight"));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
  });

  it("la flèche gauche part du dernier point et recule, bornée au premier", () => {
    const { tree } = open();
    handler(plot(tree()), "onKeyDown")(key("ArrowLeft"));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
    for (let i = 0; i < 10; i += 1) handler(plot(tree()), "onKeyDown")(key("ArrowLeft"));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Lundi 5 octobre");
  });

  it("Début, Fin, Échap", () => {
    const { tree } = open();
    handler(plot(tree()), "onKeyDown")(key("End"));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
    handler(plot(tree()), "onKeyDown")(key("Home"));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Lundi 5 octobre");
    handler(plot(tree()), "onKeyDown")(key("Escape"));
    expect(tooltip(tree())).toBeUndefined();
  });

  it("une autre touche ne fait rien et n'est pas avalée (Tab doit continuer à fonctionner)", () => {
    const { tree } = open();
    const event = key("Tab");
    handler(plot(tree()), "onKeyDown")(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(tooltip(tree())).toBeUndefined();
  });

  it("le focus au clavier ouvre le dernier point ; le focus à la souris ou au toucher n'ouvre rien", () => {
    const { tree } = open();
    handler(plot(tree()), "onFocus")({ currentTarget: { matches: () => false } });
    expect(tooltip(tree())).toBeUndefined();
    handler(plot(tree()), "onFocus")({ currentTarget: { matches: () => true } });
    expect(textOf(tooltip(tree())?.props.children)).toContain("Dimanche 11 octobre");
  });

  it("un navigateur sans :focus-visible ne fait pas planter le focus", () => {
    const { tree } = open();
    expect(() =>
      handler(plot(tree()), "onFocus")({
        currentTarget: {
          matches: () => {
            throw new Error("sélecteur inconnu");
          },
        },
      }),
    ).not.toThrow();
    expect(tooltip(tree())).toBeUndefined();
  });

  it("quitter le tracé (blur) ferme l'infobulle", () => {
    const { tree } = open();
    handler(plot(tree()), "onKeyDown")(key("End"));
    handler(plot(tree()), "onBlur")({});
    expect(tooltip(tree())).toBeUndefined();
  });
});

describe("cas limites", () => {
  it("un seul point : le pointeur désigne ce point", () => {
    const { tree } = open({ series: { current: weekSeries().slice(0, 1), previous: [] } });
    handler(plot(tree()), "onPointerMove")(pointer(450));
    expect(textOf(tooltip(tree())?.props.children)).toContain("Lundi 5 octobre");
    expect(tooltip(tree())?.props.style).toMatchObject({ left: "50%" });
  });

  it("une série qui raccourcit entre deux rendus ne laisse pas un point actif hors série", () => {
    const { tree, props } = open();
    handler(plot(tree()), "onKeyDown")(key("End"));
    props.series = { current: weekSeries().slice(0, 3), previous: [] };
    expect(tooltip(tree())).toBeUndefined();
  });

  it("des mesures sans donnée : on peut quand même survoler sans erreur", () => {
    const current = [0, 1, 2].map((i) => ({ ...weekSeries()[i], proposed: 0, accepted: 0, purchased: 0, revenueTtcCents: 0, acceptanceRate: null }));
    const { tree } = open({ series: { current, previous: [] } });
    handler(plot(tree()), "onPointerMove")(pointer(300));
    expect(norm(textOf(tooltip(tree())?.props.children))).toContain("0,00 €");
  });
});
