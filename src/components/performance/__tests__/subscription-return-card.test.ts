import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SubscriptionReturn, SubscriptionReturnHiddenReason } from "@/core/performance/types";
import { SubscriptionReturnCard } from "../subscription-return-card";

/**
 * La carte « retour sur abonnement » : le ratio ne s'affiche que quand il est
 * fiable ; sinon une ligne discrète dit ce qu'on attend, jamais un chiffre douteux.
 */

const render = (roi: SubscriptionReturn, audience: "owner" | "platform" = "owner") => renderToStaticMarkup(createElement(SubscriptionReturnCard, { roi, audience }));

/** Le texte rendu : sans balisage, espaces insécables normalisés, apostrophes rétablies. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const shown = (overrides: Partial<Extract<SubscriptionReturn, { status: "shown" }>> = {}): SubscriptionReturn => ({
  status: "shown",
  monthLabel: "octobre 2026",
  monthlyPriceHtCents: 12600,
  trialing: false,
  confirmedTtcCents: 63504,
  confirmedHtCents: 52920,
  confirmedLines: 14,
  pricedShare: 0.9286,
  ratio: 4.2,
  ratioLabel: "4,2 fois",
  sentence: "PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).",
  ...overrides,
});

const hidden = (reason: SubscriptionReturnHiddenReason, detail = "Détail interne"): SubscriptionReturn => ({ status: "hidden", reason, detail });

const barWidth = (html: string, bar: "subscription" | "confirmed") => html.match(new RegExp(`data-bar="${bar}"[^>]*style="width:(\\d+)%"`))?.[1];

describe("SubscriptionReturnCard : retour affiché", () => {
  it("dit le ratio, la phrase du contrat, le mois et les deux montants hors taxes", () => {
    const out = text(render(shown()));
    expect(out).toContain("Retour sur abonnement");
    expect(out).toContain("4,2 fois");
    expect(out).toContain("PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).");
    expect(out).toContain("Octobre 2026");
    expect(out).toContain("Votre abonnement 126,00 € HT");
    expect(out).toContain("Ventes confirmées 529,20 € HT");
  });

  it("précise que c'est toujours le mois en cours, du chiffre d'affaires hors taxes, pas un bénéfice, et sur quel volume", () => {
    const out = text(render(shown()));
    expect(out).toContain("Toujours le mois en cours, quelle que soit la période choisie.");
    expect(out).toContain("ce n'est pas un bénéfice");
    expect(out).toContain("Calculé sur 14 lignes de vente au prix connu (93 % des lignes confirmées).");
  });

  it("le volume dit ce qu'il compte : N lignes AU PRIX CONNU, et leur part parmi toutes les lignes confirmées (jamais « N lignes dont X % avec un prix »)", () => {
    // 10 lignes confirmées dont 9 au prix connu : le lecteur lit 9 lignes (pas 10), et 90 % des lignes confirmées (9 sur 10).
    const out = text(render(shown({ confirmedLines: 9, pricedShare: 0.9 })));
    expect(out).toContain("Calculé sur 9 lignes de vente au prix connu (90 % des lignes confirmées).");
    expect(out).not.toContain("dont 90 % avec un prix");
    expect(out).not.toContain("lignes de vente confirmées, dont");
  });

  it("une seule ligne s'écrit au singulier", () => {
    expect(text(render(shown({ confirmedLines: 1, pricedShare: 1 })))).toContain("Calculé sur 1 ligne de vente au prix connu (100 % des lignes confirmées).");
  });

  it("dessine les deux montants sur la même échelle (abonnement 24 %, ventes 100 %)", () => {
    const html = render(shown());
    expect(barWidth(html, "subscription")).toBe("24");
    expect(barWidth(html, "confirmed")).toBe("100");
  });

  it("sous 1, la carte le dit tel quel : « 0,6 fois », et la barre des ventes reste plus courte", () => {
    const html = render(shown({ monthlyPriceHtCents: 12600, confirmedHtCents: 7560, ratio: 0.6, ratioLabel: "0,6 fois", sentence: "PharmaBoost a généré 0,6 fois le montant de votre abonnement en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice)." }));
    expect(text(html)).toContain("0,6 fois");
    expect(barWidth(html, "subscription")).toBe("100");
    expect(barWidth(html, "confirmed")).toBe("60");
  });

  it("pendant l'essai, le dit", () => {
    expect(text(render(shown({ trialing: true })))).toContain("Période d'essai");
    expect(text(render(shown()))).not.toContain("Période d'essai");
  });

  it("donne une lecture accessible des deux barres", () => {
    expect(render(shown())).toContain('aria-label="Hors taxes, ce mois-ci : abonnement 126,00');
  });

  it("n'affiche aucune carte masquée quand le retour est affiché", () => {
    expect(render(shown())).toContain('data-state="roi-shown"');
    expect(render(shown())).not.toContain('data-state="roi-hidden"');
  });
});

describe("SubscriptionReturnCard : retour masqué", () => {
  const expectations: [SubscriptionReturnHiddenReason, string][] = [
    ["no_subscription", "il s'affichera dès qu'un abonnement sera actif sur votre officine."],
    ["no_price", "il s'affichera dès que le tarif de votre abonnement sera connu."],
    ["not_enough_sales", "il s'affichera dès que le mois comptera au moins 5 lignes de vente confirmées au prix connu."],
    ["prices_unreliable", "il s'affichera dès que presque toutes les lignes de vente confirmées du mois auront un prix saisi (au moins 90 %)."],
    ["no_data", "il s'affichera dès que des ventes confirmées seront enregistrées ce mois-ci."],
  ];

  it.each(expectations)("côté titulaire, %s : une ligne discrète dit ce qu'on attend, sans ratio ni détail interne", (reason, waiting) => {
    const html = render(hidden(reason), "owner");
    const out = text(html);
    expect(out).toContain("Retour sur abonnement :");
    expect(out).toContain(waiting);
    expect(out).not.toContain("fois");
    expect(out).not.toContain("Détail interne");
    expect(html).toContain('data-state="roi-hidden"');
    expect(html).not.toContain('data-bar=');
  });

  it("abonnement partagé, côté titulaire : dit pourquoi le retour n'est pas calculé, sans promettre qu'il s'affichera", () => {
    const html = render(hidden("shared_subscription", "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe."), "owner");
    const out = text(html);
    expect(out).toContain("Retour sur abonnement : il n'est pas calculé, car votre abonnement couvre plusieurs officines (le chiffre d'affaires d'une seule ne se compare pas au prix du groupe).");
    expect(out).not.toContain("s'affichera");
    expect(out).not.toContain("fois");
    expect(html).toContain('data-state="roi-hidden"');
    expect(html).not.toContain("data-bar=");
  });

  it("abonnement partagé, côté console : la raison du cœur est écrite telle quelle", () => {
    const detail = "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.";
    const out = text(render(hidden("shared_subscription", detail), "platform"));
    expect(out).toContain("Retour sur abonnement non mesurable");
    expect(out).toContain(detail);
  });

  it("côté console, la raison exacte est écrite", () => {
    const out = text(render(hidden("not_enough_sales", "Seulement 3 lignes confirmées au prix connu ce mois-ci (5 attendues)."), "platform"));
    expect(out).toContain("Retour sur abonnement non mesurable");
    expect(out).toContain("Seulement 3 lignes confirmées au prix connu ce mois-ci (5 attendues).");
  });
});
