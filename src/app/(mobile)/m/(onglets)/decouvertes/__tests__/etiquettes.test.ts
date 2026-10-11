import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Tout contenu commercial porte son étiquette à l'écran : « Sponsorisé » (campagne) ou « Partenaire » (marque). */
vi.mock("@/server/actions/mobile-discover", () => ({ trackSponsoredEventsAction: vi.fn(), toggleFavoriteAction: vi.fn(), requestInfoAction: vi.fn() }));

const { PartnerNewsRail } = await import("../_components/partner-news-rail");
const { BrandCard, LaunchCard, SponsoredHeroCard, TrainingCard } = await import("../_components/cards");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("étiquettes commerciales", () => {
  it("accueil : une campagne est « Sponsorisé », une nouveauté de marque « Partenaire »", () => {
    const html = renderToStaticMarkup(
      createElement(PartnerNewsRail, {
        items: [
          { key: "c:1", title: "Campagne", summary: null, brandName: "Marque A", posterUrl: null, publishedAt: null, href: "/m/decouvertes/nouveautes/l1?c=c1&p=HOME_FEED", label: "Sponsorisé", sponsored: { campaignId: "c1", placement: "HOME_FEED" } },
          { key: "l:2", title: "Nouveauté", summary: null, brandName: "Marque B", posterUrl: null, publishedAt: null, href: "/m/decouvertes/nouveautes/l2", label: "Partenaire", sponsored: null },
        ],
      }),
    );
    const words = text(html);
    expect(words).toMatch(/Sponsorisé Campagne|Sponsorisé .*Campagne/);
    expect(words).toContain("Partenaire");
    expect(words.indexOf("Sponsorisé")).toBeLessThan(words.indexOf("Campagne"));
  });

  it("Découvertes : carte sponsorisée avec le nom du laboratoire, fiches et nouveautés « Partenaire »", () => {
    const hero = text(renderToStaticMarkup(createElement(SponsoredHeroCard, { card: { campaignId: "c1", placement: "DISCOVER_TOP", formatLabel: "Mise en avant", title: "T", summary: null, imageUrl: null, brandName: "Marque A", brandLogoUrl: null, partnerName: "Laboratoire A", href: "/x", launchId: null } })));
    expect(hero).toContain("Sponsorisé");
    expect(hero).toContain("Contenu sponsorisé par Laboratoire A");

    const brand = text(renderToStaticMarkup(createElement(BrandCard, { brand: { id: "b1", slug: "a", name: "Marque A", logoUrl: null, description: null, partnerId: "p1", partnerName: "Laboratoire A", universes: [], universeLabels: [], rangeCount: 0, productCount: 0 } })));
    expect(brand).toContain("Partenaire");

    const launch = text(renderToStaticMarkup(createElement(LaunchCard, { launch: { id: "l1", title: "N", summary: null, posterUrl: null, mediaKind: null, brandId: "b1", brandSlug: "a", brandName: "Marque A", brandLogoUrl: null, partnerName: "Laboratoire A", universe: null, universeLabel: null, publishedAt: null, regulatoryCategory: "COSMETIC" } })));
    expect(launch).toContain("Partenaire");
  });

  it("une formation de laboratoire sponsorisée est « Sponsorisé » ; une formation PharmaBoost n'a pas d'étiquette", () => {
    const base = { id: "t1", title: "F", summary: null, kindLabel: "Vidéo", durationLabel: null, posterUrl: null, isSponsored: true, authorName: null, reviewedAt: null, universe: null, href: "/m/formations/t1" };
    expect(text(renderToStaticMarkup(createElement(TrainingCard, { training: { ...base, partnerId: "p1", partnerName: "Laboratoire A" } })))).toContain("Sponsorisé");
    const own = text(renderToStaticMarkup(createElement(TrainingCard, { training: { ...base, isSponsored: false, partnerId: null, partnerName: null } })));
    expect(own).not.toMatch(/Sponsorisé|Partenaire/);
  });
});
