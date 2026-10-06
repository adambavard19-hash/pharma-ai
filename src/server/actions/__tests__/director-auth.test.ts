import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les actions d'ouverture et de fermeture de l'espace du directeur : connexion,
 * déconnexion, « mot de passe oublié », choix du mot de passe. Services et
 * session simulés ; la redirection de Next.js est une exception, comme en vrai.
 */

const mocks = vi.hoisted(() => ({
  authenticateDirector: vi.fn(),
  requestDirectorPasswordReset: vi.fn(),
  setDirectorPasswordByToken: vi.fn(),
  createDirectorSession: vi.fn(),
  destroyDirectorSession: vi.fn(),
  getDirectorSession: vi.fn(),
  getRequestMeta: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/server/auth/director-session", () => ({ createDirectorSession: mocks.createDirectorSession, destroyDirectorSession: mocks.destroyDirectorSession, getDirectorSession: mocks.getDirectorSession }));
vi.mock("@/server/auth/session", () => ({ getRequestMeta: mocks.getRequestMeta }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/director-auth", () => ({
  authenticateDirector: mocks.authenticateDirector,
  requestDirectorPasswordReset: mocks.requestDirectorPasswordReset,
  setDirectorPasswordByToken: mocks.setDirectorPasswordByToken,
}));

const actions = await import("../director-auth");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getRequestMeta.mockResolvedValue({ ipAddress: "203.0.113.7", userAgent: "test" });
});

