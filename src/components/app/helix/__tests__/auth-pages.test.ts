import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les pages d'accès des quatre espaces (officine, console super admin, direction commerciale, extranet commercial) sur
 * le gabarit commun de l'hélice d'ADN : même composition, mêmes champs, mêmes liens, mêmes gardes de session qu'avant.
 * Rendues côté serveur, sans navigateur ni base.
 */

const mocks = vi.hoisted(() => ({
  getInstallState: vi.fn(),
  getPlatformSession: vi.fn(),
  peekPasswordToken: vi.fn(),
  getSalesSession: vi.fn(),
  peekSalesPasswordToken: vi.fn(),
  getDirectorSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/server/services/install-state", () => ({ getInstallState: mocks.getInstallState }));
vi.mock("@/server/actions/auth", () => ({ loginAction: vi.fn() }));
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: mocks.getPlatformSession }));
vi.mock("@/server/services/platform-admin", () => ({ peekPasswordToken: mocks.peekPasswordToken }));
vi.mock("@/server/actions/platform", () => ({ platformLoginAction: vi.fn(), requestPlatformPasswordLinkAction: vi.fn(), setPlatformPasswordAction: vi.fn() }));
vi.mock("@/server/auth/sales-session", () => ({ getSalesSession: mocks.getSalesSession }));
vi.mock("@/server/services/sales/reps", () => ({ peekSalesPasswordToken: mocks.peekSalesPasswordToken }));
vi.mock("@/server/actions/extranet", () => ({ salesLoginAction: vi.fn(), requestSalesPasswordLinkAction: vi.fn(), setSalesPasswordAction: vi.fn() }));
vi.mock("@/server/auth/director-session", () => ({ getDirectorSession: mocks.getDirectorSession }));
vi.mock("@/server/actions/director-auth", () => ({ directorLoginAction: vi.fn(), requestDirectorPasswordLinkAction: vi.fn(), setDirectorPasswordAction: vi.fn() }));

const officine = await import("@/app/(auth)/login/page");
const adminLogin = await import("@/app/(admin)/admin-connexion/page");
const adminForgot = await import("@/app/(admin)/admin-connexion/oubli/page");
const adminSet = await import("@/app/(admin)/admin-connexion/mot-de-passe/[token]/page");
const salesLogin = await import("@/app/(sales)/extranet/(auth)/connexion/page");
const salesForgot = await import("@/app/(sales)/extranet/(auth)/oubli/page");
const salesSet = await import("@/app/(sales)/extranet/(auth)/mot-de-passe/[token]/page");
const directorLogin = await import("@/app/(director)/directeur/(auth)/connexion/page");

const html = (node: unknown) => renderToStaticMarkup(node as React.ReactElement);
const noParams = { searchParams: Promise.resolve({}) };

