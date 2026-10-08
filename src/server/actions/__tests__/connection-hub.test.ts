import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le test de connexion et la désignation du robot : la permission d'import d'abord, l'officine
 * toujours celle de la session, jamais celle du formulaire.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  loadOverview: vi.fn(),
  loadRobot: vi.fn(),
  saveRobot: vi.fn(),
  clearRobot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/connection-overview", () => ({ loadConnectionOverview: mocks.loadOverview }));
vi.mock("@/server/services/robot-setup", () => ({ loadRobotSetup: mocks.loadRobot, saveRobotSetup: mocks.saveRobot, clearRobotSetup: mocks.clearRobot }));

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const { buildConnectionOverview } = await import("@/core/stock/connection-overview");
const actions = await import("../connection-hub");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" } };
const NOW = new Date();

function loaded() {
  const overview = buildConnectionOverview({ now: NOW, lgo: "lgpi", connection: null, posts: [], stockSyncedAt: new Date(NOW.getTime() - 3600_000), stockLines: 10, stockProblem: null, stockReferences: 8 });
  return { overview, connection: null, posts: [], lgo: "lgpi", stockSyncedAt: new Date(NOW.getTime() - 3600_000) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.loadOverview.mockResolvedValue(loaded());
  mocks.loadRobot.mockResolvedValue(null);
});

describe("testConnectionAction", () => {
  it("exige la permission d'import et lit l'officine de la session", async () => {
    const result = await actions.testConnectionAction();
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.loadOverview).toHaveBeenCalledWith("ph_1", expect.any(Date));
    expect(mocks.loadRobot).toHaveBeenCalledWith("ph_1");
    expect(result.ok).toBe(true);
  });

  it("rend un résultat sérialisable, sans date objet, qui dit ce que le test ne voit pas", async () => {
    const result = await actions.testConnectionAction();
    if (!result.ok) throw new Error("attendu");
    expect(typeof result.data.at).toBe("string");
    expect(result.data.limits).toMatch(/ne se connecte pas/);
    expect(result.data.checks.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.data)).not.toMatch(/keyHash|agentKey|pairingCode/i);
  });

  it("sans permission, la session est refusée avant toute lecture", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("interdit"));
    await expect(actions.testConnectionAction()).rejects.toThrow("interdit");
    expect(mocks.loadOverview).not.toHaveBeenCalled();
  });
});

describe("saveRobotSetupAction", () => {
  it("enregistre pour l'officine de la session, jamais pour une autre", async () => {
    mocks.saveRobot.mockResolvedValue({ ok: true, setup: { manufacturer: "bd-rowa" } });
    const result = await actions.saveRobotSetupAction({ manufacturer: "bd-rowa", pharmacyId: "ph_AUTRE" } as never);
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.saveRobot.mock.calls[0][0]).toEqual(SESSION.scope);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/en préparation/);
  });

  it("rend l'erreur du service, avec ses champs", async () => {
    mocks.saveRobot.mockResolvedValue({ ok: false, error: "Un port est un nombre.", fieldErrors: { port: "Un port est un nombre." } });
    const result = await actions.saveRobotSetupAction({ manufacturer: "bd-rowa", port: "x" });
    expect(result).toMatchObject({ ok: false, error: "Un port est un nombre.", fieldErrors: { port: "Un port est un nombre." } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sans permission, rien n'est enregistré", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("interdit"));
    await expect(actions.saveRobotSetupAction({ manufacturer: "bd-rowa" })).rejects.toThrow("interdit");
    expect(mocks.saveRobot).not.toHaveBeenCalled();
  });
});

describe("clearRobotSetupAction", () => {
  it("retire le robot de l'officine de la session", async () => {
    const result = await actions.clearRobotSetupAction();
    expect(mocks.clearRobot).toHaveBeenCalledWith(SESSION.scope);
    expect(result.ok).toBe(true);
  });
});
