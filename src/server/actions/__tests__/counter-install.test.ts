import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le lien d'installation d'un comptoir : créé pour l'officine de la session, nommé « Comptoir N », envoyé par
 * e-mail à l'adresse du titulaire SEULEMENT, et jamais présenté comme envoyé quand il ne l'est pas.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  createLink: vi.fn(),
  listPosts: vi.fn(),
  reissue: vi.fn(),
  findOwn: vi.fn(),
  sendEmail: vi.fn(),
  rateLimited: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: () => ({ url: "https://pharmaboost.test" }), publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/http/rate-limit", () => ({ rateLimited: mocks.rateLimited }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/services/connection-overview", () => ({ chooseLgo: vi.fn(), loadConnectionOverview: vi.fn() }));
vi.mock("@/server/services/stock-sync", () => ({
  createPairing: vi.fn(),
  createPostInstallLink: mocks.createLink,
  createPostPairing: vi.fn(),
  disconnectAgent: vi.fn(),
  findOwnPostInstallLink: mocks.findOwn,
  getConnection: vi.fn(),
  isLgoId: () => true,
  listCounterPosts: mocks.listPosts,
  reissuePostInstallLink: mocks.reissue,
  requestPostSync: vi.fn(),
  revokeCounterPost: vi.fn(),
  setPostExportPath: vi.fn(),
  updateConnectionSettings: vi.fn(),
}));

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const actions = await import("../stock-sync");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner", isDemo: false }, user: { email: "titulaire@pharmacie.fr" } };
const TOKEN = "AbCdEfGhIjKlMnOpQrSt";
const EXPIRES = new Date("2026-10-15T09:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.rateLimited.mockReturnValue(false);
  mocks.listPosts.mockResolvedValue([]);
  mocks.createLink.mockResolvedValue({ token: TOKEN, expiresAt: EXPIRES, postId: "post_1" });
});

describe("createPostInstallLinkAction", () => {
  it("nomme le premier comptoir « Comptoir 1 » et rend le lien de téléchargement", async () => {
    const result = await actions.createPostInstallLinkAction({});
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.createLink).toHaveBeenCalledWith(SESSION.scope, "Comptoir 1");
    if (!result.ok) throw new Error("attendu");
    expect(result.data).toMatchObject({ label: "Comptoir 1", postId: "post_1", downloadUrl: `https://pharmaboost.test/installer/${TOKEN}`, fileUrl: `https://pharmaboost.test/api/agent/installateur/${TOKEN}` });
  });

  it("le suivant s'appelle « Comptoir 3 » quand il y en a déjà deux", async () => {
    mocks.listPosts.mockResolvedValue([{ label: "Comptoir 1", hostname: "A" }, { label: "Comptoir 2", hostname: "B" }]);
    await actions.createPostInstallLinkAction({});
    expect(mocks.createLink).toHaveBeenCalledWith(SESSION.scope, "Comptoir 3");
  });

  it("liste seulement les comptoirs de l'officine de la session", async () => {
    await actions.createPostInstallLinkAction({});
    expect(mocks.listPosts).toHaveBeenCalledWith("ph_1");
  });
});

describe("reissuePostInstallLinkAction", () => {
  it("renvoie un nouveau lien pour un comptoir à installer", async () => {
    mocks.reissue.mockResolvedValue({ ok: true, token: TOKEN, expiresAt: EXPIRES, label: "Comptoir 2" });
    const result = await actions.reissuePostInstallLinkAction({ postId: "post_2" });
    expect(mocks.reissue).toHaveBeenCalledWith(SESSION.scope, "post_2");
    if (!result.ok) throw new Error("attendu");
    expect(result.data).toMatchObject({ label: "Comptoir 2", postId: "post_2" });
    expect(result.message).toMatch(/L'ancien ne marche plus/);
  });

  it("refuse un comptoir déjà installé ou étranger, avec le motif", async () => {
    mocks.reissue.mockResolvedValue({ ok: false, error: "Comptoir introuvable." });
    expect(await actions.reissuePostInstallLinkAction({ postId: "autre" })).toEqual({ ok: false, error: "Comptoir introuvable.", fieldErrors: undefined });
  });
});

describe("emailPostInstallLinkAction", () => {
  beforeEach(() => {
    mocks.findOwn.mockResolvedValue({ label: "Comptoir 2", expiresAt: EXPIRES, pharmacyName: "Pharmacie du Parc" });
    mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "" });
  });

  it("envoie à l'adresse du titulaire connecté, et à aucune autre", async () => {
    const result = await actions.emailPostInstallLinkAction({ token: TOKEN, to: "quelquun@autre.fr" } as never);
    expect(result).toMatchObject({ ok: true, data: { to: "titulaire@pharmacie.fr" } });
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe("titulaire@pharmacie.fr");
    expect(JSON.stringify(mocks.sendEmail.mock.calls)).not.toContain("autre.fr");
  });

  it("vérifie le jeton dans l'officine de la session avant d'envoyer", async () => {
    await actions.emailPostInstallLinkAction({ token: TOKEN });
    expect(mocks.findOwn).toHaveBeenCalledWith(SESSION.scope, TOKEN);
  });

  it("le message contient le lien de téléchargement, jamais la ligne de commande", async () => {
    await actions.emailPostInstallLinkAction({ token: TOKEN });
    const sent = mocks.sendEmail.mock.calls[0][0];
    expect(sent.text).toContain(`https://pharmaboost.test/installer/${TOKEN}`);
    expect(sent.text + sent.html).not.toMatch(/powershell|irm /i);
    expect(sent.subject).toContain("Comptoir 2");
  });

  it("un jeton qui n'est pas celui d'un lien valable de cette officine : rien ne part", async () => {
    mocks.findOwn.mockResolvedValue(null);
    const result = await actions.emailPostInstallLinkAction({ token: TOKEN });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("un envoi simulé n'est jamais présenté comme un envoi", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "SIMULATED", provider: "demo", detail: "Adresse de démonstration" });
    const result = await actions.emailPostInstallLinkAction({ token: TOKEN });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/non envoyé/i);
  });

  it("une panne du prestataire redonne la main : copier le lien", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("SMTP"));
    const result = await actions.emailPostInstallLinkAction({ token: TOKEN });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/Copiez le lien/);
  });

  it("trop d'envois : refusé avant tout", async () => {
    mocks.rateLimited.mockReturnValue(true);
    const result = await actions.emailPostInstallLinkAction({ token: TOKEN });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.findOwn).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sans permission, rien n'est lu ni envoyé", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("interdit"));
    await expect(actions.emailPostInstallLinkAction({ token: TOKEN })).rejects.toThrow("interdit");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
