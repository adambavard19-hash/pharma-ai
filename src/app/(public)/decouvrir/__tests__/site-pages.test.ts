import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter, SiteHeader } from "../_components/site-shell";
import { StockMarginVisual } from "../_components/visuals";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("la page « Qui sommes-nous » n'existe plus", () => {
  it("ni l'en-tête ni le pied de page n'y mènent", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    const footer = renderToStaticMarkup(createElement(SiteFooter, { contactEmail: "contact@exemple.fr" }));
    for (const html of [header, footer]) {
      expect(html).not.toContain("/decouvrir/equipe");
      expect(text(html)).not.toContain("Qui sommes-nous");
    }
    expect(text(header)).not.toMatch(/\bÉquipe\b/);
  });
});

describe("la section « Stock et marge »", () => {
  it("montre un autre produit que la crème solaire, avec son stock et sa marge d'exemple", () => {
    const html = renderToStaticMarkup(createElement(StockMarginVisual));
    const shown = text(html);
    expect(shown).toContain("Ultra-Levure 200 mg");
    expect(shown).toContain("Levure probiotique pendant un antibiotique");
    expect(shown).toContain("8,90 €");
    expect(shown).toContain("Marge 3,60 €");
    expect(shown).toContain("En stock · 29");
    expect(shown).toContain("exemple");
    expect(html).toContain("/site/produits/ultra-levure-200-mg.webp");
    expect(shown).not.toMatch(/solaire/i);
    expect(html).not.toContain("creme-solaire");
  });
});

describe("l'onglet « Affiliation » remplace « Devenir commercial »", () => {
  it("est dans le menu principal de l'en-tête (et donc le menu mobile) et dans le pied de page", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    const footer = renderToStaticMarkup(createElement(SiteFooter, { contactEmail: "contact@exemple.fr" }));
    const nav = header.match(/<nav[^>]*aria-label="Sections"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect(nav).toContain('href="/decouvrir/affiliation"');
    expect(text(nav)).toContain("Affiliation");
    expect(footer).toContain('href="/decouvrir/affiliation"');
    for (const html of [header, footer]) {
      expect(html).not.toContain("/decouvrir/commercial");
      expect(text(html)).not.toContain("Devenir commercial");
    }
  });
});
