import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'installation sous AnyDesk, côté console : session plateforme d'abord,
 * officine relue en base (jamais crue sur parole), commande prête à copier,
 * et aucun code écrit dans un journal. Ni base ni réseau : les services sont simulés.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  resolveInstallTarget: vi.fn(),
  createPairing: vi.fn(),
  createPostInstallLink: vi.fn(),
  resolvePublicBaseUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: mocks.resolvePublicBaseUrl }));
vi.mock("@/server/services/stock-sync", () => ({
  resolveInstallTarget: mocks.resolveInstallTarget,
  createPairing: mocks.createPairing,
  createPostInstallLink: mocks.createPostInstallLink,
  isLgoId: (value: string) => ["lgpi", "smart-rx", "pharmaland", "winpharma", "leo", "autre"].includes(value),
}));

const { prepareInstallationAction, preparePostInstallAction } = await import("../admin-install");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_owner" };
const target = (overrides: Record<string, unknown> = {}) => ({ ok: true, scope: SCOPE, pharmacyName: "Pharmacie du Port", lgo: "lgpi", ...overrides });
const EXPIRES = new Date("2026-10-06T10:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1", fullName: "Adam" }, sessionId: "s1" });
  mocks.resolvePublicBaseUrl.mockReturnValue({ url: "https://pharmaboost.app/", reach: "PUBLIC", secure: true });
  mocks.resolveInstallTarget.mockResolvedValue(target());
  mocks.createPairing.mockResolvedValue({ code: "482913", expiresAt: EXPIRES });
  mocks.createPostInstallLink.mockResolvedValue({ token: "AbCdEfGhIjKlMnOpQrSt", expiresAt: EXPIRES, postId: "post_1" });
});

