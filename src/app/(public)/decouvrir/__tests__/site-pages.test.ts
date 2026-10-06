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
    expect(shown).toContain("Flore Équilibre 10 milliards");
    expect(shown).toContain("Ferments lactiques pendant un antibiotique");
    expect(shown).toContain("14,90 €");
    expect(shown).toContain("Marge 8,70 €");
    expect(shown).toContain("En stock · 29");
    expect(shown).toContain("exemple");
    expect(html).toContain("/site/produits/flore-equilibre-10-milliards.webp");
    expect(shown).not.toMatch(/solaire/i);
    expect(html).not.toContain("creme-solaire");
  });
});