describe("la connexion", () => {
  it("ouvre la session, trace la connexion, puis ramène au tableau de bord", async () => {
    mocks.authenticateDirector.mockResolvedValue({ ok: true, salesDirectorId: "dir_1" });
    await expect(actions.directorLoginAction(null, form({ email: " Directeur@Exemple.test ", password: "Secret!Secret12" }))).rejects.toThrow("NEXT_REDIRECT /directeur");
    expect(mocks.authenticateDirector).toHaveBeenCalledWith("directeur@exemple.test", "Secret!Secret12", { ipAddress: "203.0.113.7" });
    expect(mocks.createDirectorSession).toHaveBeenCalledWith({ salesDirectorId: "dir_1", ipAddress: "203.0.113.7" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "auth.login", entityType: "SalesDirector", entityId: "dir_1", salesDirectorId: "dir_1", metadata: { scope: "director" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("Secret!Secret12");
  });

  it("un refus du service est rendu tel quel, sans session ni trace de connexion", async () => {
    mocks.authenticateDirector.mockResolvedValue({ ok: false, error: "Identifiants incorrects." });
    expect(await actions.directorLoginAction(null, form({ email: "directeur@exemple.test", password: "faux" }))).toEqual({ ok: false, error: "Identifiants incorrects.", fieldErrors: undefined });
    expect(mocks.createDirectorSession).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une adresse mal formée ou un champ vide : même message, le service n'est pas appelé", async () => {
    expect(await actions.directorLoginAction(null, form({ email: "pas-une-adresse", password: "x" }))).toMatchObject({ ok: false, error: "Identifiants incorrects." });
    expect(await actions.directorLoginAction(null, form({ email: "directeur@exemple.test", password: "" }))).toMatchObject({ ok: false, error: "Identifiants incorrects." });
    expect(await actions.directorLoginAction(null, new FormData())).toMatchObject({ ok: false, error: "Identifiants incorrects." });
    expect(mocks.authenticateDirector).not.toHaveBeenCalled();
  });

  it("l'identifiant du directeur vient du service, jamais d'un champ du formulaire", async () => {
    mocks.authenticateDirector.mockResolvedValue({ ok: true, salesDirectorId: "dir_du_service" });
    await expect(actions.directorLoginAction(null, form({ email: "directeur@exemple.test", password: "Secret!Secret12", salesDirectorId: "dir_pirate" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createDirectorSession).toHaveBeenCalledWith(expect.objectContaining({ salesDirectorId: "dir_du_service" }));
  });
});

describe("la déconnexion", () => {
  it("trace, ferme la session, renvoie à la connexion", async () => {
    mocks.getDirectorSession.mockResolvedValue({ director: { id: "dir_1" }, sessionId: "s_1" });
    await expect(actions.directorLogoutAction()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.logout", entityId: "dir_1", salesDirectorId: "dir_1" }));
    expect(mocks.destroyDirectorSession).toHaveBeenCalledTimes(1);
  });

  it("session déjà expirée : le cookie est tout de même effacé, sans trace inventée", async () => {
    mocks.getDirectorSession.mockResolvedValue(null);
    await expect(actions.directorLogoutAction()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.destroyDirectorSession).toHaveBeenCalledTimes(1);
  });
});

describe("« mot de passe oublié »", () => {
  it("répond la même chose quel que soit le compte", async () => {
    const first = await actions.requestDirectorPasswordLinkAction(null, form({ email: "Connu@Exemple.test" }));
    const second = await actions.requestDirectorPasswordLinkAction(null, form({ email: "inconnu@exemple.test" }));
    expect(first).toEqual({ ok: true, data: null, message: "Si un compte existe pour cette adresse, un lien vient de lui être envoyé." });
    expect(second).toEqual(first);
    expect(mocks.requestDirectorPasswordReset).toHaveBeenNthCalledWith(1, "connu@exemple.test", { ipAddress: "203.0.113.7" });
  });

  it("refuse une adresse mal formée avant d'appeler le service", async () => {
    expect(await actions.requestDirectorPasswordLinkAction(null, form({ email: "nope" }))).toMatchObject({ ok: false, error: "Adresse e-mail invalide." });
    expect(mocks.requestDirectorPasswordReset).not.toHaveBeenCalled();
  });
});

describe("définir le mot de passe", () => {
  const token = "T".repeat(43);

  it("ouvre la session du compte du lien, puis ramène au tableau de bord", async () => {
    mocks.setDirectorPasswordByToken.mockResolvedValue({ ok: true, salesDirectorId: "dir_1" });
    await expect(actions.setDirectorPasswordAction(null, form({ token, password: "Mot2Passe!Solide", confirm: "Mot2Passe!Solide" }))).rejects.toThrow("NEXT_REDIRECT /directeur");
    expect(mocks.setDirectorPasswordByToken).toHaveBeenCalledWith(token, "Mot2Passe!Solide");
    expect(mocks.createDirectorSession).toHaveBeenCalledWith({ salesDirectorId: "dir_1", ipAddress: "203.0.113.7" });
  });

  it("deux saisies différentes : refus, le service n'est pas appelé", async () => {
    expect(await actions.setDirectorPasswordAction(null, form({ token, password: "Mot2Passe!Solide", confirm: "Autre2Passe!Solide" }))).toMatchObject({ ok: false, error: "Les deux mots de passe ne sont pas identiques." });
    expect(mocks.setDirectorPasswordByToken).not.toHaveBeenCalled();
    expect(mocks.createDirectorSession).not.toHaveBeenCalled();
  });

  it("un formulaire incomplet ou un jeton trop court est refusé", async () => {
    expect(await actions.setDirectorPasswordAction(null, form({ token, password: "x" }))).toMatchObject({ ok: false, error: "Formulaire incomplet." });
    expect(await actions.setDirectorPasswordAction(null, form({ token: "court", password: "x", confirm: "x" }))).toMatchObject({ ok: false, error: "Formulaire incomplet." });
    expect(mocks.setDirectorPasswordByToken).not.toHaveBeenCalled();
  });

  it("dit pourquoi le service refuse (lien périmé, mot de passe faible) et n'ouvre aucune session", async () => {
    mocks.setDirectorPasswordByToken.mockResolvedValue({ ok: false, error: "Mot de passe trop faible : 12 caractères minimum." });
    expect(await actions.setDirectorPasswordAction(null, form({ token, password: "court", confirm: "court" }))).toMatchObject({ ok: false, error: "Mot de passe trop faible : 12 caractères minimum." });
    expect(mocks.createDirectorSession).not.toHaveBeenCalled();
  });
});
