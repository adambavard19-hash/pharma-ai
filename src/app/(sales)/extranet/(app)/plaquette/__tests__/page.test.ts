import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePublicPricing } from "@/core/pricing/official-offer";

/**
 * « Plaquette » dans l'extranet : réservée au commercial connecté, avec SES coordonnées (nom, e-mail, téléphone s'il est
 * renseigné), le bouton « Télécharger en PDF » et le lien vers la version générique.
 */

const mocks = vi.hoisted(() => ({ requireSalesSession: vi.fn(), loadPublicPricing: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/sales-session", () => ({ requireSalesSession: mocks.requireSalesSession }));
vi.mock("@/server/services/public-pricing", () => ({ loadPublicPricing: mocks.loadPublicPricing }));

const page = await import("../page");

const render = async () => renderToStaticMarkup(await page.default());
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;|[  ]/g, " ")
    .replace(/\s+/g, " ");

const REP = { id: "rep_1", email: "marie.dupont@exemple.fr", firstName: "Marie", lastName: "Dupont", fullName: "Marie Dupont", initials: "MD", phone: "06 98 76 54 32" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSalesSession.mockResolvedValue({ rep: REP, sessionId: "s_1" });
  mocks.loadPublicPricing.mockResolvedValue({ ...resolvePublicPricing(null), planId: null });
});

describe("la plaquette de l'extranet", () => {
  it("sans session de commercial : redirigé vers la connexion, rien n'est lu", async () => {
    const redirected = new Error("NEXT_REDIRECT /extranet/connexion");
    mocks.requireSalesSession.mockRejectedValue(redirected);
    await expect(render()).rejects.toBe(redirected);
    expect(mocks.loadPublicPricing).not.toHaveBeenCalled();
  });

  it("dit ce qu'est la page, propose le PDF et la version générique", async () => {
    const html = await render();
    const text = visible(html);
    expect(text).toContain("Plaquette");
    expect(text).toContain("Votre plaquette, avec vos coordonnées");
    expect(text).toContain("Télécharger en PDF");
    expect(text).toContain("Enregistrer au format PDF");
    expect(html).toMatch(/<a href="\/plaquette\/pharmaboost-plaquette\.pdf" download=""[^>]*>[\s\S]*?Version générique \(PDF\)/);
    // L'en-tête de la page ne part pas à l'impression : seules les feuilles A4.
    expect(html).toMatch(/class="[^"]*print:hidden[^"]*"[^>]*>\s*<div class="max-w-xl">/);
    expect(html.match(/class="plq-page"/g)).toHaveLength(6);
  });

  it("imprime les coordonnées du commercial de la session, et les siennes seulement", async () => {
    const text = visible(await render());
    expect(text).toContain("Votre contact · Marie Dupont");
    expect(text).toContain("Marie Dupont · 06 98 76 54 32 · marie.dupont@exemple.fr");
    expect(text).not.toContain("rep_1");
    expect(text).not.toContain("Votre téléphone n'est pas renseigné");
  });

  it("téléphone absent de la fiche : la plaquette donne l'e-mail, et la page le dit", async () => {
    mocks.requireSalesSession.mockResolvedValue({ rep: { ...REP, phone: null }, sessionId: "s_1" });
    const text = visible(await render());
    expect(text).toContain("Votre téléphone n'est pas renseigné sur votre fiche");
    expect(text).toContain("Marie Dupont · marie.dupont@exemple.fr");
    expect(text).not.toMatch(/null|undefined/);
  });

  it("le tarif vient de l'offre publique (console ou offre officielle)", async () => {
    mocks.loadPublicPricing.mockResolvedValue({ ...resolvePublicPricing({ name: "Offre Test", monthlyPriceCents: 15_000, setupFeeCents: 39_000 }), planId: "plan_1" });
    const text = visible(await render());
    expect(mocks.loadPublicPricing).toHaveBeenCalledTimes(1);
    expect(text).toContain("150 € HT / mois");
    expect(text).toContain("390 € HT, une seule fois");
  });

  it("le titre de l'onglet, nom proposé pour le PDF", () => {
    expect(page.metadata.title).toEqual({ absolute: "PharmaBoost — Plaquette de présentation" });
  });
});
