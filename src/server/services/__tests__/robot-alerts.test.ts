import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le robot ne lit que l'officine ACTIVE de la session et la personne connectée ; ce qu'il lit dépend de ses
 * permissions (un préparateur ne déclenche aucune lecture d'équipe, d'abonnement ni d'envoi de stock).
 */

const m = vi.hoisted(() => ({
  pharmacy: vi.fn(),
  posts: vi.fn(),
  deposit: vi.fn(),
  subscription: vi.fn(),
  board: vi.fn(),
  lots: vi.fn(),
  joins: vi.fn(),
  desk: vi.fn(),
  objectives: vi.fn(),
  support: vi.fn(),
  training: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    pharmacy: { findUnique: m.pharmacy },
    counterPost: { findMany: m.posts },
    stockDeposit: { findFirst: m.deposit },
    subscription: { findFirst: m.subscription },
  },
}));
vi.mock("@/server/services/stock-lots", () => ({ listLots: m.lots }));
vi.mock("@/server/services/team-access", () => ({ listJoinRequests: m.joins }));
vi.mock("@/server/services/support", () => ({ countPharmacyUnread: m.support }));
vi.mock("@/server/services/mobile/personal", () => ({ loadChallengeBoard: m.board, loadMyObjectives: m.objectives, loadTeamDesk: m.desk }));
vi.mock("@/server/services/mobile/home", () => ({ loadContinueCard: m.training }));

const { loadRobotAlerts } = await import("../robot-alerts");

const NOW = new Date("2026-10-13T08:00:00Z");
const SCOPE = { pharmacyId: "ph_A", organizationId: "org_A", userId: "u_1" };

beforeEach(() => {
  vi.resetAllMocks();
  m.pharmacy.mockResolvedValue({ stockSyncedAt: NOW, organizationId: "org_A", setupStatus: null, setupScheduledAt: null });
  m.posts.mockResolvedValue([]);
  m.deposit.mockResolvedValue(null);
  m.subscription.mockResolvedValue(null);
  m.board.mockResolvedValue({ running: [], ended: [] });
  m.lots.mockResolvedValue({ lots: [] });
  m.joins.mockResolvedValue([]);
  m.desk.mockResolvedValue(null);
  m.objectives.mockResolvedValue([]);
  m.support.mockResolvedValue(0);
  m.training.mockResolvedValue(null);
});

describe("loadRobotAlerts", () => {
  it("titulaire : chaque lecture porte l'officine de la session, et rien d'autre", async () => {
    m.joins.mockResolvedValue([{ id: "jr1", name: "Léa Martin", email: "lea@x.fr", suggestedRole: "TECHNICIAN", requestedAt: NOW }]);
    m.desk.mockResolvedValue({ bonuses: [{ id: "b1", userName: "Léa Martin", label: "Solaires", status: "PROPOSED" }, { id: "b2", userName: "Paul", label: "Ancienne", status: "PAID" }], objectives: [] });
    m.subscription.mockResolvedValue({ status: "PAST_DUE" });
    const alerts = await loadRobotAlerts({ scope: SCOPE, role: "OWNER", isDemo: false, permissions: { manageTeam: true, updateStock: true, manageSettings: true } }, NOW);

    expect(m.pharmacy.mock.calls[0][0].where).toEqual({ id: "ph_A" });
    expect(m.posts.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_A", revokedAt: null });
    expect(m.deposit.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_A" });
    expect(m.subscription.mock.calls[0][0].where).toEqual({ organizationId: "org_A" });
    expect(m.joins).toHaveBeenCalledWith("ph_A");
    expect(m.support).toHaveBeenCalledWith("ph_A");
    expect(m.lots.mock.calls[0][0]).toEqual({ pharmacyId: "ph_A", userId: "u_1" });
    expect(m.desk.mock.calls[0][0]).toBe(SCOPE);

    expect(alerts.map((a) => a.kind)).toEqual(["billing", "join-request", "bonus-to-validate"]);
    expect(alerts.find((a) => a.kind === "bonus-to-validate")?.key).toBe("bonus-to-validate:b1");
  });

  it("préparateur : aucune lecture d'équipe, d'abonnement ni d'envoi de stock", async () => {
    await loadRobotAlerts({ scope: { ...SCOPE, userId: "u_tech" }, role: "TECHNICIAN", isDemo: false, permissions: { manageTeam: false, updateStock: false, manageSettings: false } }, NOW);
    expect(m.joins).not.toHaveBeenCalled();
    expect(m.desk).not.toHaveBeenCalled();
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.deposit).not.toHaveBeenCalled();
    expect(m.objectives.mock.calls[0][0]).toMatchObject({ pharmacyId: "ph_A", userId: "u_tech" });
  });

  it("une lecture qui échoue fait taire son alerte, pas le robot", async () => {
    m.lots.mockRejectedValue(new Error("panne"));
    m.support.mockResolvedValue(1);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const alerts = await loadRobotAlerts({ scope: SCOPE, role: "PHARMACIST", isDemo: false, permissions: { manageTeam: false, updateStock: false, manageSettings: false } }, NOW);
    expect(alerts.map((a) => a.kind)).toEqual(["support"]);
  });

  it("officine neuve : rien à dire", async () => {
    m.pharmacy.mockResolvedValue({ stockSyncedAt: NOW, organizationId: "org_B", setupStatus: null, setupScheduledAt: null });
    const alerts = await loadRobotAlerts({ scope: { pharmacyId: "ph_B", organizationId: "org_B", userId: "u_9" }, role: "OWNER", isDemo: false, permissions: { manageTeam: true, updateStock: true, manageSettings: true } }, NOW);
    expect(alerts).toEqual([]);
    expect(m.posts.mock.calls[0][0].where.pharmacyId).toBe("ph_B");
  });
});
