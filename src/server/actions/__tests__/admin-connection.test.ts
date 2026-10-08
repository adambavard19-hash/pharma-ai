import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'espace d'assistance de la console : réservé à un administrateur de la plateforme (la session plateforme est
 * exigée AVANT tout), l'officine est celle que la console désigne, l'audit nomme l'administrateur, et aucune
 * donnée de patient n'est lue.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  revalidatePath: vi.fn(),
  resolveSupportScope: vi.fn(),
  revoke: vi.fn(),
  setExportPath: vi.fn(),
  requestSync: vi.fn(),
  createPostPairing: vi.fn(),
  updateSettings: vi.fn(),
  disconnect: vi.fn(),
  loadOverview: vi.fn(),
  loadRobot: vi.fn(),
  saveTechnical: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/connection-overview", () => ({ loadConnectionOverview: mocks.loadOverview }));
vi.mock("@/server/services/robot-setup", () => ({ loadRobotSetup: mocks.loadRobot, saveRobotTechnical: mocks.saveTechnical }));
vi.mock("@/server/services/stock-sync", () => ({
  resolveSupportScope: mocks.resolveSupportScope,
  revokeCounterPost: mocks.revoke,
  setPostExportPath: mocks.setExportPath,
  requestPostSync: mocks.requestSync,
  createPostPairing: mocks.createPostPairing,
  updateConnectionSettings: mocks.updateSettings,
  disconnectAgent: mocks.disconnect,
}));

const { buildConnectionOverview } = await import("@/core/stock/connection-overview");
const actions = await import("../admin-connection");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const ACTOR = { platformAdminId: "adm_1" };
const NOW = new Date();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
  mocks.resolveSupportScope.mockResolvedValue({ ok: true, scope: SCOPE, pharmacyName: "Pharmacie du Parc", lgo: "lgpi" });
});

describe("la session plateforme est exigée avant tout", () => {
  const all: [string, () => Promise<unknown>][] = [
    ["test", () => actions.adminTestConnectionAction({ pharmacyId: "ph_1" })],
    ["bips", () => actions.adminScanCountAction({ pharmacyId: "ph_1" })],
    ["retrait", () => actions.adminRevokePostAction({ pharmacyId: "ph_1", postId: "p" })],
    ["dossier", () => actions.adminSetPostExportPathAction({ pharmacyId: "ph_1", postId: "p", exportPath: "\\\\S\\X" })],
    ["relecture", () => actions.adminRequestPostSyncAction({ pharmacyId: "ph_1", postId: "p" })],
    ["code", () => actions.adminCreatePostPairingAction({ pharmacyId: "ph_1" })],
    ["réglages", () => actions.adminUpdateConnectionSettingsAction({ pharmacyId: "ph_1", intervalSeconds: 300 })],
    ["déconnexion", () => actions.adminDisconnectAgentAction({ pharmacyId: "ph_1" })],
    ["robot", () => actions.adminSaveRobotTechnicalAction({ pharmacyId: "ph_1", linkKind: "network" })],
  ];

  for (const [name, run] of all) {
    it(`${name} : sans session plateforme (un titulaire, un visiteur), rien n'est lu ni écrit`, async () => {
      mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT /admin-connexion"));
      await expect(run()).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.resolveSupportScope).not.toHaveBeenCalled();
      for (const fn of [mocks.revoke, mocks.setExportPath, mocks.requestSync, mocks.createPostPairing, mocks.updateSettings, mocks.disconnect, mocks.saveTechnical, mocks.loadOverview]) expect(fn).not.toHaveBeenCalled();
    });
  }
});

