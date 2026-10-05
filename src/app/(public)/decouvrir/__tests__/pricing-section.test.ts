import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePublicPricing } from "@/core/pricing/official-offer";

vi.mock("server-only", () => ({}));

const { PricingSection, SETUP_INCLUDES } = await import("../_components/pricing-section");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

describe("la section tarif du site : un seul abonnement", () => {
  const html = renderToStaticMarkup(createElement(PricingSection, { pricing: resolvePublicPricing(null) }));
  const t = text(html);

  it("dit un seul abonnement : 126 € HT par mois, engagement de 12 mois, mise en service de 290 € HT une seule fois", () => {
    expect(t).toContain("Un seul abonnement. Tout est inclus.");
    expect(t).toContain("126 € HT / mois");
    expect(t).toContain("Engagement de 12 mois");
    expect(t).toContain("290 € HT, une seule fois");
  });

  it("montre ce que comprend la mise en service, pour que le visiteur voie ce qu'il paie", () => {
    expect(SETUP_INCLUDES).toHaveLength(4);
    for (const item of ["Installation et configuration de PharmaBoost sur tous les postes de comptoir", "Paramétrage de l'officine et import du stock", "Tests de fonctionnement", "Formation de l'équipe"]) {
      expect(t).toContain(item);
    }
  });

  it("n'a plus de formule annuelle, ni de choix entre deux formules, ni d'ancien tarif", () => {
    for (const forbidden of ["annuelle", "1 188", "1 578", "La plus avantageuse", "Choisir cette formule", "Sans engagement", "99 €", "69 €", "premier mois", "essai", "gratuit"]) {
      expect(t.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(html.match(/<article/g)).toHaveLength(1);
  });

  it("annonce le parrainage : 20 % de moins par mois, 126 € deviennent 100,80 € HT, saisi à l'inscription", () => {
    expect(t).toContain("Parrainez un confrère : 20 % de moins par mois");
    expect(t).toContain("Au moment de votre inscription, indiquez la personne que vous parrainez");
    expect(t).toContain("vous ne payez plus 126 € mais 100,80 € HT par mois");
  });

  it("propose le simulateur, ouvert sur l'exemple de 200 clients par jour : 20 conseillés, 200 € par jour, 5 000 € par mois", () => {
    expect(t).toContain("Combien de clients passent chez vous chaque jour ?");
    expect(html).toContain('value="200"');
    expect(t).toContain("Clients conseillés (10 %) 20 par jour");
    expect(t).toContain("× 10 € par produit en moyenne 200 € par jour");
    expect(t).toContain("× 25 jours d'ouverture 5 000 € par mois");
    expect(t).toContain("Chiffre d'affaires supplémentaire estimé 5 000 € par mois");
  });

  it("dit que c'est une estimation, avec ses trois hypothèses, et la compare à l'abonnement", () => {
    expect(t).toContain("Estimation indicative : 10 % de vos clients prennent un produit conseillé, à 10 € en moyenne, sur 25 jours d'ouverture par mois. Ce n'est pas une promesse de résultat.");
    expect(t).toContain("Pour un abonnement de 126 € HT par mois.");
  });

  it("pose le mot de réassurance au-dessus : la promesse d'abord, plus grande et plus foncée que la précision", () => {
    const promise = "Rassurez-vous, l’objectif est simple : que PharmaBoost vous rapporte bien plus qu’il ne vous coûte.";
    const detail = "Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.";
    expect(t.indexOf(promise)).toBeGreaterThan(-1);
    expect(t.indexOf(promise)).toBeLessThan(t.indexOf(detail));
    expect(t.indexOf(detail)).toBeLessThan(t.indexOf("Combien de clients"));
    const promiseTag = html.slice(html.lastIndexOf("<p", html.indexOf("Rassurez-vous")), html.indexOf("Rassurez-vous"));
    const detailTag = html.slice(html.lastIndexOf("<p", html.indexOf("Plus de conseils")), html.indexOf("Plus de conseils"));
    expect(promiseTag).toContain("font-semibold");
    expect(promiseTag).toContain("md:text-[26px]");
    expect(detailTag).toContain("text-text-tertiary");
    expect(detailTag).not.toContain("font-semibold");
  });

  it("garde les deux appels à l'action : s'abonner, réserver une démo", () => {
    expect(html).toContain('href="/decouvrir/abonnement"');
    expect(html).toContain('href="/decouvrir/demo"');
    expect(html).not.toContain("formule=");
    expect(t).toContain("S'abonner");
    expect(t).toContain("Réserver une démo");
  });

  it("affiche l'offre de la console quand elle est complète, et le parrainage suit son prix", () => {
    const custom = text(renderToStaticMarkup(createElement(PricingSection, { pricing: resolvePublicPricing({ name: "Offre console", monthlyPriceCents: 15_000, setupFeeCents: 31_000 }) })));
    expect(custom).toContain("Offre console");
    expect(custom).toContain("150 € HT / mois");
    expect(custom).toContain("310 € HT, une seule fois");
    expect(custom).toContain("vous ne payez plus 150 € mais 120 € HT par mois");
    expect(custom).toContain("Pour un abonnement de 150 € HT par mois.");
  });
});
