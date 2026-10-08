import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le robot de l'officine : le pharmacien désigne fabricant et modèle sans effacer les paramètres techniques ; l'assistance
 * règle ces paramètres sans créer de robot à la place du titulaire. Pas de secret, et l'audit ne retient ni adresse ni chemin.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), audit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.audit }));

const { loadRobotSetup, saveRobotIdentity, saveRobotTechnical, clearRobotSetup } = await import("../robot-setup");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const ADMIN = { platformAdminId: "adm_1" };
const TECH = { manufacturer: "bd-rowa", manufacturerOther: null, model: "Vmax", linkKind: "network", host: "PC-ROBOT", port: 6050, journalPath: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({});
});

describe("saveRobotIdentity (le pharmacien)", () => {
  it("écrit dans l'officine de la session et garde les autres paramètres de l'officine", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { theme: "clair" } });
    const result = await saveRobotIdentity(SCOPE, { manufacturer: "bd-rowa", model: "Vmax" });
    expect(result.ok).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "ph_1" }, select: { settings: true } });
    const call = mocks.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "ph_1" });
    expect(call.data.settings.theme).toBe("clair");
    expect(call.data.settings.robot).toMatchObject({ manufacturer: "bd-rowa", model: "Vmax", linkKind: "unknown", host: null });
  });

  it("n'efface JAMAIS les paramètres techniques que l'assistance a réglés", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { robot: TECH } });
    await saveRobotIdentity(SCOPE, { manufacturer: "mach4", model: "Autre modèle" });
    expect(mocks.update.mock.calls[0][0].data.settings.robot).toMatchObject({ manufacturer: "mach4", model: "Autre modèle", linkKind: "network", host: "PC-ROBOT", port: 6050 });
  });

  it("refuse tout ce qui n'est pas l'identité : un port, une adresse, un mot de passe", async () => {
    for (const extra of [{ port: 6050 }, { host: "PC" }, { password: "secret" }, { journalPath: "C:\\x" }]) {
      const result = await saveRobotIdentity(SCOPE, { manufacturer: "bd-rowa", ...extra } as never);
      expect(result.ok, JSON.stringify(extra)).toBe(false);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("le nom « autre fabricant » n'est gardé que pour « autre »", async () => {
    mocks.findUnique.mockResolvedValue({ settings: {} });
    await saveRobotIdentity(SCOPE, { manufacturer: "bd-rowa", manufacturerOther: "Robotix" });
    expect(mocks.update.mock.calls[0][0].data.settings.robot.manufacturerOther).toBeNull();
    mocks.update.mockClear();
    await saveRobotIdentity(SCOPE, { manufacturer: "autre", manufacturerOther: "Robotix" });
    expect(mocks.update.mock.calls[0][0].data.settings.robot.manufacturerOther).toBe("Robotix");
  });

  it("une erreur par champ pour un fabricant manquant, rien n'est écrit", async () => {
    const result = await saveRobotIdentity(SCOPE, { manufacturer: "inconnu" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors)).toEqual(["manufacturer"]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("l'audit nomme le titulaire et le fabricant, rien d'autre", async () => {
    mocks.findUnique.mockResolvedValue({ settings: {} });
    await saveRobotIdentity(SCOPE, { manufacturer: "bd-rowa", model: "Vmax" });
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ action: "robot.setup_saved", pharmacyId: "ph_1", userId: "u_owner", metadata: { manufacturer: "bd-rowa" } });
  });

  it("officine introuvable : rien n'est écrit", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await saveRobotIdentity(SCOPE, { manufacturer: "bd-rowa" })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("saveRobotTechnical (l'assistance)", () => {
  it("règle les paramètres sans toucher à l'identité, au nom de l'administrateur", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { robot: { manufacturer: "bd-rowa", model: "Vmax", linkKind: "unknown" } } });
    const result = await saveRobotTechnical("ph_1", { linkKind: "network", host: "192.168.1.20", port: "6050", journalPath: "" }, ADMIN);
    expect(result.ok).toBe(true);
    expect(mocks.update.mock.calls[0][0].data.settings.robot).toMatchObject({ manufacturer: "bd-rowa", model: "Vmax", linkKind: "network", host: "192.168.1.20", port: 6050, journalPath: null });
    const entry = mocks.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "robot.technical_saved", pharmacyId: "ph_1", userId: null, platformAdminId: "adm_1" });
    expect(JSON.stringify(entry)).not.toMatch(/192\.168|6050/);
    expect(entry.metadata).toMatchObject({ linkKind: "network", hasNetworkAddress: true });
  });

  it("ne crée pas de robot à la place du titulaire", async () => {
    mocks.findUnique.mockResolvedValue({ settings: {} });
    const result = await saveRobotTechnical("ph_1", { linkKind: "network", host: "PC" }, ADMIN);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/pas encore désigné/) });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuse une adresse web, un port impossible et toute clé inconnue", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { robot: { manufacturer: "bd-rowa", linkKind: "unknown" } } });
    const bad = await saveRobotTechnical("ph_1", { host: "http://x", port: 99999 }, ADMIN);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["host", "port"]);
    expect((await saveRobotTechnical("ph_1", { password: "x" } as never, ADMIN)).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("loadRobotSetup", () => {
  it("relit la configuration de l'officine demandée", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { robot: { manufacturer: "bd-rowa", model: "Vmax" } } });
    expect((await loadRobotSetup("ph_1"))?.model).toBe("Vmax");
  });

  it("des paramètres abîmés ou absents donnent « aucun robot », jamais une erreur", async () => {
    for (const settings of [null, [], "x", { robot: "x" }, { robot: { manufacturer: "disparu" } }, {}]) {
      mocks.findUnique.mockResolvedValue({ settings });
      expect(await loadRobotSetup("ph_1")).toBeNull();
    }
    mocks.findUnique.mockResolvedValue(null);
    expect(await loadRobotSetup("ph_1")).toBeNull();
  });
});

describe("clearRobotSetup", () => {
  it("retire seulement la clé du robot", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { theme: "clair", robot: { manufacturer: "bd-rowa" } } });
    await clearRobotSetup(SCOPE);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "ph_1" }, data: { settings: { theme: "clair" } } });
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ action: "robot.setup_cleared", pharmacyId: "ph_1" });
  });

  it("sans robot, ne réécrit rien", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { theme: "clair" } });
    await clearRobotSetup(SCOPE);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