/** La composition commune : l'espace menthe, l'hélice en fond, le robot vivant, le panneau de verre. */
const expectHelixLayout = (page: string) => {
  expect(page).toContain("data-auth-layout");
  expect(page).toContain("espace-pharmacie");
  expect(page).toContain("data-helix-fond");
  expect(page).toContain("Le robot PharmaBoost");
  expect(page).toContain("backdrop-blur-[12px]");
  // Plus aucune trace de l'ancien écran sombre.
  expect(page).not.toMatch(/bg-ink-950|bg-\[#0b1f1c\]|text-white\/60/);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getInstallState.mockResolvedValue({ status: "READY" });
  mocks.getPlatformSession.mockResolvedValue(null);
  mocks.getSalesSession.mockResolvedValue(null);
  mocks.getDirectorSession.mockResolvedValue(null);
});

describe("officine (/login) — inchangée sur le gabarit commun", () => {
  it("garde ses textes, ses champs et ses liens", async () => {
    const page = html(await officine.default(noParams));
    expectHelixLayout(page);
    expect(page).toContain("Le copilote intelligent de l&#x27;officine.");
    expect(page).toContain("Connexion à votre officine");
    expect(page).toContain('name="email"');
    expect(page).toContain('name="password"');
    expect(page).toContain('href="/login/oubli"');
    expect(page).toContain('href="/rejoindre"');
  });
});

describe("console super admin (/admin-connexion)", () => {
  it("connexion : présentation de la console, champs, lien d'oubli", async () => {
    const page = html(await adminLogin.default(noParams));
    expectHelixLayout(page);
    expect(page).toContain("Centre de contrôle");
    expect(page).toContain("Administration PharmaBoost");
    expect(page).toContain("Aucun accès aux données médicales des patients des officines clientes.");
    expect(page).toMatch(/name="email"[^>]*type="email"|type="email"[^>]*name="email"/);
    expect(page).toContain('autoComplete="username"');
    expect(page).toContain('autoComplete="current-password"');
    expect(page).toContain("Se connecter");
    expect(page).toContain('href="/admin-connexion/oubli"');
  });

  it("mot de passe enregistré : le dit", async () => {
    expect(html(await adminLogin.default({ searchParams: Promise.resolve({ defini: "1" }) }))).toContain("Mot de passe enregistré. Connectez-vous.");
  });

  it("déjà connecté : entre dans la console, comme avant", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "a" } });
    await expect(adminLogin.default(noParams)).rejects.toThrow("NEXT_REDIRECT /admin");
  });

  it("oubli : une adresse, un bouton, un retour", () => {
    const page = html(adminForgot.default());
    expectHelixLayout(page);
    expect(page).toContain("Recevoir un lien de connexion");
    expect(page).toContain("Envoyer le lien");
    expect(page).toContain('href="/admin-connexion"');
  });

  it("lien de mot de passe : valable, porte le jeton ; périmé, aucun formulaire", async () => {
    mocks.peekPasswordToken.mockResolvedValue({ email: "alex@pharmaboost.app" });
    const ok = html(await adminSet.default({ params: Promise.resolve({ token: "jeton-1" }) }));
    expectHelixLayout(ok);
    expect(ok).toContain("alex@pharmaboost.app");
    expect(ok).toContain('type="hidden" name="token" value="jeton-1"');
    expect(ok.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(ok).toContain("Enregistrer et me connecter");

    mocks.peekPasswordToken.mockResolvedValue(null);
    const ko = html(await adminSet.default({ params: Promise.resolve({ token: "x" }) }));
    expect(ko).toContain('href="/admin-connexion/oubli"');
    expect(ko).not.toContain("<form");
  });
});

describe("extranet commercial (/extranet/connexion)", () => {
  it("connexion : présentation de l'extranet, champs, lien d'oubli", async () => {
    const page = html(await salesLogin.default(noParams));
    expectHelixLayout(page);
    expect(page).toContain("Extranet commercial");
    expect(page).toContain("PharmaBoost — vos dossiers, vos contrats, vos commissions.");
    expect(page).toContain('name="email"');
    expect(page).toContain('autoComplete="current-password"');
    expect(page).toContain('href="/extranet/oubli"');
  });

  it("déjà connecté : entre dans l'extranet", async () => {
    mocks.getSalesSession.mockResolvedValue({ rep: { id: "r" } });
    await expect(salesLogin.default(noParams)).rejects.toThrow("NEXT_REDIRECT /extranet");
  });

  it("oubli et lien de mot de passe", async () => {
    const forgot = html(salesForgot.default());
    expectHelixLayout(forgot);
    expect(forgot).toContain('href="/extranet/connexion"');

    mocks.peekSalesPasswordToken.mockResolvedValue({ email: "sam@exemple.test", firstName: "Sam" });
    const ok = html(await salesSet.default({ params: Promise.resolve({ token: "jeton-2" }) }));
    expectHelixLayout(ok);
    expect(ok).toContain("Bienvenue Sam");
    expect(ok).toContain('type="hidden" name="token" value="jeton-2"');

    mocks.peekSalesPasswordToken.mockResolvedValue(null);
    const ko = html(await salesSet.default({ params: Promise.resolve({ token: "x" }) }));
    expect(ko).toContain('href="/extranet/oubli"');
    expect(ko).not.toContain("<form");
  });
});

describe("direction commerciale (/directeur/connexion)", () => {
  it("connexion sur le gabarit commun, sans parler des autres espaces", async () => {
    const page = html(await directorLogin.default());
    expectHelixLayout(page);
    expect(page).toContain("Direction commerciale");
    expect(page).toContain('href="/directeur/oubli"');
    expect(page).not.toMatch(/extranet|\/admin|super admin/i);
  });
});
