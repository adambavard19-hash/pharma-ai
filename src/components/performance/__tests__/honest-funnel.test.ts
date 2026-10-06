import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FunnelStats, Metric, RateMetric, RevenueStats } from "@/core/performance/types";
import { HonestFunnel } from "../honest-funnel";

/**
 * L'entonnoir honnête, rendu sans navigateur : ce que le titulaire lit. Chaque
 * segment a son libellé et son chiffre ; l'entonnoir compte des CONSEILS
 * (« conseils achetés »), « ventes confirmées » ne s'écrit que côté caisse, où
 * l'on compte des tickets ; « acceptés non confirmés » et « refusés par le
 * patient » se dessinent à part.
 */

const metric = (value: number, previous = 0): Metric => ({ value, previous, deltaPct: null, trend: value === 0 && previous === 0 ? "none" : "up" });
const rate = (value: number | null): RateMetric => ({ value, previous: null, deltaPoints: null, trend: "none" });

/** 34 proposés = 21 acceptés + 5 retirés + 4 sans réponse + 4 en attente ; 21 acceptés = 8 achetés + 11 non confirmés + 2 refusés. */
const funnel = (overrides: Partial<FunnelStats> = {}): FunnelStats => ({
  proposed: metric(34),
  pending: 4,
  accepted: metric(21),
  declinedByPatient: 2,
  removedByTeam: 5,
  unanswered: 4,
  purchased: metric(8),
  acceptedNotConfirmed: 11,
  acceptanceRate: rate(21 / 30),
  conversionRate: rate(8 / 21),
  ...overrides,
});

const revenue = (overrides: Partial<RevenueStats> = {}): RevenueStats => ({
  confirmedTtcCents: metric(28700),
  confirmedSales: metric(6),
  pricedLines: 9,
  unpricedLines: 0,
  unitsSold: 11,
  averageBasketCents: 4783,
  previousAverageBasketCents: null,
  ...overrides,
});

const render = (f: FunnelStats = funnel(), r: RevenueStats = revenue()) => renderToStaticMarkup(createElement(HonestFunnel, { funnel: f, revenue: r }));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ");

