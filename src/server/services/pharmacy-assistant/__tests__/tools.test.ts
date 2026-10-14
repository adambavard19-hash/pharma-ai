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
  advise: vi.fn(),
  productFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { sale: { aggregate: m.saleAggregate }, product: { findMany: m.productFindMany } } }));
vi.mock("@/server/services/counter-request", () => ({ adviseCounterRequest: m.advise }));
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
const OWNER = { role: "OWNER", manageTeam: true, teamPerformance: true, stock: true, counter: true };
const TECH = { role: "TECHNICIAN", manageTeam: false, teamPerformance: false, stock: false, counter: true };
const VIEWER = { role: "VIEWER", manageTeam: false, teamPerformance: false, stock: false, counter: false };
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
  m.productFindMany.mockResolvedValue([{ id: "prod_gorge" }]);
  m.advise.mockResolvedValue({
    id: "req_1",
    summary: "Mal de gorge chez un adulte",
    referToDoctor: false,
    referReason: null,
    needs: [{ key: "SORE_THROAT", label: "Mal de gorge", justification: "mal à la gorge" }],
    questions: ["Depuis combien de jours ?", "De la fièvre ?"],
    proposals: [
      { productId: "prod_gorge", name: "Pastilles gorge miel citron", brand: "Labo X", salePriceCents: 650, stockQuantity: 12, imageUrl: null, title: "Mal de gorge", needKey: "SORE_THROAT", shortReason: "Adoucit la gorge", counterScript: "Une pastille à laisser fondre.", patientReason: "", precautions: ["Pas avant 6 ans"], question: null, totalScore: 0.8, vigilances: [{ population: "PREGNANCY", level: "CAUTION", status: "VALIDATED", text: "Avis du pharmacien pendant la grossesse", origin: "RULE", sources: [] }] },
      { productId: "pres_national", name: "Spray national", brand: null, salePriceCents: 0, stockQuantity: 3, imageUrl: null, title: "Mal de gorge", needKey: "SORE_THROAT", shortReason: "Calme la douleur", counterScript: "", patientReason: "", precautions: [], question: "Allergie ?", totalScore: 0.6 },
    ],
    notes: [],
    blocked: ["Spray anesthésiant : déconseillé avant 12 ans"],
    providerId: "anthropic",
    warnings: [],
  });
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
    expect(text).toMatch(/Vente 780/);
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

describe("le conseil au comptoir depuis la Discussion", () => {
  it("appelle le service de la demande sans ordonnance avec les paramètres lus dans la phrase, et la portée de la session", async () => {
    await runPharmacyTool({ ...ctx(), pharmacyIsDemo: false }, "conseil_comptoir", { demande: "  mal à la gorge   depuis hier ", age_ans: 35.4, enceinte: true, allaitement: "oui", traitements: ["Doliprane", "", "Doliprane", 12], pharmacyId: "ph_B" });
    expect(m.advise).toHaveBeenCalledTimes(1);
    expect(m.advise.mock.calls[0][0]).toEqual({
      scope: SCOPE_A,
      pharmacyIsDemo: false,
      input: { text: "mal à la gorge depuis hier", ageYears: 35, isPregnant: true, isBreastfeeding: false, treatments: ["Doliprane"] },
    });
  });

  it("ne suppose rien : sans âge, grossesse, allaitement ni traitement dits, rien n'est rempli", async () => {
    await runPharmacyTool(ctx(), "conseil_comptoir", { demande: "Le patient tousse", age_ans: 300 });
    expect(m.advise.mock.calls[0][0].input).toEqual({ text: "Le patient tousse", ageYears: null, isPregnant: false, isBreastfeeding: false, treatments: [] });
  });

  it("ne renvoie que les produits du service, avec prix, stock, questions, orientation, et un lien seulement pour un produit du stock", async () => {
    const { ok, output } = await runPharmacyTool(ctx(), "conseil_comptoir", { demande: "mal à la gorge, 35 ans", age_ans: 35 });
    expect(ok).toBe(true);
    const produits = output.produits_proposes as { produit: string; prix: string | null; en_stock: number; lien: string | null; raison: string; vigilances: string[] }[];
    expect(produits.map((p) => p.produit)).toEqual(["Pastilles gorge miel citron", "Spray national"]);
    expect(produits[0]).toMatchObject({ prix: "6,50 €", en_stock: 12, lien: "/stock/prod_gorge", raison: "Adoucit la gorge", vigilances: ["Avis du pharmacien pendant la grossesse"] });
    expect(produits[1]).toMatchObject({ prix: null, lien: null });
    expect(output).toMatchObject({ questions_a_poser: ["Depuis combien de jours ?", "De la fièvre ?"], orienter_vers_un_medecin: false, ecartes_par_securite: ["Spray anesthésiant : déconseillé avant 12 ans"] });
    // Le lien de fiche n'est cherché que dans le stock de CETTE officine.
    expect(m.productFindMany.mock.calls[0][0].where).toEqual({ id: { in: ["prod_gorge", "pres_national"] }, pharmacyId: "ph_A", deletedAt: null });
  });

  it("une autre officine conseille avec SON stock : la portée vient de la session, jamais du modèle", async () => {
    const SCOPE_B = { pharmacyId: "ph_B", organizationId: "org_B", userId: "u_7" };
    await runPharmacyTool(ctx(OWNER, SCOPE_B), "conseil_comptoir", { demande: "mal à la gorge", pharmacyId: "ph_A" });
    expect(m.advise.mock.calls[0][0].scope).toEqual(SCOPE_B);
    expect(m.productFindMany.mock.calls[0][0].where.pharmacyId).toBe("ph_B");
  });

  it("dit d'orienter vers un médecin quand le service le dit", async () => {
    m.advise.mockResolvedValueOnce({ id: "r", summary: null, referToDoctor: true, referReason: "Fièvre élevée depuis 3 jours", needs: [], questions: [], proposals: [], notes: [], blocked: [], providerId: "keywords", warnings: [] });
    const { output } = await runPharmacyTool(ctx(), "conseil_comptoir", { demande: "fièvre à 40 depuis 3 jours" });
    expect(output).toMatchObject({ orienter_vers_un_medecin: true, raison_orientation: "Fièvre élevée depuis 3 jours", produits_proposes: [] });
    expect(m.productFindMany).not.toHaveBeenCalled();
  });

  it("refuse une demande vide, et qui ne peut pas conseiller au comptoir", async () => {
    expect((await runPharmacyTool(ctx(), "conseil_comptoir", { demande: "abc" })).output).toHaveProperty("erreur");
    expect((await runPharmacyTool(ctx(VIEWER), "conseil_comptoir", { demande: "mal à la gorge" })).ok).toBe(false);
    expect(m.advise).not.toHaveBeenCalled();
  });
});
