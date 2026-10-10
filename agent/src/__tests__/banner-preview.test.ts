import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNER } from "../banner-design";
import { bannerPreviewHtml } from "../banner-preview";
import { NOTICE_HOST_CSHARP } from "../notice-host";

describe("l'aperçu de la bannière pour Mac", () => {
  const html = bannerPreviewHtml();

  it("le fichier livré (agent/apercu/banniere.html) est exactement ce que `npm run apercu:banniere` produit", () => {
    const shipped = readFileSync(join(process.cwd(), "agent/apercu/banniere.html"), "utf8");
    expect(shipped === html).toBe(true);
  });

  it("est une page autonome : aucune ressource extérieure, aucune image à part", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(http/);
    expect(html).toContain("<title>Bannière PharmaBoost</title>");
  });

  it("reprend le design de la bannière Windows : mêmes couleurs, mêmes cotes, mêmes durées, mêmes phrases", () => {
    for (const [key, value] of Object.entries(BANNER.colors)) {
      if (key !== "cardAlpha") expect(html, key).toContain(`--${key}: ${value};`);
    }
    expect(html).toContain(JSON.stringify(BANNER.sizes));
    expect(html).toContain(JSON.stringify(BANNER.timing));
    expect(html).toContain(JSON.stringify(BANNER.text));
    for (const phrase of [BANNER.text.idle, BANNER.text.scanTitle, BANNER.text.doneTitle, BANNER.text.challenge, BANNER.text.shortDate, BANNER.text.inStock]) {
      expect(NOTICE_HOST_CSHARP).toContain(phrase);
    }
  });

  it("montre les six états de la maquette et un scénario complet, et dit honnêtement que ce n'est pas une capture de Windows", () => {
    for (const step of ["En attente", "Scan détecté", "Conseils disponibles", "Conseils ouverts", "Pendant la vente", "Vente terminée", "Scénario complet"]) expect(html).toContain(step);
    expect(html).toContain("ce n'est pas une capture de Windows");
  });

  it("respecte le mouvement réduit du système", () => {
    expect(html).toContain("prefers-reduced-motion");
  });
});
