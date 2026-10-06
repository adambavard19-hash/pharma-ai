import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProductRow } from "@/core/performance/types";
import { ProductsTable } from "../products-table";

/**
 * Les produits en tête : le tableau (carte large) et les cartes (carte étroite)
 * montrent les mêmes chiffres ; une ligne vendue sans prix ne fait pas de
 * chiffre d'affaires et le dit.
 */

const product = (overrides: Partial<ProductRow> & Pick<ProductRow, "key" | "label" | "category">): ProductRow => ({
  proposed: 0,
  accepted: 0,
  purchased: 0,
  unitsSold: 0,
  revenueTtcCents: 0,
  acceptanceRate: null,
  ...overrides,
});

const PRODUCTS: ProductRow[] = [
  product({ key: "p:1", label: "Magnésium B6 Biogaran", category: "MAGNESIUM", proposed: 12, accepted: 9, purchased: 6, unitsSold: 7, revenueTtcCents: 6300, acceptanceRate: 0.75 }),
  product({ key: "m:2", label: "Doliprane 1000 mg", category: "MEDICAMENT", proposed: 20, accepted: 15, purchased: 4, unitsSold: 4, revenueTtcCents: 2400, acceptanceRate: 0.75 }),
  product({ key: "p:3", label: "Crème Cicalfate", category: "DERMATOLOGIE", proposed: 8, accepted: 3, purchased: 2, unitsSold: 2, revenueTtcCents: 0, acceptanceRate: 0.375 }),
  product({ key: "p:4", label: "Produit retiré du catalogue", category: "AUTRE", proposed: 2, accepted: 0, acceptanceRate: null }),
];

const render = (products: ProductRow[] = PRODUCTS) =>
  renderToStaticMarkup(createElement(ProductsTable, { products }))
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ");
const plain = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const tablePart = (markup: string) => /<table[\s\S]*<\/table>/.exec(markup)?.[0] ?? "";
const cardsPart = (markup: string) => /<ul class="divide-y[\s\S]*<\/ul>/.exec(markup)?.[0] ?? "";
const rows = (markup: string) => [...tablePart(markup).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]).slice(1);

describe("les produits en tête : le tableau", () => {
  const markup = render();
  const table = tablePart(markup);

  it("a six colonnes aux en-têtes clairs, et un titre de tableau pour les lecteurs d'écran", () => {
    const headers = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((match) => plain(match[1]).trim());
    expect(headers).toEqual(["Produit", "Proposés", "Acceptés", "Taux (sur les conseils tranchés)", "Unités vendues", "CA TTC"]);
    expect(table).toContain("<caption");
    expect(plain(table)).toContain("Les produits les plus conseillés, classés par chiffre d'affaires attribué.");
  });

  it("garde l'ordre reçu (le calcul est maître du classement) et une ligne par produit", () => {
    const body = rows(markup);
    expect(body).toHaveLength(4);
    expect(plain(body[0])).toContain("Magnésium B6 Biogaran");
    expect(plain(body[1])).toContain("Doliprane 1000 mg");
    expect(plain(body[2])).toContain("Crème Cicalfate");
    expect(plain(body[3])).toContain("Produit retiré du catalogue");
  });

  it("écrit l'univers sous le nom, avec les libellés du catalogue", () => {
    const body = rows(markup).map(plain);
    expect(body[0]).toContain("Magnésium");
    expect(body[1]).toContain("Médicaments conseil");
    expect(body[2]).toContain("Dermatologie");
    expect(body[3]).toContain("Autres produits de conseil");
  });

  it("écrit les chiffres de chaque ligne : proposés, acceptés, taux, unités, chiffre d'affaires exact", () => {
    const first = plain(rows(markup)[0]);
    expect(first).toContain("12 9 75 % 7 63,00 €");
    const second = plain(rows(markup)[1]);
    expect(second).toContain("20 15 75 % 4 24,00 €");
  });

  it("dit « Prix non saisi » plutôt que 0,00 € pour une ligne vendue sans prix", () => {
    const third = plain(rows(markup)[2]);
    expect(third).toContain("8 3 38 % 2 Prix non saisi");
    expect(third).not.toContain("0,00 €");
  });

  it("met un tiret (et le dit aux lecteurs d'écran) quand il n'y a ni taux, ni vente", () => {
    const fourth = rows(markup)[3];
    expect(plain(fourth)).toContain("2 0 — Taux non calculable — — Aucune vente confirmée");
    expect(fourth).toContain("Aucune vente confirmée");
    expect(fourth).toContain("Taux non calculable");
  });

  it("dessine un mini-trait de chiffre d'affaires proportionnel au plus gros : 100 %, puis 2 400 ÷ 6 300 = 38,1 %", () => {
    const widths = [...table.matchAll(/style="width:([\d.]+)%"/g)].map((match) => Number(match[1]));
    expect(widths).toEqual([100, 38.1]);
  });

  it("ne tronque pas sans rien dire : le nom complet est dans l'infobulle", () => {
    expect(table).toContain('title="Produit retiré du catalogue"');
  });
});