describe("l'officine désignée par la console", () => {
  it("officine introuvable ou sans titulaire : un motif, rien n'est écrit", async () => {
    mocks.resolveSupportScope.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    expect(await actions.adminRevokePostAction({ pharmacyId: "ph_x", postId: "p" })).toMatchObject({ ok: false, error: "Officine introuvable." });
    mocks.resolveSupportScope.mockResolvedValue({ ok: false, reason: "NO_OWNER" });
    expect(await actions.adminDisconnectAgentAction({ pharmacyId: "ph_1" })).toMatchObject({ ok: false, error: expect.stringMatching(/titulaire actif/) });
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("un identifiant d'officine absurde est traité comme introuvable, sans lever d'erreur ni lire la base", async () => {
    expect(await actions.adminRevokePostAction({ pharmacyId: "", postId: "p" })).toMatchObject({ ok: false, error: "Officine introuvable." });
    expect(mocks.resolveSupportScope).not.toHaveBeenCalled();
  });
});

describe("chaque geste nomme l'administrateur dans le journal", () => {
  it("retrait d'un poste", async () => {
    const result = await actions.adminRevokePostAction({ pharmacyId: "ph_1", postId: "post_1" });
    expect(result.ok).toBe(true);
    expect(mocks.revoke).toHaveBeenCalledWith(SCOPE, "post_1", ACTOR);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pharmacies/ph_1");
  });

  it("dossier d'export, relecture, code, réglages, déconnexion", async () => {
    await actions.adminSetPostExportPathAction({ pharmacyId: "ph_1", postId: "p", exportPath: "  \\\\SRV\\PharmaBoost  " });
    expect(mocks.setExportPath).toHaveBeenCalledWith(SCOPE, "p", "\\\\SRV\\PharmaBoost", ACTOR);
    await actions.adminRequestPostSyncAction({ pharmacyId: "ph_1", postId: "p" });
    expect(mocks.requestSync).toHaveBeenCalledWith(SCOPE, "p", ACTOR);
    mocks.createPostPairing.mockResolvedValue({ code: "123456", expiresAt: new Date("2026-10-08T11:00:00Z"), postId: "p2" });
    const code = await actions.adminCreatePostPairingAction({ pharmacyId: "ph_1" });
    expect(mocks.createPostPairing).toHaveBeenCalledWith(SCOPE, null, ACTOR);
    expect(code).toMatchObject({ ok: true, data: { code: "123456", postId: "p2" } });
    await actions.adminUpdateConnectionSettingsAction({ pharmacyId: "ph_1", intervalSeconds: "120", exportPath: "C:\\X", scansPath: "" });
    expect(mocks.updateSettings).toHaveBeenCalledWith(SCOPE, { intervalSeconds: 120, exportPath: "C:\\X", scansPath: null }, ACTOR);
    await actions.adminDisconnectAgentAction({ pharmacyId: "ph_1" });
    expect(mocks.disconnect).toHaveBeenCalledWith(SCOPE, ACTOR);
  });
});

describe("la validation", () => {
  it("un intervalle hors de 1 à 60 minutes, ou un dossier à caractère de contrôle : refusé", async () => {
    expect((await actions.adminUpdateConnectionSettingsAction({ pharmacyId: "ph_1", intervalSeconds: 5 })).ok).toBe(false);
    expect((await actions.adminUpdateConnectionSettingsAction({ pharmacyId: "ph_1", intervalSeconds: 300, exportPath: "C:\\a\nb" })).ok).toBe(false);
    expect((await actions.adminSetPostExportPathAction({ pharmacyId: "ph_1", postId: "p", exportPath: "C:\\a\u0000b" })).ok).toBe(false);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.setExportPath).not.toHaveBeenCalled();
  });

  it("un poste d'une autre officine ou un serveur absent : le message du service, sans exception", async () => {
    mocks.setExportPath.mockRejectedValue(new Error("Poste introuvable dans cette officine."));
    expect(await actions.adminSetPostExportPathAction({ pharmacyId: "ph_1", postId: "p", exportPath: "C:\\X" })).toMatchObject({ ok: false, error: "Poste introuvable dans cette officine." });
    mocks.disconnect.mockRejectedValue(new Error("Record to update not found"));
    expect(await actions.adminDisconnectAgentAction({ pharmacyId: "ph_1" })).toMatchObject({ ok: false, error: "Aucun serveur n'est relié pour cette officine." });
  });
});

describe("le test de connexion de l'assistance", () => {
  it("lit l'officine désignée et rend un résultat sérialisable, sans clé ni code", async () => {
    const overview = buildConnectionOverview({ now: NOW, lgo: "lgpi", connection: null, posts: [], stockSyncedAt: new Date(NOW.getTime() - 3600_000), stockLines: 10, stockProblem: null, stockReferences: 8 });
    mocks.loadOverview.mockResolvedValue({ overview, connection: null, posts: [], lgo: "lgpi", stockSyncedAt: null });
    mocks.loadRobot.mockResolvedValue(null);
    const result = await actions.adminTestConnectionAction({ pharmacyId: "ph_1" });
    expect(mocks.loadOverview).toHaveBeenCalledWith("ph_1", expect.any(Date));
    if (!result.ok) throw new Error("attendu");
    expect(typeof result.data.at).toBe("string");
    expect(result.data.limits).toMatch(/ne se connecte pas/);
    expect(JSON.stringify(result.data)).not.toMatch(/keyHash|agentKey|pairingCode/i);
  });
});

describe("les paramètres du robot", () => {
  it("passent par le service, au nom de l'administrateur, et le robot doit déjà exister", async () => {
    mocks.saveTechnical.mockResolvedValue({ ok: true, setup: { manufacturer: "bd-rowa" } });
    const result = await actions.adminSaveRobotTechnicalAction({ pharmacyId: "ph_1", linkKind: "network", host: "PC-ROBOT", port: 6050 });
    expect(result.ok).toBe(true);
    expect(mocks.saveTechnical).toHaveBeenCalledWith("ph_1", expect.objectContaining({ linkKind: "network", host: "PC-ROBOT", port: 6050 }), ACTOR);
    expect(JSON.stringify(mocks.saveTechnical.mock.calls[0][1])).not.toContain("pharmacyId");
    mocks.saveTechnical.mockResolvedValue({ ok: false, error: "Le titulaire n'a pas encore désigné son robot.", fieldErrors: {} });
    expect(await actions.adminSaveRobotTechnicalAction({ pharmacyId: "ph_1", linkKind: "network" })).toMatchObject({ ok: false });
  });

  it("une clé inconnue (un mot de passe) est refusée avant le service", async () => {
    const result = await actions.adminSaveRobotTechnicalAction({ pharmacyId: "ph_1", linkKind: "network", password: "secret" } as never);
    expect(result.ok).toBe(false);
    expect(mocks.saveTechnical).not.toHaveBeenCalled();
  });
});
