import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ peekPostInstallLink: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ peekPostInstallLink: mocks.peekPostInstallLink }));

const { default: Page } = await import("../page");

const TOKEN = "AbCdEfGhIjKlMnOpQrSt";
const render = async (token = TOKEN) => renderToStaticMarkup(await Page({ params: Promise.resolve({ token }) }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("la page du lien d'installation d'un poste", () => {
  it("lien valable : l'officine, le poste, le bouton de téléchargement et l'échéance", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "Pharmacie du Port", label: "Caisse 1", serverHostname: null, expiresAt: new Date("2026-10-15T10:00:00Z") });
    const html = await render();
    expect(mocks.peekPostInstallLink).toHaveBeenCalledWith(TOKEN);
    expect(html).toContain("Pharmacie du Port");
    expect(html).toContain("poste « Caisse 1 »");
    expect(html).toContain(`href="/api/agent/installateur/${TOKEN}"`);
    expect(html).toContain("Télécharger l&#x27;installateur");
    expect(html).toContain("15/10/2026");
    expect(html).toContain("Windows affiche un avertissement");
  });

  it("n'écrit rien et ne consomme rien : la page n'appelle que la lecture du lien", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "P", label: null, serverHostname: null, expiresAt: new Date("2026-10-15T10:00:00Z") });
    await render();
    expect(mocks.peekPostInstallLink).toHaveBeenCalledTimes(1);
  });

  it("lien expiré ou déjà utilisé : on l'explique et on dit quoi faire, sans bouton de téléchargement ni nom d'officine", async () => {
    mocks.peekPostInstallLink.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Ce lien n&#x27;est plus valable");
    expect(html).toContain("Ma connexion");
    expect(html).toContain("contact@pharmaboost.app");
    expect(html).not.toContain("/api/agent/installateur/");
  });

  it("un jeton piégé reste du texte dans l'adresse : jamais du balisage", async () => {
    mocks.peekPostInstallLink.mockResolvedValue({ pharmacyName: "P", label: null, serverHostname: null, expiresAt: new Date("2026-10-15T10:00:00Z") });
    const html = await render('"><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
  });
});
