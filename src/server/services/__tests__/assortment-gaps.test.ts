import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  analysisRun: { findMany: vi.fn() },
  adviceOpportunity: { findMany: vi.fn() },
  partnerBrand: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
}));
const partners = vi.hoisted(() => ({ partnerCatalog: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));
vi.mock("@/server/services/partners/pharmacy-partners", () => partners);

const { loadAssortment } = await import("../assortment-gaps");

const NOW = new Date("2026-10-05T12:00:00Z");
const scope = { pharmacyId: "ph-1", userId: "u-1" };
const opp = (over: Record<string, unknown> = {}) => ({ analysisRunId: "run-1", title: "Tolérance digestive pendant l'antibiothérapie", category: "PROBIOTIQUES", ruleKey: "digestive-tolerance-antibiotics", needKey: null, coverage: "NOT_REFERENCED", answer: null, ...over });
const brand = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, slug: id, name, partnerName: `Labo ${name}`, logoUrl: null, description: null, universes: ["COMPLEMENTS_ALIMENTAIRES"], preference: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.analysisRun.findMany.mockResolvedValue([{ id: "run-1" }]);
  db.adviceOpportunity.findMany.mockResolvedValue([opp()]);
  db.product.findMany.mockResolvedValue([]);
  db.partnerBrand.findMany.mockResolvedValue([]);
  partners.partnerCatalog.mockResolvedValue({ groups: [], visibleCount: 0, hidden: [], refused: [] });
});

describe("votre assortiment : les besoins que le stock n'a pas couverts", () => {
  it("ne lit que l'officine de la session, la dernière analyse de chaque ordonnance, sur la période", async () => {
    await loadAssortment(scope, 30, NOW);
    const where = db.analysisRun.findMany.mock.calls[0][0];
    expect(where.where.pharmacyId).toBe("ph-1");
    expect(where.where.startedAt.gte).toEqual(new Date("2026-09-05T12:00:00Z"));
    expect(where.distinct).toEqual(["prescriptionId"]);
    expect(where.orderBy).toEqual({ startedAt: "desc" });
    expect(where.where.status).toEqual({ in: ["COMPLETED", "PARTIAL"] });
  });

  it("ne compte jamais un besoin écarté par la sécurité", async () => {
    await loadAssortment(scope, 30, NOW);
    expect(db.adviceOpportunity.findMany.mock.calls[0][0].where).toMatchObject({ analysisRunId: { in: ["run-1"] }, isBlocked: false });
  });

  it("aucune analyse sur la période : aucune lecture des besoins, aucun chiffre inventé", async () => {
    db.analysisRun.findMany.mockResolvedValue([]);
    const view = await loadAssortment(scope, 7, NOW);
    expect(db.adviceOpportunity.findMany).not.toHaveBeenCalled();
    expect(view).toMatchObject({ analysedPrescriptions: 0, detected: 0, unmet: 0, coveredRate: null, groups: [] });
  });

  it("compte les besoins couverts et non couverts, et les analyses sans information de couverture", async () => {
    db.analysisRun.findMany.mockResolvedValue([{ id: "run-1" }, { id: "run-2" }]);
    db.adviceOpportunity.findMany.mockResolvedValue([opp({ coverage: "COVERED" }), opp({ coverage: "OUT_OF_STOCK" }), opp({ analysisRunId: "run-2", coverage: null })]);
    const view = await loadAssortment(scope, 30, NOW);
    expect(view).toMatchObject({ analysedPrescriptions: 2, detected: 2, covered: 1, unmet: 1, coveredRate: 50, withoutCoverage: 1 });
    expect(view.groups[0].causes.OUT_OF_STOCK).toBe(1);
  });

  it("propose les marques partenaires VISIBLES de l'univers qui répond au besoin, sans celles que l'officine référence déjà", async () => {
    partners.partnerCatalog.mockResolvedValue({
      groups: [{ key: "COMPLEMENTS_ALIMENTAIRES", label: "Compléments alimentaires", brands: [brand("b1", "Vitalys"), brand("b2", "Naturéo")] }, { key: "DERMOCOSMETIQUE", label: "Dermocosmétique", brands: [brand("b3", "Avène", { universes: ["DERMOCOSMETIQUE"] })] }],
      visibleCount: 3,
      hidden: [],
      refused: [],
    });
    db.partnerBrand.findMany.mockResolvedValue([{ id: "b1", brandKey: "vitalys" }, { id: "b2", brandKey: "natureo" }, { id: "b3", brandKey: "avene" }]);
    db.product.findMany.mockResolvedValue([{ name: "Flore Équilibre 10 milliards", brand: "Vitalys" }]);

    const view = await loadAssortment(scope, 30, NOW);
    // Probiotiques → univers « compléments alimentaires » seulement ; Vitalys est déjà en stock.
    expect(view.groups[0].market.map((m) => m.name)).toEqual(["Naturéo"]);
  });

  it("la lecture du stock ignore les produits supprimés ou inactifs, et reste dans l'officine", async () => {
    partners.partnerCatalog.mockResolvedValue({ groups: [{ key: "COMPLEMENTS_ALIMENTAIRES", label: "x", brands: [brand("b1", "Vitalys")] }], visibleCount: 1, hidden: [], refused: [] });
    db.partnerBrand.findMany.mockResolvedValue([{ id: "b1", brandKey: "vitalys" }]);
    await loadAssortment(scope, 30, NOW);
    expect(db.product.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph-1", isActive: true, deletedAt: null });
  });

  it("aucune marque partenaire visible : aucun besoin ne reçoit de suggestion inventée", async () => {
    const view = await loadAssortment(scope, 30, NOW);
    expect(view.groups[0].market).toEqual([]);
  });
});