describe("la barrière de la console", () => {
  it("sans session plateforme : rien n'est lu, rien n'est émis (les deux actions)", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(prepareInstallationAction({ pharmacyId: "ph_1" })).rejects.toThrow("NEXT_REDIRECT");
    await expect(preparePostInstallAction({ pharmacyId: "ph_1", label: "Caisse 1" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.resolveInstallTarget).not.toHaveBeenCalled();
    expect(mocks.createPairing).not.toHaveBeenCalled();
    expect(mocks.createPostInstallLink).not.toHaveBeenCalled();
  });
});

describe("prepareInstallationAction : la ligne du serveur", () => {
  it("émet le code au nom de l'administrateur et rend UNE commande prête à copier", async () => {
    const result = await prepareInstallationAction({ pharmacyId: "ph_1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Le logiciel est celui de la liaison déjà connue ; l'audit nomme l'administrateur de la console.
    expect(mocks.createPairing).toHaveBeenCalledWith(SCOPE, "lgpi", { platformAdminId: "adm_1" });
    expect(result.data.serverCommand).toBe(
      'powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm https://pharmaboost.app/api/agent/installer-serveur/482913 | iex"',
    );
    expect(result.data.serverCodeExpiresAt).toBe("2026-10-06T10:00:00.000Z");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pharmacies/ph_1");
  });

  it("l'officine est relue en base : une officine inconnue est refusée, aucun code émis", async () => {
    mocks.resolveInstallTarget.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const result = await prepareInstallationAction({ pharmacyId: "ph_inconnue" });
    expect(result).toMatchObject({ ok: false, error: "Officine introuvable." });
    expect(mocks.resolveInstallTarget).toHaveBeenCalledWith("ph_inconnue");
    expect(mocks.createPairing).not.toHaveBeenCalled();
  });

  it("une officine suspendue, ou sans titulaire actif : un refus clair, aucun code émis", async () => {
    mocks.resolveInstallTarget.mockResolvedValueOnce({ ok: false, reason: "SUSPENDED" });
    expect(await prepareInstallationAction({ pharmacyId: "ph_1" })).toMatchObject({ ok: false, error: expect.stringContaining("suspendue") });
    mocks.resolveInstallTarget.mockResolvedValueOnce({ ok: false, reason: "NO_OWNER" });
    expect(await prepareInstallationAction({ pharmacyId: "ph_1" })).toMatchObject({ ok: false, error: expect.stringContaining("titulaire") });
    expect(mocks.createPairing).not.toHaveBeenCalled();
  });

  it("sans liaison connue : « Autre logiciel » ; le choix de la console, lui, prime", async () => {
    mocks.resolveInstallTarget.mockResolvedValue(target({ lgo: null }));
    await prepareInstallationAction({ pharmacyId: "ph_1" });
    expect(mocks.createPairing).toHaveBeenLastCalledWith(SCOPE, "autre", { platformAdminId: "adm_1" });
    await prepareInstallationAction({ pharmacyId: "ph_1", lgo: "winpharma" });
    expect(mocks.createPairing).toHaveBeenLastCalledWith(SCOPE, "winpharma", { platformAdminId: "adm_1" });
  });

  it("un logiciel inconnu ou une requête mal formée : refus, aucun code émis", async () => {
    expect(await prepareInstallationAction({ pharmacyId: "ph_1", lgo: "logiciel-pirate" })).toMatchObject({ ok: false, error: "Logiciel inconnu." });
    expect(await prepareInstallationAction({ pharmacyId: "" })).toMatchObject({ ok: false, error: "Requête invalide." });
    expect(await prepareInstallationAction({} as never)).toMatchObject({ ok: false, error: "Requête invalide." });
    expect(mocks.createPairing).not.toHaveBeenCalled();
  });

  it("le code n'est écrit dans aucun journal", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    await prepareInstallationAction({ pharmacyId: "ph_1" });
    await preparePostInstallAction({ pharmacyId: "ph_1" });
    const written = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join(" ");
    expect(written).not.toContain("482913");
    expect(written).not.toContain("AbCdEfGhIjKlMnOpQrSt");
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe("preparePostInstallAction : la ligne d'un poste", () => {
  it("émet le lien au nom de l'administrateur, avec le nom du poste, et rend la commande", async () => {
    const result = await preparePostInstallAction({ pharmacyId: "ph_1", label: "Comptoir 1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mocks.createPostInstallLink).toHaveBeenCalledWith(SCOPE, "Comptoir 1", { platformAdminId: "adm_1" });
    expect(result.data.postCommand).toBe(
      'powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm https://pharmaboost.app/api/agent/installer/AbCdEfGhIjKlMnOpQrSt | iex"',
    );
    expect(result.data.expiresAt).toBe("2026-10-06T10:00:00.000Z");
    expect(result.data.postId).toBe("post_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pharmacies/ph_1");
  });

  it("le nom du poste est facultatif, nettoyé sur une ligne et plafonné à 60 caractères", async () => {
    await preparePostInstallAction({ pharmacyId: "ph_1" });
    expect(mocks.createPostInstallLink).toHaveBeenLastCalledWith(SCOPE, null, expect.anything());
    await preparePostInstallAction({ pharmacyId: "ph_1", label: "  Caisse\n2  " });
    expect(mocks.createPostInstallLink).toHaveBeenLastCalledWith(SCOPE, "Caisse 2", expect.anything());
    await preparePostInstallAction({ pharmacyId: "ph_1", label: "x".repeat(150) });
    expect(mocks.createPostInstallLink.mock.lastCall?.[1]).toHaveLength(60);
  });

  it("officine inconnue, suspendue ou sans titulaire : refus, aucun lien émis", async () => {
    for (const reason of ["NOT_FOUND", "SUSPENDED", "NO_OWNER"]) {
      mocks.resolveInstallTarget.mockResolvedValueOnce({ ok: false, reason });
      const result = await preparePostInstallAction({ pharmacyId: "ph_1" });
      expect(result.ok).toBe(false);
    }
    expect(mocks.createPostInstallLink).not.toHaveBeenCalled();
  });

  it("une requête mal formée est refusée", async () => {
    expect(await preparePostInstallAction({ pharmacyId: "" })).toMatchObject({ ok: false, error: "Requête invalide." });
    expect(mocks.createPostInstallLink).not.toHaveBeenCalled();
  });
});
