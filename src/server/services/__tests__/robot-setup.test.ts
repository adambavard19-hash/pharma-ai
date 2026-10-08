import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le robot désigné par le titulaire : gardé dans les paramètres de SON officine, sans rien
 * écraser des autres paramètres, sans secret, et sans que l'audit retienne l'adresse du robot.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), audit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.audit }));

const { loadRobotSetup, saveRobotSetup, clearRobotSetup } = await import("../robot-setup");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({});
});

describe("saveRobotSetup", () => {
  it("écrit dans l'officine de la session et garde les autres paramètres", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { theme: "clair", robot: { manufacturer: "mach4" } } });
    const result = await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa", model: "Vmax", linkKind: "network", host: "ROBOT-PC", port: "6050" });

    expect(result.ok).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "ph_1" }, select: { settings: true } });
    const call = mocks.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "ph_1" });
    expect(call.data.settings.theme).toBe("clair");
    expect(call.data.settings.robot).toMatchObject({ manufacturer: "bd-rowa", model: "Vmax", host: "ROBOT-PC", port: 6050 });
  });

  it("refuse un mot de passe ou toute clé inconnue, sans rien écrire", async () => {
    const result = await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa", password: "secret" } as never);
    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rend une erreur par champ pour une adresse ou un port invalide", async () => {
    const result = await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa", host: "http://x", port: 99999 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["host", "port"]);
      expect(result.error).toBeTruthy();
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("n'efface pas un autre fabricant : le nom « autre » n'est gardé que pour « autre »", async () => {
    mocks.findUnique.mockResolvedValue({ settings: {} });
    await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa", manufacturerOther: "Robotix" });
    expect(mocks.update.mock.calls[0][0].data.settings.robot.manufacturerOther).toBeNull();
  });

  it("l'audit ne retient ni l'adresse ni le chemin", async () => {
    mocks.findUnique.mockResolvedValue({ settings: {} });
    await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa", host: "192.168.1.20", port: 6050, journalPath: "C:\\Robot\\log" });
    const entry = mocks.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: "robot.setup_saved", pharmacyId: "ph_1", userId: "u_owner" });
    expect(JSON.stringify(entry)).not.toMatch(/192\.168|6050|Robot\\\\log/);
    expect(entry.metadata).toMatchObject({ manufacturer: "bd-rowa", hasNetworkAddress: true });
  });

  it("officine introuvable : rien n'est écrit", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const result = await saveRobotSetup(SCOPE, { manufacturer: "bd-rowa" });
    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("loadRobotSetup", () => {
  it("relit la configuration de l'officine demandée", async () => {
    mocks.findUnique.mockResolvedValue({ settings: { robot: { manufacturer: "bd-rowa", model: "Vmax" } } });
    expect((await loadRobotSetup("ph_1"))?.model).toBe("Vmax");
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "ph_1" }, select: { settings: true } });
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
