import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TIME_ZONE } from "@/config/constants";
import { PERIOD_OPTIONS, parsePeriodParams } from "@/core/performance/periods";
import type { PerformancePeriod } from "@/core/performance/types";
import { field, find, mount, nativeButton, textOf } from "./period-bar-hooks";

/**
 * La barre de période : quatre puces, des dates au choix, et l'adresse qu'elle
 * écrit. Sans navigateur : les hooks de React sont remplacés (voir
 * `period-bar-hooks.ts`), on appelle les gestionnaires comme le ferait un clic.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./period-bar-hooks");
  return { ...actual, useState: hooks.useState, useTransition: hooks.useTransition };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const { PeriodBar, buildPeriodHref } = await import("../period-bar");

const NOW = new Date("2026-10-12T10:00:00Z");

const sevenDays: PerformancePeriod = {
  key: "7d",
  label: "7 derniers jours",
  start: new Date("2026-10-05T10:00:00Z"),
  end: NOW,
  previousStart: new Date("2026-09-28T10:00:00Z"),
  previousEnd: new Date("2026-10-05T10:00:00Z"),
  granularity: "day",
  dayCount: 8,
  inProgress: true,
};

const custom: PerformancePeriod = {
  key: "custom",
  label: "Du 7 au 13 septembre 2026",
  start: new Date("2026-09-06T22:00:00Z"),
  end: new Date("2026-09-13T22:00:00Z"),
  previousStart: new Date("2026-08-30T22:00:00Z"),
  previousEnd: new Date("2026-09-06T22:00:00Z"),
  granularity: "day",
  dayCount: 7,
  inProgress: false,
  from: "2026-09-07",
  to: "2026-09-13",
};

const html = (view: ReturnType<typeof mount>) => renderToStaticMarkup(view.render() as never);
/** Le texte rendu, sans balisage : les apostrophes redeviennent des apostrophes. */
const shown = (view: ReturnType<typeof mount>) =>
  html(view)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const type = (view: ReturnType<typeof mount>, name: "du" | "au", value: string) => (field(view.render(), name).props.onChange as (event: unknown) => void)({ target: { value } });
const submit = (view: ReturnType<typeof mount>) => (find(view.render(), (element) => element.type === "form", "formulaire").props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });

