import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SeriesBucket } from "@/core/performance/types";
import { EvolutionChart } from "../evolution-chart";
import { bucket, weekSeries } from "./fixtures-u1";

/**
 * Le graphique d'évolution, rendu une fois (état d'ouverture) : la mesure
 * d'ouverture, les boutons, la légende, le tableau pour les lecteurs d'écran et
 * tous les états vides. Les interactions sont dans `evolution-chart-interaction`.
 */

const norm = (text: string) => text.replace(/[  ]/g, " ");

/** La semaine d'avant : mêmes valeurs en moins, sept jours plus tôt. */
const previousWeek = (): SeriesBucket[] =>
  weekSeries().map((b) => ({ ...b, startsAt: new Date(b.startsAt.getTime() - 7 * 86_400_000), proposed: Math.max(0, b.proposed - 1), accepted: Math.max(0, b.accepted - 1), revenueTtcCents: Math.round(b.revenueTtcCents / 2) }));

type Props = Parameters<typeof EvolutionChart>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  series: { current: weekSeries(), previous: previousWeek() },
  granularity: "day",
  comparisonLabel: "vs les 7 jours d'avant",
  showAcceptanceRate: true,
  ...overrides,
});
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(EvolutionChart, props(overrides)));

describe("à l'ouverture", () => {
  it("s'ouvre sur le chiffre d'affaires quand il y en a, avec ses quatre boutons", () => {
    const html = render();
    expect(html).toContain('data-measure="revenue"');
    expect(html).toContain("Chiffre d&#x27;affaires attribué, TTC, par jour");
    for (const tab of ["CA attribué", "Proposés", "Acceptés", "Taux"]) expect(html).toContain(`>${tab}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>CA attribué/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Proposés/);
  });

  it("sans chiffre d'affaires mais avec des conseils, s'ouvre sur les conseils proposés (pas sur une courbe vide)", () => {
    const current = weekSeries().map((b) => ({ ...b, revenueTtcCents: 0, purchased: 0 }));
    const html = render({ series: { current, previous: [] } });
    expect(html).toContain('data-measure="proposed"');
    expect(html).toContain("Conseils proposés à l&#x27;équipe, par jour");
  });

  it("le bouton « Taux » n'existe pas tant que le rapport ne sait pas calculer de taux", () => {
    const html = render({ showAcceptanceRate: false });
    expect(html).not.toContain(">Taux</button>");
    expect(html).toContain(">Acceptés</button>");
    expect(html).not.toContain("Taux d&#x27;acceptation");
  });

  it("la granularité se lit dans le sous-titre", () => {
    expect(render({ granularity: "hour" })).toContain("par heure");
    expect(render({ granularity: "week" })).toContain("par semaine");
  });
});

describe("la courbe", () => {
  it("trace la période courante (aire dégradée + trait) et, en pointillé, la précédente", () => {
    const html = render();
    expect(html).toContain('data-series="current"');
    expect(html).toContain('data-series="previous"');
    expect(html).toContain('id="perf-evolution-area"');
    expect(html).toContain("url(#perf-evolution-area)");
    expect(html).toContain('stroke-dasharray="5 5"');
    expect(html).toContain('vector-effect="non-scaling-stroke"');
  });

  it("accentue le point final de la période courante", () => {
    expect(render()).toContain('data-point="end"');
  });

  it("des graduations rondes en euros et les dates en bas", () => {
    const html = norm(render());
    // Le maximum est 287,05 € : l'axe monte à 400 € par pas de 100 €.
    for (const tick of ["0 €", "100 €", "200 €", "300 €"]) expect(html).toContain(`>${tick}</span>`);
    expect(html).toContain(">5 oct.</span>");
  });

  it("pas de période précédente : ni légende de comparaison, ni courbe en pointillé", () => {
    const html = render({ series: { current: weekSeries(), previous: [] } });
    expect(html).not.toContain('data-series="previous"');
    expect(html).not.toContain("Les 7 jours d&#x27;avant");
    expect(html).toContain("Cette période");
  });

  it("la légende de comparaison est un bouton, nommé d'après la comparaison", () => {
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>(<span[^>]*><\/span>)Les 7 jours d&#x27;avant<\/button>/);
    expect(render({ comparisonLabel: "vs hier" })).toContain("Hier</button>");
  });

  it("une période précédente plus longue que la courante est rognée : ce qui n'a pas d'abscisse n'est pas tracé", () => {
    const longer = [...previousWeek(), bucket(7, { proposed: 99, revenueTtcCents: 999_999 })];
    const html = norm(render({ series: { current: weekSeries(), previous: longer } }));
    expect(html).not.toContain("5 000 €");
    expect(html).not.toContain("10 000 €");
  });

  it("une période précédente plus courte est tracée jusqu'où elle va", () => {
    const html = render({ series: { current: weekSeries(), previous: previousWeek().slice(0, 3) } });
    expect(html).toContain('data-series="previous"');
  });

  it("un seul point : un point accentué, pas de trait", () => {
    const html = render({ series: { current: [bucket(0, { revenueTtcCents: 900, proposed: 2 })], previous: [] } });
    expect(html).toContain('data-point="end"');
    expect(html).not.toContain('data-series="current"');
  });
});

describe("couleurs", () => {
  it("les traits et les points n'ont pas de variante « dark: » (lisibles sur carte claire comme sur fond sombre)", () => {
    expect(render()).not.toContain("dark:");
  });
});

describe("états vides honnêtes", () => {
  it("aucune tranche : un message, pas de graphique", () => {
    const html = render({ series: { current: [], previous: [] } });
    expect(html).toContain("Aucune donnée sur la période.");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<table");
  });

  it("des tranches sans rien dedans : pas de courbe plate qui ferait croire à une mesure", () => {
    const current = [0, 1, 2, 3].map((i) => bucket(i));
    const html = render({ series: { current, previous: [] } });
    expect(html).toContain("Aucune vente confirmée sur cette période : pas de chiffre d&#x27;affaires à tracer.");
    expect(html).not.toContain('data-series="current"');
    expect(html).not.toContain('data-point="end"');
  });

  it("rien cette fois-ci mais quelque chose avant : la période précédente reste visible, sans message", () => {
    const current = [0, 1, 2, 3].map((i) => bucket(i));
    const html = render({ series: { current, previous: previousWeek().slice(0, 4) } });
    expect(html).toContain('data-series="previous"');
    expect(html).not.toContain("pas de chiffre d&#x27;affaires à tracer");
  });
});

describe("lecture sans souris ni écran", () => {
  it("un tableau complet pour les lecteurs d'écran : une ligne par tranche, toutes les mesures", () => {
    const html = norm(render());
    // Dans un <div> « sr-only » : un <table> seul ignorerait la largeur de 1 px et ferait défiler la page.
    expect(html).toContain('<div class="sr-only" data-sr-table=""><table>');
    expect(html.match(/<tr>/g)).toHaveLength(1 + 7);
    for (const column of ["Période", "Conseils proposés", "Conseils acceptés", "Taux d&#x27;acceptation", "Chiffre d&#x27;affaires attribué TTC"]) {
      expect(html).toContain(`>${column}</th>`);
    }
    expect(html).toContain("Lundi 5 octobre");
    expect(html).toContain("287,05 €");
  });

  it("le taux d'un créneau sous 3 conseils tranchés est dit, pas remplacé par 0 %", () => {
    const html = render();
    expect(html).toContain("Pas de taux (moins de 3 conseils tranchés)");
  });

  it("la colonne de la période précédente porte le nom de la mesure et de la comparaison", () => {
    expect(render()).toContain("Chiffre d&#x27;affaires attribué, TTC : Les 7 jours d&#x27;avant");
    expect(render({ series: { current: weekSeries(), previous: [] } })).not.toContain("Les 7 jours d&#x27;avant");
  });

  it("sans taux, le tableau n'a pas de colonne de taux", () => {
    expect(render({ showAcceptanceRate: false })).not.toContain(">Taux d&#x27;acceptation</th>");
  });

  it("le tracé se parcourt au clavier et s'annonce ; une zone vocale prévient du point actif", () => {
    const html = render();
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="group"');
    expect(html).toContain("Flèches gauche et droite pour parcourir les points");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("touch-pan-y");
  });

  it("le dessin est caché aux lecteurs d'écran (le tableau le remplace)", () => {
    expect(render()).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("une légende figure dans le résumé : mesure, nombre de points et bornes", () => {
    expect(render()).toContain("de 5 oct. à 11 oct.");
  });

  it("la légende lue ne finit pas par deux points (« 11 oct.. »), en jours comme en semaines", () => {
    const day = render();
    expect(day).toContain("7 points, de 5 oct. à 11 oct.</figcaption>");
    expect(day).not.toContain("oct..");
    const weeks = Array.from({ length: 6 }, (_, i) => bucket(i, { revenueTtcCents: 100 * (i + 1), label: ["sem. du 31 août", "sem. du 7 sept.", "sem. du 14 sept.", "sem. du 21 sept.", "sem. du 28 sept.", "sem. du 5 oct."][i] }));
    const week = render({ granularity: "week", series: { current: weeks, previous: [] } });
    expect(week).toContain("par semaine : 6 points, de sem. du 31 août à sem. du 5 oct.</figcaption>");
    expect(week).not.toContain("..");
  });
});

describe("axe horizontal en semaines", () => {
  const labels = ["sem. du 31 août", "sem. du 7 sept.", "sem. du 14 sept.", "sem. du 21 sept.", "sem. du 28 sept.", "sem. du 5 oct."];
  const weeks = Array.from({ length: 6 }, (_, i) => bucket(i, { revenueTtcCents: 100 * (i + 1), label: labels[i] }));
  /** Les étiquettes écrites sous l'axe : les petits <span> positionnés en pourcentage. */
  const axis = (html: string) => [...html.matchAll(/<span class="absolute top-0 [^"]*"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]);

  it("écrit des étiquettes courtes (« 14 sept. »), sans « sem. du » : le titre dit déjà « par semaine »", () => {
    const html = render({ granularity: "week", series: { current: weeks, previous: [] } });
    expect(html).toContain("Chiffre d&#x27;affaires attribué, TTC, par semaine");
    expect(axis(html)).toEqual(["31 août", "7 sept.", "14 sept.", "21 sept.", "28 sept.", "5 oct."]);
  });

  it("le tableau pour les lecteurs d'écran garde les dates complètes (« Semaine du 31 août »)", () => {
    const html = render({ granularity: "week", series: { current: weeks, previous: [] } });
    expect(html).toContain("Semaine du 5 octobre");
  });

  it("en jours, les étiquettes restent celles de la série", () => {
    expect(axis(render())).toContain("5 oct.");
  });
});

describe("axe horizontal responsive", () => {
  it("sur 14 points : des étiquettes réservées au grand écran et d'autres au petit", () => {
    const current = Array.from({ length: 14 }, (_, i) => bucket(i, { revenueTtcCents: 100 * (i + 1) }));
    const html = render({ series: { current, previous: [] } });
    expect(html).toContain("max-sm:hidden");
    expect(html).toContain("sm:hidden");
  });

  it("les étiquettes du bord sont ancrées au bord (translateX(-0 %) à gauche, -100 % à droite)", () => {
    const html = render();
    expect(html).toContain("translateX(-0%)");
    expect(html).toContain("translateX(-100%)");
  });
});
