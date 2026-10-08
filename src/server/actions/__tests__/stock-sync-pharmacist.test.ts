import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le pharmacien peut encore faire de la connexion : retirer un comptoir, relire la liste. Toujours pour l'officine
 * de sa session. Les gestes techniques n'existent plus de son côté.
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), revalidatePath: vi.fn(), revoke: vi.fn(), loadOverview: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/stock-sync", () => ({ revokeCounterPost: mocks.revoke }));
vi.mock("@/server/services/connection-overview", () => ({ loadConnectionOverview: mocks.loadOverview }));

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const actions = await import("../stock-sync");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
});

describe("l'action « Retirer » d'un comptoir", () => {
  it("retire pour l'officine de la session, avec la permission d'import", async () => {
    const result = await actions.revokePostAction({ postId: "post_1" });
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PRODUCT_IMPORT);
    expect(mocks.revoke).toHaveBeenCalledWith(SESSION.scope, "post_1");
    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/connexion");
  });

  it("sans permission, rien n'est retiré", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("interdit"));
    await expect(actions.revokePostAction({ postId: "post_1" })).rejects.toThrow("interdit");
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});

describe("il ne reste, côté pharmacien, que deux actions de connexion", () => {
  it("aucun code, aucun dossier, aucun réglage, aucun lien à générer", () => {
    expect(Object.keys(actions).sort()).toEqual(["getConnectionOverviewAction", "revokePostAction"]);
  });
});

describe("getConnectionOverviewAction", () => {
  it("lit l'officine de la session, sans date objet ni secret", async () => {
    mocks.loadOverview.mockResolvedValue({ overview: { counters: [], at: new Date("2026-10-08T10:00:00Z") }, lgo: null });
    const result = await actions.getConnectionOverviewAction();
    expect(mocks.loadOverview).toHaveBeenCalledWith("ph_1");
    if (!result.ok) throw new Error("attendu");
    expect((result.data.overview as unknown as { at: string }).at).toBe("2026-10-08T10:00:00.000Z");
  });
});