beforeEach(() => {
  mocks.push.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("buildPeriodHref : l'adresse d'une période", () => {
  it("écrit la période seule", () => {
    expect(buildPeriodHref("/resultats", undefined, { value: "7j" })).toBe("/resultats?periode=7j");
  });

  it("conserve les paramètres à garder, avant la période", () => {
    expect(buildPeriodHref("/admin/pharmacies/ph_1", { onglet: "performance" }, { value: "mois" })).toBe("/admin/pharmacies/ph_1?onglet=performance&periode=mois");
  });

  it("ne reprend jamais une période déjà présente dans les paramètres à garder", () => {
    const href = buildPeriodHref("/resultats", { onglet: "performance", periode: "mois", du: "2026-01-01", au: "2026-01-31" }, { value: "aujourdhui" });
    expect(href).toBe("/resultats?onglet=performance&periode=aujourdhui");
  });

  it("écrit les dates d'une période personnalisée", () => {
    expect(buildPeriodHref("/resultats", undefined, { value: "perso", from: "2026-09-07", to: "2026-09-13" })).toBe("/resultats?periode=perso&du=2026-09-07&au=2026-09-13");
  });

  it("encode les valeurs conservées et refuse un chemin extérieur", () => {
    expect(buildPeriodHref("/resultats", { q: "a&b=c" }, { value: "7j" })).toBe("/resultats?q=a%26b%3Dc&periode=7j");
    expect(buildPeriodHref("//evil.example", undefined, { value: "7j" })).toBe("/?periode=7j");
    expect(buildPeriodHref("https://evil.example/x", undefined, { value: "7j" })).toBe("/?periode=7j");
    expect(buildPeriodHref("javascript:alert(1)", undefined, { value: "7j" })).toBe("/?periode=7j");
  });
});

describe("buildPeriodHref : relu par le parseur du cœur", () => {
  const read = (href: string) => parsePeriodParams(Object.fromEntries(new URL(href, "https://exemple.test").searchParams), NOW, TIME_ZONE);

  it.each(PERIOD_OPTIONS.filter((option) => option.key !== "custom"))("l'adresse de « $label » redonne la période $key", (option) => {
    expect(read(buildPeriodHref("/resultats", { onglet: "performance" }, option)).key).toBe(option.key);
  });

  it("l'adresse de dates au choix redonne les mêmes dates", () => {
    const period = read(buildPeriodHref("/resultats", undefined, { value: "perso", from: "2026-09-07", to: "2026-09-13" }));
    expect(period.key).toBe("custom");
    expect(period.from).toBe("2026-09-07");
    expect(period.to).toBe("2026-09-13");
  });
});

describe("PeriodBar : les puces", () => {
  it("affiche quatre puces, seule la période courante est enfoncée (aria-pressed)", () => {
    const view = mount(PeriodBar, { period: sevenDays, basePath: "/resultats" });
    const rendered = view.render();
    const pressed = (label: string) => nativeButton(rendered, label).props["aria-pressed"];
    expect(pressed("Aujourd'hui")).toBe(false);
    expect(pressed("7 derniers jours")).toBe(true);
    expect(pressed("Ce mois-ci")).toBe(false);
    expect(pressed("Personnalisée")).toBe(false);
  });

  it("dit la période affichée et à quoi elle se compare", () => {
    const text = textOf(mount(PeriodBar, { period: sevenDays, basePath: "/resultats" }).render());
    expect(text).toContain("7 derniers jours");
    expect(text).toContain("variations vs les 7 jours d'avant");
  });

  it("un clic sur « Aujourd'hui » écrit ?periode=aujourdhui", () => {
    const view = mount(PeriodBar, { period: sevenDays, basePath: "/resultats" });
    (nativeButton(view.render(), "Aujourd'hui").props.onClick as () => void)();
    expect(mocks.push).toHaveBeenCalledWith("/resultats?periode=aujourdhui", { scroll: false });
  });

  it("un clic sur « Ce mois-ci » conserve les paramètres à garder (onglet de la fiche)", () => {
    const view = mount(PeriodBar, { period: sevenDays, basePath: "/admin/pharmacies/ph_1", preserveParams: { onglet: "performance" } });
    (nativeButton(view.render(), "Ce mois-ci").props.onClick as () => void)();
    expect(mocks.push).toHaveBeenCalledWith("/admin/pharmacies/ph_1?onglet=performance&periode=mois", { scroll: false });
  });

  it("les dates ne sont pas proposées tant qu'on ne les demande pas", () => {
    expect(html(mount(PeriodBar, { period: sevenDays, basePath: "/resultats" }))).not.toContain('type="date"');
  });
});

describe("PeriodBar : dates au choix", () => {
  it("« Personnalisée » ouvre deux dates, préremplies avec la période affichée, sans naviguer", () => {
    const view = mount(PeriodBar, { period: sevenDays, basePath: "/resultats" });
    (nativeButton(view.render(), "Personnalisée").props.onClick as () => void)();
    expect(nativeButton(view.render(), "Personnalisée").props["aria-expanded"]).toBe(true);
    expect(field(view.render(), "du").props.value).toBe("2026-10-05");
    expect(field(view.render(), "au").props.value).toBe("2026-10-12");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("une période personnalisée s'ouvre déjà, avec ses dates, et sa puce est enfoncée", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    expect(nativeButton(view.render(), "Personnalisée").props["aria-pressed"]).toBe(true);
    expect(field(view.render(), "du").props.value).toBe("2026-09-07");
    expect(field(view.render(), "au").props.value).toBe("2026-09-13");
  });

  it("« Afficher » écrit periode=perso&du=…&au=… et garde les paramètres à garder", () => {
    const view = mount(PeriodBar, { period: sevenDays, basePath: "/admin/pharmacies/ph_1", preserveParams: { onglet: "performance" } });
    (nativeButton(view.render(), "Personnalisée").props.onClick as () => void)();
    type(view, "du", "2026-09-07");
    type(view, "au", "2026-09-15");
    submit(view);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/admin/pharmacies/ph_1?onglet=performance&periode=perso&du=2026-09-07&au=2026-09-15", { scroll: false });
  });

  it("une date de fin à venir est refusée, dite en clair, sans navigation", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "au", "2026-10-13");
    submit(view);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(html(view)).toContain("Les dates à venir ne peuvent pas encore être mesurées.");
    expect(html(view)).toContain('role="alert"');
  });

  it("aujourd'hui lui-même est accepté (fuseau de l'officine)", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "au", "2026-10-12");
    submit(view);
    expect(mocks.push).toHaveBeenCalledWith("/resultats?periode=perso&du=2026-09-07&au=2026-10-12", { scroll: false });
  });

  it("des dates inversées sont refusées", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "du", "2026-09-20");
    type(view, "au", "2026-09-10");
    submit(view);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(html(view)).toContain("La date de début doit venir avant la date de fin.");
  });

  it("plus d'un an est refusé", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "du", "2025-01-01");
    type(view, "au", "2026-10-01");
    submit(view);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(shown(view)).toContain("Choisissez une période d'un an au plus.");
  });

  it("une date d'avant l'an 2000 est refusée avant le clic, avec le bon message, et le sélecteur de date ne l'offre pas", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    expect(field(view.render(), "du").props.min).toBe("2000-01-01");
    expect(field(view.render(), "au").props.min).toBe("2000-01-01");
    for (const [from, to] of [["0001-01-01", "0001-01-02"], ["1999-12-31", "2000-01-05"]]) {
      type(view, "du", from);
      type(view, "au", to);
      submit(view);
      expect(mocks.push).not.toHaveBeenCalled();
      expect(shown(view)).toContain("Choisissez des dates à partir de 2000.");
    }
    type(view, "du", "2000-01-01");
    type(view, "au", "2000-01-05");
    submit(view);
    expect(mocks.push).toHaveBeenCalledWith("/resultats?periode=perso&du=2000-01-01&au=2000-01-05", { scroll: false });
  });

  it("une date impossible (31 février) est refusée avant le clic", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "du", "2026-02-31");
    type(view, "au", "2026-03-05");
    submit(view);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(html(view)).toContain("Ces dates ne sont pas valides.");
  });

  it("modifier une date efface le message d'erreur", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "au", "2026-10-13");
    submit(view);
    expect(html(view)).toContain('role="alert"');
    type(view, "au", "2026-10-12");
    expect(html(view)).not.toContain('role="alert"');
  });

  it("« Afficher » est désactivé tant qu'une date manque", () => {
    const view = mount(PeriodBar, { period: custom, basePath: "/resultats" });
    type(view, "du", "");
    const submitButton = find(view.render(), (element) => typeof element.type !== "string" && textOf(element.props.children).trim() === "Afficher", "bouton Afficher");
    expect(submitButton.props.disabled).toBe(true);
  });
});
