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

  it("la copie du site public (public/site/banniere-demo.html) est la même page : le robot animé de la page d'accueil est à jour", () => {
    const site = readFileSync(join(process.cwd(), "public/site/banniere-demo.html"), "utf8");
    expect(site === html).toBe(true);
  });

  it("sait s'intégrer au site : fond transparent, scénario qui recommence tout seul, ne joue que lorsqu'elle est à l'écran", () => {
    expect(html).toContain('classList.add("integre")');
    expect(html).toContain("html.integre, html.integre body { background: transparent; }");
    expect(html).toContain("if (EMBED) step(29000");
    expect(html).toContain('"pb-visible"');
    expect(html).toContain('"pb-hidden"');
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