describe("l'entonnoir honnête : le cas plein", () => {
  const shown = text(render());

  it("montre les trois étapes avec leurs chiffres", () => {
    expect(shown).toContain("Conseils proposés 34");
    expect(shown).toContain("Conseils acceptés 21");
    expect(shown).toContain("Conseils achetés 8");
  });

  it("un mot, une unité : l'étage 3 et son segment disent « conseils achetés » ; « ventes confirmées » (6 tickets) n'existe que côté caisse", () => {
    // Deux fois « Conseils achetés 8 » : le segment de l'étage « acceptés » et l'étage 3 lui-même.
    expect(shown.match(/Conseils achetés 8/g)).toHaveLength(2);
    // Une seule fois « Ventes confirmées », avec le nombre de tickets (6), jamais celui des conseils achetés (8).
    expect(shown.match(/Ventes confirmées/g)).toHaveLength(1);
    expect(shown).toContain("Ventes confirmées 6");
    expect(shown).not.toContain("Ventes confirmées 8");
    expect(shown).not.toContain("Tickets de vente");
  });

  it("dit où vont les 34 conseils proposés : chaque segment a son libellé et son chiffre, et le total retombe juste", () => {
    expect(shown).toContain("Acceptés 21");
    expect(shown).toContain("Retirés par l'équipe 5");
    expect(shown).toContain("Sans réponse 4");
    expect(shown).toContain("En attente (moins de 24 h) 4");
    expect(21 + 5 + 4 + 4).toBe(34);
  });

  it("dessine à part les acceptés non confirmés et les refusés par le patient", () => {
    expect(shown).toContain("Acceptés non confirmés 11");
    expect(shown).toContain("Refusés par le patient 2");
    expect(shown).toContain("Conseils achetés 8");
    expect(8 + 11 + 2).toBe(21);

    const html = render();
    const classOf = (segment: string) => new RegExp(`data-segment="${segment}" class="([^"]*)"`).exec(html)?.[1];
    const notConfirmed = classOf("notConfirmed");
    const declined = classOf("declined");
    const confirmed = classOf("confirmed");
    expect(notConfirmed).toBeTruthy();
    expect(declined).toBeTruthy();
    expect(confirmed).toBeTruthy();
    // trois apparences différentes : plein (achetés), hachures grises (non confirmés), hachures et contour rouges (refusés)
    expect(new Set([notConfirmed, declined, confirmed]).size).toBe(3);
    expect(notConfirmed).toContain("repeating-linear-gradient");
    expect(declined).toContain("repeating-linear-gradient");
    expect(confirmed).not.toContain("repeating-linear-gradient");
  });

  it("le succès n'est jamais dessiné en ambre, la couleur d'alerte : plein et vert pour les conseils achetés, rouge pour les refus du patient", () => {
    const html = render();
    const classOf = (segment: string) => new RegExp(`data-segment="${segment}" class="([^"]*)"`).exec(html)?.[1] ?? "";
    expect(classOf("confirmed")).toContain("success");
    expect(classOf("declined")).toContain("danger");
    expect(classOf("declined")).toContain("border-danger");
    for (const key of ["accepted", "removed", "unanswered", "pending", "confirmed", "notConfirmed", "declined"]) {
      expect(classOf(key), key).not.toMatch(/warning|accent/);
    }
  });

  it("chacune des sept pastilles (et chaque segment) a sa propre apparence : aucune ne se confond avec une autre", () => {
    const html = render();
    const barClass = (segment: string) => new RegExp(`data-segment="${segment}" class="([^"]*)"`).exec(html)?.[1];
    const keys = ["accepted", "removed", "unanswered", "pending", "confirmed", "notConfirmed", "declined"];
    const bars = keys.map(barClass);
    expect(bars.every(Boolean)).toBe(true);
    expect(new Set(bars).size).toBe(7);

    // La pastille de la légende : le petit carré écrit juste avant le libellé du segment.
    const plainHtml = html.replace(/&#x27;/g, "'");
    const labels = ["Acceptés", "Retirés par l'équipe", "Sans réponse", "En attente \\(moins de 24 h\\)", "Conseils achetés", "Acceptés non confirmés", "Refusés par le patient"];
    const swatches = labels.map((label) => new RegExp(`<span class="size-2.5 shrink-0 rounded-\\[3px\\] ([^"]*)" aria-hidden="true"></span><span>${label}</span>`).exec(plainHtml)?.[1]);
    expect(swatches.every(Boolean)).toBe(true);
    expect(new Set(swatches).size).toBe(7);
    // la pastille de la légende et le segment dessiné sont la même apparence
    swatches.forEach((swatch, index) => expect(swatch).toBe(bars[index]));
  });

  it("« sans réponse » se détache de la piste claire : fond ink-300 au moins, avec un contour", () => {
    const html = render();
    const unanswered = /data-segment="unanswered" class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(unanswered).toMatch(/\bbg-ink-300\b/);
    expect(unanswered).toMatch(/\bborder\b/);
    expect(unanswered).not.toMatch(/\bbg-ink-(50|100|200)\b/);
  });

  it("donne aux segments une largeur proportionnelle à leur effectif", () => {
    const html = render();
    expect(html).toMatch(/data-segment="accepted"[^>]*style="flex-grow:21;/);
    expect(html).toMatch(/data-segment="removed"[^>]*style="flex-grow:5;/);
    expect(html).toMatch(/data-segment="unanswered"[^>]*style="flex-grow:4;/);
    expect(html).toMatch(/data-segment="pending"[^>]*style="flex-grow:4;/);
    expect(html).toMatch(/data-segment="notConfirmed"[^>]*style="flex-grow:11;/);
    expect(html).toMatch(/data-segment="declined"[^>]*style="flex-grow:2;/);
  });

  it("règle la largeur des étapes sur celle des proposés (21 sur 34 = 61,8 %, 8 sur 34 = 23,5 %)", () => {
    const html = render();
    expect(html).toContain("width:100%");
    expect(html).toContain("width:61.8%");
    expect(html).toContain("width:23.5%");
  });

  it("calcule les taux sans les conseils en attente : 21 ÷ (34 − 4) = 70 %, 8 ÷ 21 = 38 %", () => {
    expect(shown).toContain("Taux d'acceptation 70 %");
    expect(shown).toContain("38 % des conseils acceptés");
  });

  it("explique les 4 conseils en attente et ne les compte pas encore dans le taux", () => {
    expect(shown).toContain("4 conseils proposés depuis moins de 24 h attendent encore une décision : ils ne comptent pas encore dans le taux.");
  });

  it("garde le chiffre d'affaires à part, avec sa date de référence", () => {
    expect(shown).toContain("Côté caisse");
    expect(shown).toContain("Compté à la date de la vente, pas à la date du conseil");
    expect(shown).toContain("Chiffre d'affaires attribué 287,00 € TTC");
    expect(shown).toContain("Ventes confirmées 6");
    expect(shown).toContain("Panier moyen 47,83 €");
  });

  it("ne dit jamais « vendu » d'un conseil seulement accepté", () => {
    expect(shown).not.toMatch(/vendu/i);
    // « confirmé(e)(s) » ne qualifie que la vente (ou les acceptés qui NE le sont PAS) : jamais un conseil accepté
    expect(shown).not.toMatch(/(?<!ventes? |non )confirmé/i);
    expect(shown).not.toMatch(/accepté[s]? confirmé/i);
  });
});

describe("l'entonnoir honnête : les cas particuliers", () => {
  it("dit qu'un conseil accepté n'est pas une vente quand aucune vente n'est confirmée", () => {
    const shown = text(render(funnel({ purchased: metric(0), acceptedNotConfirmed: 19, conversionRate: rate(0) })));
    expect(shown).toContain("Conseils achetés 0");
    expect(shown).toContain("Un conseil accepté n'est pas une vente : aucun conseil acheté n'est enregistré pour l'instant.");
    expect(shown).toContain("0 % des conseils acceptés");
  });

  it("dit que les acceptés non confirmés ne font pas de chiffre d'affaires", () => {
    expect(text(render())).toContain("Les acceptés non confirmés n'ont pas de vente enregistrée : ils ne font pas de chiffre d'affaires.");
  });

  it("n'écrit rien d'inventé quand aucun conseil n'est accepté", () => {
    const shown = text(
      render(funnel({ accepted: metric(0), purchased: metric(0), declinedByPatient: 0, acceptedNotConfirmed: 0, removedByTeam: 26, unanswered: 4, pending: 4, acceptanceRate: rate(0), conversionRate: rate(null) })),
    );
    expect(shown).toContain("Aucun conseil accepté pour l'instant.");
    expect(shown).toContain("Taux d'acceptation 0 %");
    expect(shown).not.toContain("des conseils acceptés");
  });

  it("n'invente pas de taux quand rien n'est tranché (tout est en attente)", () => {
    const shown = text(
      render(funnel({ proposed: metric(3), pending: 3, accepted: metric(0), purchased: metric(0), declinedByPatient: 0, removedByTeam: 0, unanswered: 0, acceptedNotConfirmed: 0, acceptanceRate: rate(null), conversionRate: rate(null) })),
    );
    expect(shown).toContain("Taux d'acceptation : pas encore de conseil tranché");
    expect(shown).toContain("3 conseils proposés depuis moins de 24 h attendent encore une décision");
    expect(shown).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("accorde le singulier : un seul conseil en attente", () => {
    const shown = text(render(funnel({ proposed: metric(31), pending: 1, removedByTeam: 5, unanswered: 4 })));
    expect(shown).toContain("1 conseil proposé depuis moins de 24 h attend encore une décision : il ne compte pas encore dans le taux.");
  });

  it("n'écrit pas la ligne « en attente » quand rien n'attend", () => {
    const html = render(funnel({ proposed: metric(30), pending: 0 }));
    expect(text(html)).not.toContain("En attente");
    expect(html).not.toContain('data-segment="pending"');
  });

  it("prévient quand les conseils sont trop peu nombreux pour les pourcentages", () => {
    const few = text(render(funnel({ proposed: metric(4), pending: 0, accepted: metric(2), removedByTeam: 1, unanswered: 1, purchased: metric(1), declinedByPatient: 0, acceptedNotConfirmed: 1, acceptanceRate: rate(0.5), conversionRate: rate(0.5) })));
    expect(few).toContain("Peu de conseils sur cette période");
    expect(text(render())).not.toContain("Peu de conseils sur cette période");
  });

  it("le seuil « peu de conseils » est à 10 : 9 conseils proposés préviennent, 10 non", () => {
    const nine = text(render(funnel({ proposed: metric(9), pending: 0, accepted: metric(4), removedByTeam: 3, unanswered: 2, purchased: metric(2), declinedByPatient: 0, acceptedNotConfirmed: 2 })));
    const ten = text(render(funnel({ proposed: metric(10), pending: 0, accepted: metric(4), removedByTeam: 3, unanswered: 3, purchased: metric(2), declinedByPatient: 0, acceptedNotConfirmed: 2 })));
    expect(nine).toContain("Peu de conseils sur cette période");
    expect(ten).not.toContain("Peu de conseils sur cette période");
  });

  it("dit l'état vide honnêtement, sans barre ni taux, mais garde le côté caisse", () => {
    const empty = funnel({ proposed: metric(0), pending: 0, accepted: metric(0), purchased: metric(0), declinedByPatient: 0, removedByTeam: 0, unanswered: 0, acceptedNotConfirmed: 0, acceptanceRate: rate(null), conversionRate: rate(null) });
    const html = render(empty, revenue({ confirmedTtcCents: metric(0), confirmedSales: metric(0), pricedLines: 0, averageBasketCents: null }));
    const shown = text(html);
    expect(shown).toContain("PharmaBoost n'a encore rien proposé à votre équipe sur cette période.");
    expect(shown).not.toContain("Taux d'acceptation");
    expect(html).not.toContain("data-segment");
    expect(shown).toContain("Chiffre d'affaires attribué 0,00 € TTC");
    expect(shown).toContain("Panier moyen —");
  });

  it("garde le côté caisse quand des ventes d'anciens conseils arrivent sans nouveau conseil", () => {
    const empty = funnel({ proposed: metric(0), pending: 0, accepted: metric(0), purchased: metric(0), declinedByPatient: 0, removedByTeam: 0, unanswered: 0, acceptedNotConfirmed: 0, acceptanceRate: rate(null), conversionRate: rate(null) });
    const shown = text(render(empty, revenue()));
    expect(shown).toContain("Chiffre d'affaires attribué 287,00 € TTC");
    expect(shown).toContain("PharmaBoost n'a encore rien proposé");
  });

  it("dit que les lignes de vente sans prix ne font aucun chiffre d'affaires (des lignes, pas des ventes)", () => {
    expect(text(render(funnel(), revenue({ unpricedLines: 3 })))).toContain("3 lignes de vente n'ont pas de prix saisi : aucun chiffre d'affaires n'est compté pour elles.");
    expect(text(render(funnel(), revenue({ unpricedLines: 1 })))).toContain("1 ligne de vente n'a pas de prix saisi : aucun chiffre d'affaires n'est compté pour elle.");
    expect(text(render())).not.toContain("sans prix");
    expect(text(render())).not.toContain("pas de prix");
    expect(text(render(funnel(), revenue({ unpricedLines: 3 })))).not.toMatch(/comptées? comme ventes?/);
  });

  it("garde chaque barre dans son cadre même si les chiffres débordent (jamais plus de 100 %)", () => {
    const html = render(funnel({ accepted: metric(50) }));
    expect(html).not.toMatch(/width:(10[1-9]|1[1-9]\d|[2-9]\d\d)(\.\d+)?%/);
  });

  it("garde les barres lisibles aux lecteurs d'écran par le texte : les barres sont décoratives", () => {
    const html = render();
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<ol/);
  });
});
