import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BANNER, withCount } from "../../../../../agent/src/banner-design";
import { bannerPreviewHtml } from "../../../../../agent/src/banner-preview";
import { arc, bannerMockCss, bannerSubtitle, BannerMock, stockText } from "../_components/banner-mock";

const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("la bannière des visuels du site : le dessin de la bannière du poste de caisse", () => {
  it("prend chaque couleur dans BANNER, sans en retaper une seule", () => {
    const css = bannerMockCss();
    for (const [key, value] of Object.entries(BANNER.colors)) {
      if (key === "cardAlpha") continue;
      expect(css).toContain(`--pbm-${key}:${value};`);
    }
    // La transparence de la carte, comme sur Windows et dans l'aperçu Mac.
    expect(css).toContain(`${Math.round(BANNER.colors.cardAlpha * 100)}%`);
  });

  it("reprend les phrases de la bannière : Pour, pastilles, Vendu / Non vendu, e-mail du patient, Vente terminée", () => {
    const html = renderToStaticMarkup(
      createElement(BannerMock, {
        subject: "DOXYCYCLINE 100 mg",
        items: [
          { name: "Crème solaire SPF 50+", price: "16,90 €", drug: "DOXYCYCLINE 100 mg", stock: "IN_STOCK", quantity: 18 },
          { name: "Flore Équilibre 10 milliards", price: "14,90 €", drug: "DOXYCYCLINE 100 mg", challenge: true, shortDate: "30/11/26", stock: "LOW_STOCK", quantity: 3 },
        ],
      }),
    );
    const text = visible(html);
    const T = BANNER.text;
    for (const phrase of [T.brand, withCount(T.forSaleMany, 2), `${T.forDrug}DOXYCYCLINE 100 mg`, T.challenge, `${T.shortDate} 30/11/26`, `${T.inStock} · 18`, `${T.lowStock} · 3`, T.sold, T.notSold, T.emailAdd, T.detail, T.finish]) {
      expect(text).toContain(phrase.trim());
    }
    // Une image qui se lit : le lecteur d'écran entend un résumé, marqué « exemple ».
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="Bannière PharmaBoost, exemple : 2 conseils pour cette délivrance\./);
  });

  it("dessine la même mascotte que l'aperçu Mac de la bannière (mêmes arcs, mêmes couleurs)", () => {
    const html = renderToStaticMarkup(createElement(BannerMock, { subject: "X", items: [{ name: "Produit" }] }));
    const preview = bannerPreviewHtml();
    for (const path of [arc(50, 44, 41, 35, 192, 156), arc(38, 43, 5.5, 5, 190, 160), arc(62, 43, 5.5, 5, 190, 160)]) {
      expect(preview).toContain(path);
      expect(html).toContain(path);
    }
  });

  it("dit ce que dit la bannière Windows sous « PharmaBoost » (Subtitle dans notice-host.ts)", () => {
    const T = BANNER.text;
    expect(bannerSubtitle([{ name: "A" }], [], [])).toBe(T.forSaleOne);
    expect(bannerSubtitle([{ name: "A" }, { name: "B", outcome: "SOLD" }], [], [])).toBe(`${T.duringSale}  1/2`);
    expect(bannerSubtitle([], [{ text: "?", choices: [] }], [])).toBe(T.questionSub);
    expect(bannerSubtitle([], [], ["Mise en garde"])).toBe(T.readFirst);
    expect(stockText("OUT_OF_STOCK", 0)).toBe(T.outOfStock);
    expect(stockText("UNKNOWN")).toBe(T.unknownStock);
  });
});
