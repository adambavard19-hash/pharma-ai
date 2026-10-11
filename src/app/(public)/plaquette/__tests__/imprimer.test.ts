import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePublicPricing } from "@/core/pricing/official-offer";

/**
 * /plaquette/imprimer : la plaquette GÉNÉRIQUE que `npm run plaquette:pdf` imprime. Publique, mais sans aucune session lue,
 * sans donnée personnelle, et non indexée.
 */

const mocks = vi.hoisted(() => ({
  loadPublicPricing: vi.fn(async () => ({ ...resolvePublicPricing(null), planId: null })),
  sessionRead: vi.fn(() => {
    throw new Error("aucune session ne doit être lue");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/public-pricing", () => ({ loadPublicPricing: mocks.loadPublicPricing }));
vi.mock("@/server/auth/sales-session", () => ({ requireSalesSession: mocks.sessionRead, getSalesSession: mocks.sessionRead }));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.sessionRead, getSession: mocks.sessionRead }));

const page = await import("../imprimer/page");

describe("la plaquette générique à imprimer", () => {
  it("rend les six feuilles avec l'adresse publique, sans session ni coordonnées de commercial", async () => {
    const html = renderToStaticMarkup(await page.default());
    expect(mocks.sessionRead).not.toHaveBeenCalled();
    expect(html).toContain('data-plaquette="generique"');
    expect(html.match(/class="plq-page"/g)).toHaveLength(6);
    expect(html).toContain("Contact@pharmaboost.app");
    expect(html).not.toContain("Votre contact · ");
  });

  it("n'est pas indexée et porte le nom de la plaquette", () => {
    expect(page.metadata.robots).toEqual({ index: false, follow: false });
    expect(page.metadata.title).toEqual({ absolute: "PharmaBoost — Plaquette de présentation" });
  });
});
