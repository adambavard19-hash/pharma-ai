import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les trois pages d'accès du directeur : connexion, oubli, mot de passe. Rendues
 * côté serveur, sans navigateur ni base.
 */

const mocks = vi.hoisted(() => ({ getDirectorSession: vi.fn(), peekDirectorPasswordToken: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/server/auth/director-session", () => ({ getDirectorSession: mocks.getDirectorSession }));
vi.mock("@/server/services/sales/director-auth", () => ({ peekDirectorPasswordToken: mocks.peekDirectorPasswordToken }));
vi.mock("@/server/actions/director-auth", () => ({ directorLoginAction: vi.fn(), requestDirectorPasswordLinkAction: vi.fn(), setDirectorPasswordAction: vi.fn() }));

const login = await import("../connexion/page");
const forgot = await import("../oubli/page");
const setPassword = await import("../mot-de-passe/[token]/page");

const html = (node: React.ReactNode) => renderToStaticMarkup(node as React.ReactElement);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getDirectorSession.mockResolvedValue(null);
});

describe("la connexion", () => {
  it("demande l'adresse et le mot de passe, avec les bons champs pour le gestionnaire de mots de passe", async () => {
    const page = html(await login.default());
    expect(page).toContain("Direction commerciale");
    expect(page).toContain('name="email"');
    expect(page).toContain('type="email"');
    expect(page).toContain('autoComplete="username"');
    expect(page).toContain('name="password"');
    expect(page).toContain('autoComplete="current-password"');
    expect(page).toContain("Se connecter");
    expect(page).toContain('href="/directeur/oubli"');
  });

  it("déjà connecté : on entre directement dans l'espace", async () => {
    mocks.getDirectorSession.mockResolvedValue({ director: { id: "dir_1" }, sessionId: "s" });
    await expect(login.default()).rejects.toThrow("NEXT_REDIRECT /directeur");
  });

  it("ne dit rien de la console ni de l'extranet des commerciaux", async () => {
    expect(html(await login.default())).not.toMatch(/extranet|\/admin|super admin/i);
  });
});

describe("l'oubli", () => {
  it("une adresse, un bouton, un retour à la connexion", () => {
    const page = html(forgot.default());
    expect(page).toContain("Recevoir un lien de connexion");
    expect(page).toContain('name="email"');
    expect(page).toContain("Envoyer le lien");
    expect(page).toContain('href="/directeur/connexion"');
  });
});

describe("le lien pour définir le mot de passe", () => {
  const render = async (token = "J".repeat(43)) => html(await setPassword.default({ params: Promise.resolve({ token }) }));

  it("lien valable : accueille par le prénom, montre le compte, demande douze caractères et porte le jeton en champ caché", async () => {
    mocks.peekDirectorPasswordToken.mockResolvedValue({ id: "dir_1", email: "camille@exemple.test", firstName: "Camille" });
    const page = await render("jeton-abc-1234567890");
    expect(mocks.peekDirectorPasswordToken).toHaveBeenCalledWith("jeton-abc-1234567890");
    expect(page).toContain("Bienvenue Camille");
    expect(page).toContain("camille@exemple.test");
    expect(page).toContain("douze caractères au minimum");
    expect(page).toContain('type="hidden" name="token" value="jeton-abc-1234567890"');
    expect(page.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(page).toContain('minLength="12"');
    expect(page).toContain("Enregistrer et entrer");
  });

  it("lien périmé, utilisé ou inconnu : le dit, propose un nouveau lien, et n'affiche aucun formulaire", async () => {
    mocks.peekDirectorPasswordToken.mockResolvedValue(null);
    const page = await render();
    expect(page).toContain("Ce lien n&#x27;est plus valide.");
    expect(page).toContain('href="/directeur/oubli"');
    expect(page).not.toContain("<form");
    expect(page).not.toContain('name="password"');
  });

  it("échappe le prénom", async () => {
    mocks.peekDirectorPasswordToken.mockResolvedValue({ id: "d", email: "a@b.test", firstName: "<img src=x onerror=alert(1)>" });
    const page = await render();
    expect(page).not.toContain("<img");
    expect(page).toContain("&lt;img");
  });
});
