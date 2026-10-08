import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le robot, côté pharmacien : il désigne fabricant et modèle, ou le retire. Permission d'import d'abord, officine
 * de la session toujours, et AUCUN paramètre technique : ceux-là sont à l'assistance.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  saveIdentity: vi.fn(),
  clearRobot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/robot-setup", () => ({ saveRobotIdentity: mocks.saveIdentity, clearRobotSetup: mocks.clearRobot }));

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const actions = await import("../connection-hub");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
});

describe("saveRobotSetupAction", () => {
  it("enregistre pour l'officine de la session, jamais pour une autre", async () => {
    mocks.saveIdentity.mockResolvedValue({ ok: true, setup: { manufacturer: "bd-rowa" } });
    const result = await actions.saveRobotSetupAction({ manufacturer: "bd-rowa", pharmacyId: "ph_AUTRE" } as never);
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.saveIdentity.mock.calls[0][0]).toEqual(SESSION.scope);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/pas encore disponible/);
  });

  it("rend l'erreur du service, avec ses champs, sans rafraîchir la page", async () => {
    mocks.saveIdentity.mockResolvedValue({ ok: false, error: "Choisissez un fabricant dans la liste.", fieldErrors: { manufacturer: "Choisissez un fabricant dans la liste." } });
    const result = await actions.saveRobotSetupAction({ manufacturer: "" });
    expect(result).toMatchObject({ ok: false, error: "Choisissez un fabricant dans la liste.", fieldErrors: { manufacturer: "Choisissez un fabricant dans la liste." } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sans permission, rien n'est enregistré", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("interdit"));
    await expect(actions.saveRobotSetupAction({ manufacturer: "bd-rowa" })).rejects.toThrow("interdit");
    expect(mocks.saveIdentity).not.toHaveBeenCalled();
  });
});

describe("clearRobotSetupAction", () => {
  it("retire le robot de l'officine de la session", async () => {
    const result = await actions.clearRobotSetupAction();
    expect(mocks.clearRobot).toHaveBeenCalledWith(SESSION.scope);
    expect(result.ok).toBe(true);
  });
});