describe("les produits en tête : les cartes (carte étroite)", () => {
  const markup = render();
  const cards = cardsPart(markup);
  const items = [...cards.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) => plain(match[1]));

  it("montre une carte par produit, avec les mêmes chiffres que le tableau", () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("Magnésium B6 Biogaran");
    expect(items[0]).toContain("Magnésium");
    expect(items[0]).toContain("63,00 €");
    expect(items[0]).toContain("Proposés 12 Acceptés 9 Taux 75 % Vendus 7");
    expect(items[1]).toContain("24,00 €");
    expect(items[1]).toContain("Proposés 20 Acceptés 15 Taux 75 % Vendus 4");
  });

  it("dit « Prix non saisi » et met des tirets là où il n'y a rien", () => {
    expect(items[2]).toContain("Prix non saisi");
    expect(items[2]).not.toContain("0,00 €");
    expect(items[3]).toContain("Proposés 2 Acceptés 0 Taux — Taux non calculable Vendus —");
  });
});

describe("les produits en tête : mise en page et accessibilité", () => {
  it("choisit tableau ou cartes selon la largeur de la carte, pas celle de l'écran", () => {
    const markup = render();
    expect(markup).toContain("@container");
    expect(markup).toMatch(/<div class="hidden @xl:block">/);
    expect(markup).toMatch(/<ul class="[^"]*@xl:hidden">/);
  });

  it("explique les deux calendriers sous la liste", () => {
    expect(plain(render())).toContain("Les conseils sont comptés à leur date de proposition, les ventes et le chiffre d'affaires à la date de la vente.");
  });

  it("dit que le taux ne compte pas les conseils proposés depuis moins de 24 h (la ligne n'affiche pas ce dénominateur), une fois sous la liste", () => {
    // 10 proposés dont 2 en attente : 4 acceptés sur 8 tranchés = 50 %, que le lecteur ne retrouve pas en divisant 4 par 10.
    const waiting = [product({ key: "p:1", label: "Flore Équilibre", category: "VITAMINES", proposed: 10, accepted: 4, acceptanceRate: 0.5 })];
    const shown = plain(render(waiting));
    expect(shown).toContain("Flore Équilibre");
    expect(shown).toContain("10 4 50 %");
    expect(shown).toContain("Taux (sur les conseils tranchés)");
    expect(shown.match(/Les conseils proposés depuis moins de 24 h ne comptent pas dans le taux\./g)).toHaveLength(1);
  });

  it("la note du taux ne s'écrit pas quand il n'y a aucun produit", () => {
    expect(plain(render([]))).not.toContain("ne comptent pas dans le taux");
  });

  it("dit l'état vide honnêtement, sans tableau", () => {
    const markup = render([]);
    expect(plain(markup)).toContain("Aucun produit conseillé sur cette période.");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("<li");
  });

  it("ne rend ni NaN, ni undefined, ni Infinity, même sans aucun chiffre d'affaires", () => {
    const flat = PRODUCTS.map((item) => ({ ...item, revenueTtcCents: 0, unitsSold: 0, acceptanceRate: null }));
    const markup = render(flat);
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    expect(markup).not.toContain("style=\"width:");
  });

  it("garde un montant en euros, jamais un arrondi caché : 12 345,67 € reste 12 345,67 €", () => {
    const big = [product({ key: "p:9", label: "Gros produit", category: "SOINS", proposed: 1, accepted: 1, purchased: 1, unitsSold: 1, revenueTtcCents: 1234567, acceptanceRate: 1 })];
    expect(plain(render(big))).toContain("12 345,67 €");
  });
});
