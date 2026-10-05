import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePublicPricing } from "@/core/pricing/official-offer";

vi.mock("server-only", () => ({}));

const { PricingSection } = await import("../_components/pricing-section");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("la section tarif du site", () => {
  const html = renderToStaticMarkup(createElement(PricingSection, { pricing: resolvePublicPricing(null) }));
  const t = text(html);

  it("montre les deux formules avec leurs montants exacts", () => {
    expect(t).toContain("99 € HT / mois");
    expect(t).toContain("390 € HT, une seule fois");
    expect(t).toContain("1 188 € HT / an");
    expect(t).toContain("Sans engagement");
    expect(t).toContain("Offerte");
  });

  it("la mensuelle affiche à côté de son tarif ce que coûte une année (12 × 99 + 390 = 1 578 €), pour la comparer à l'annuelle ; l'annuelle n'affiche plus « par officine · soit 99 € / mois »", () => {
    expect(t).toContain("99 € HT / mois (1 578 €) sur un an, mise en service comprise");
    expect(t).not.toContain("soit 99");
    const monthlyCard = t.slice(t.indexOf("Mensuelle"), t.indexOf("La plus avantageuse"));
    const annualCard = t.slice(t.indexOf("La plus avantageuse"));
    expect(monthlyCard).toContain("par officine");
    expect(annualCard).not.toContain("par officine");
  });

  it("le total de la mensuelle suit les montants publiés (12 mois + mise en service)", () => {
    const custom = text(renderToStaticMarkup(createElement(PricingSection, { pricing: resolvePublicPricing({ name: "X", monthlyPriceCents: 10_900, annualPriceCents: 130_800, setupFeeCents: 45_000, annualSetupFeeCents: 0 }) })));
    expect(custom).toContain("(1 758 €"); // 12 × 109 + 450
  });

  it("n'affiche ni la ligne « Engagement 12 mois » de l'annuelle, ni la ligne « Postes » des deux formules", () => {
    expect(t).not.toContain("12 mois");
    expect(t).not.toContain("Tous les postes de l'officine");
    expect(t).not.toContain("Postes");
    // Il ne reste qu'une ligne « Engagement » : celle de la mensuelle, « Sans engagement ».
    expect(t.match(/Engagement/g)).toHaveLength(1);
  });

  it("pose le mot de réassurance juste au-dessus des deux offres : la promesse d'abord, la précision ensuite, plus discrète", () => {
    const promise = "Rassurez-vous, l’objectif est simple : que PharmaBoost vous rapporte bien plus qu’il ne vous coûte.";
    const detail = "Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.";
    expect(t).toContain(promise);
    expect(t).toContain(detail);
    // Dans l'ordre : le titre de la section, la promesse, la précision, puis les offres.
    expect(t.indexOf("Tous les postes inclus")).toBeLessThan(t.indexOf(promise));
    expect(t.indexOf(promise)).toBeLessThan(t.indexOf(detail));
    expect(t.indexOf(detail)).toBeLessThan(t.indexOf("Mensuelle"));
    // La promesse ressort davantage : plus grande et plus foncée que la précision.
    const promiseTag = html.slice(html.lastIndexOf("<p", html.indexOf("Rassurez-vous")), html.indexOf("Rassurez-vous"));
    const detailTag = html.slice(html.lastIndexOf("<p", html.indexOf("Plus de conseils")), html.indexOf("Plus de conseils"));
    expect(promiseTag).toContain("font-semibold");
    expect(promiseTag).toContain("text-text-primary");
    expect(promiseTag).toContain("md:text-[26px]");
    expect(detailTag).toContain("text-text-tertiary");
    expect(detailTag).toContain("text-[14px]");
    expect(detailTag).not.toContain("font-semibold");
  });

  it("met l'annuelle en valeur, et elle seule", () => {
    expect(t.match(/La plus avantageuse/g)).toHaveLength(1);
    expect(t.indexOf("La plus avantageuse")).toBeGreaterThan(t.indexOf("Mensuelle"));
    expect(t).toContain("au lieu de 390 € HT en formule mensuelle");
  });

  it("chaque formule mène au parcours d'abonnement avec sa formule, et la démo reste proposée", () => {
    expect(html).toContain('href="/decouvrir/abonnement?formule=mensuelle"');
    expect(html).toContain('href="/decouvrir/abonnement?formule=annuelle"');
    expect(t.match(/Choisir cette formule/g)).toHaveLength(2);
    expect(html).toContain('href="/decouvrir/demo"');
    expect(t).toContain("Réserver une démo");
  });

  it("n'invente aucun autre frais, aucune remise, aucun essai", () => {
    for (const forbidden of ["69", "129", "249", "499", "premier mois", "essai", "remise", "réduction", "gratuit"]) {
      expect(t.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("affiche l'offre de la console quand elle est complète", () => {
    const custom = renderToStaticMarkup(createElement(PricingSection, { pricing: resolvePublicPricing({ name: "X", monthlyPriceCents: 10_900, annualPriceCents: 130_800, setupFeeCents: 45_000, annualSetupFeeCents: 0 }) }));
    const c = text(custom);
    expect(c).toContain("109 € HT / mois");
    expect(c).toContain("1 308 € HT / an");
    expect(c).toContain("450 € HT, une seule fois");
  });
});
