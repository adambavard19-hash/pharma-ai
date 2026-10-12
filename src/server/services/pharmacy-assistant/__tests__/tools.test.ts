import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le robot du logiciel officine ne lit que l'officine ACTIVE de la session : aucun argument du modèle ne peut la
 * changer. Un outil réservé (équipe, stock) est refusé à qui n'y a pas droit, même appelé de force. Aucune donnée de
 * patient ne sort (ni nom, ni médicament d'une vente).
 */

const m = vi.hoisted(() => ({
  dashboard: vi.fn(),
  alerts: vi.fn(),
  training: vi.fn(),
  ranking: vi.fn(),
  saleAggregate: vi.fn(),
  board: vi.fn(),
  objectives: vi.fn(),
  desk: vi.fn(),
  lots: vi.fn(),
  search: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { sale: { aggregate: m.saleAggregate } } }));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));
vi.mock("@/server/services/counter-dashboard", () => ({ loadCounterDashboard: m.dashboard, startOfParisDay: (d: Date) => new Date(d.getTime() - 3600_000) }));
vi.mock("@/server/services/robot-alerts", () => ({ loadRobotAlerts: m.alerts }));
vi.mock("@/server/services/mobile/home", () => ({ loadContinueCard: m.training }));
vi.mock("@/server/services/team-ranking", () => ({ loadTeamRanking: m.ranking }));
vi.mock("@/server/services/mobile/personal", () => ({ loadChallengeBoard: m.board, loadMyObjectives: m.objectives, loadTeamDesk: m.desk }));
vi.mock("@/server/services/stock-lots", () => ({ listLots: m.lots, searchStockItems: m.search }));

const { runPharmacyTool } = await import("../tools");

const NOW = new Date("2026-10-13T10:00:00Z");
const SCOPE_A = { pharmacyId: "ph_A", organizationId: "org_A", userId: "u_1" };
const OWNER = { role: "OWNER", manageTeam: true, teamPerformance: true, stock: true };
const TECH = { role: "TECHNICIAN", manageTeam: false, teamPerformance: false, stock: false };
const ctx = (viewer = OWNER, scope = SCOPE_A) => ({ scope, viewer, alertViewer: { scope, role: viewer.role, isDemo: false, permissions: { manageTeam: viewer.manageTeam, updateStock: false, manageSettings: false } }, now: NOW });

beforeEach(() => {
  vi.resetAllMocks();
  m.dashboard.mockResolvedValue({
    stats: { detected: 4, accepted: 2, declined: 1, salesCount: 3, attributedCents: 4580 },
    status: { pill: { label: "Connecté" }, title: "Votre comptoir est prêt.", posts: [{ label: "Comptoir 1", online: true }] },
    activity: [{ id: "p1", when: "10:12", patient: "DUPONT Marie", lines: [{ name: "DOXYCYCLINE 100 mg", quantity: 1 }], moreLines: 1, comptoir: "Comptoir 1", stage: { label: "terminée" }, reference: "ORD-0780" }],
  });
  m.alerts.mockResolvedValue([{ text: "Une prime attend", severity: "todo", link: { href: "/equipe" } }]);
  m.training.mockResolvedValue(null);
  m.ranking.mockResolvedValue({ rows: [{ userId: "u_1", name: "Moi", proposed: 10, validated: 6, rate: 0.6, rank: 1 }, { userId: "u_2", name: "Léa", proposed: 8, validated: 2, rate: 0.25, rank: 2 }], totals: { proposed: 18, validated: 8, rate: 0.44 } });
  m.saleAggregate.mockResolvedValue({ _count: { _all: 5 }, _sum: { attributedCents: 12990 } });
  m.board.mockResolvedValue({ running: [], ended: [] });
  m.objectives.mockResolvedValue([]);
  m.desk.mockResolvedValue({ members: [], ranking: { rows: [], totals: {} }, objectives: [], bonuses: [] });
  m.lots.mockResolvedValue({ lots: [], counts: { ALL: 0, EXPIRED: 0, URGENT: 0, SOON: 0, OK: 0 }, thresholds: { soonDays: 90, urgentDays: 30 } });
  m.search.mockResolvedValue([]);
});

describe("outils du robot de l'officine", () => {
  it("lit toujours l'officine de la session, quoi que le modèle envoie", async () => {
    await runPharmacyTool(ctx(), "conseils_et_ventes", { perimetre: "equipe", pharmacyId: "ph_B", officine: "ph_B", userId: "u_9" });
    expect(m.ranking.mock.calls[0][0]).toMatchObject({ pharmacyId: "ph_A" });
    expect(m.saleAggregate.mock.calls[0][0].where.pharmacyId).toBe("ph_A");
    await runPharmacyTool(ctx(), "stock_produit", { texte: "creme", pharmacyId: "ph_B" });
    expect(m.search.mock.calls[0][0]).toEqual({ pharmacyId: "ph_A", userId: "u_1" });
    await runPharmacyTool(ctx(), "dates_courtes", { pharmacyId: "ph_B" });
    expect(m.lots.mock.calls[0][0]).toEqual({ pharmacyId: "ph_A", userId: "u_1" });
  });

  it("une autre officine du même titulaire ne lit que la sienne", async () => {
    await runPharmacyTool(ctx(OWNER, { pharmacyId: "ph_B", organizationId: "org_B", userId: "u_1" }), "ma_journee", {});
    expect(m.dashboard.mock.calls[0][0]).toMatchObject({ pharmacyId: "ph_B" });
  });

  it("ne laisse sortir aucun patient ni médicament d'une vente", async () => {
    const { ok, output } = await runPharmacyTool(ctx(), "ma_journee", {});
    expect(ok).toBe(true);
    const text = JSON.stringify(output);
    expect(text).not.toMatch(/DUPONT|Marie|DOXYCYCLINE/);
    expect(text).toMatch(/Ordonnance 0780/);
    expect(text).toMatch(/"produits":2/);
  });

  it("refuse les outils réservés à qui n'y a pas droit, même appelés de force", async () => {
    expect((await runPharmacyTool(ctx(TECH), "equipe", {})).ok).toBe(false);
    expect((await runPharmacyTool(ctx(TECH), "dates_courtes", {})).ok).toBe(false);
    expect((await runPharmacyTool(ctx(TECH), "stock_produit", { texte: "abc" })).ok).toBe(false);
    expect(m.desk).not.toHaveBeenCalled();
    expect(m.lots).not.toHaveBeenCalled();
    expect((await runPharmacyTool(ctx(), "supprimer_tout", {})).ok).toBe(false);
  });

  it("le préparateur ne voit pas le détail de ses collègues", async () => {
    const { output } = await runPharmacyTool(ctx(TECH), "conseils_et_ventes", { perimetre: "equipe" });
    expect(output.par_collaborateur).toBe("réservé au titulaire");
    expect(JSON.stringify(output)).not.toMatch(/Léa/);
    const mine = await runPharmacyTool(ctx(TECH), "conseils_et_ventes", {});
    expect(mine.output).toMatchObject({ perimetre: "moi", conseils_proposes: 10, conseils_acceptes: 6, taux: "60 %" });
    expect(m.saleAggregate.mock.calls.at(-1)?.[0].where.userId).toBe("u_1");
  });

  it("une lecture qui échoue renvoie une erreur lisible", async () => {
    m.board.mockRejectedValueOnce(new Error("panne"));
    const result = await runPharmacyTool(ctx(), "challenges", {});
    expect(result).toEqual({ ok: false, output: { erreur: "Lecture impossible pour l'instant." } });
  });
});
