import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page publique de désinscription des offres, rendue côté serveur sans
 * navigateur ni base : ce que lit le destinataire avant de confirmer. Elle
 * n'affiche rien de personnel et n'écrit rien (un GET ne désinscrit pas).
 */

const mocks = vi.hoisted(() => ({ peekOfferOptOut: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/services/admin/campaigns", () => mocks);

const page = await import("../[token]/page");

const render = async (token = "jeton-123") => renderToStaticMarkup((await page.default({ params: Promise.resolve({ token }) })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.peekOfferOptOut.mockResolvedValue({ alreadyOptedOut: false });
});

describe("page de désinscription des offres", () => {
  it("un jeton invalide mène à « introuvable », sans rien révéler", async () => {
    mocks.peekOfferOptOut.mockResolvedValue(null);
    await expect(render("n-importe-quoi")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.peekOfferOptOut).toHaveBeenCalledWith("n-importe-quoi");
  });

  it("propose un bouton explicite ; la page elle-même ne désinscrit personne", async () => {
    const html = await render();
    expect(html).toContain("Offres de PharmaBoost");
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain("Ne plus recevoir ces offres");
    expect(html).not.toContain("Vous ne recevrez plus");
    // Un seul appel de lecture : l'écriture n'existe que dans la route POST.
    expect(mocks.peekOfferOptOut).toHaveBeenCalledTimes(1);
  });

  it("dit que les messages d'un abonnement ou d'un contrat en cours continuent", async () => {
    expect(await render()).toContain("Les messages liés à un abonnement ou à un contrat en cours");
  });

  it("déjà désinscrit : on le dit, sans formulaire ni bouton", async () => {
    mocks.peekOfferOptOut.mockResolvedValue({ alreadyOptedOut: true });
    const html = await render();
    expect(html).toContain("ne reçoit plus les offres de PharmaBoost");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
  });

  it("n'affiche aucune adresse ni information personnelle, et le jeton n'est pas repris dans la page", async () => {
    const html = await render("jeton-secret-abc");
    expect(html).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
    expect(html).not.toContain("jeton-secret-abc");
  });
});
