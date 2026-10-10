import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ stock: vi.fn(), known: vi.fn(), ensure: vi.fn(), classifyProducts: vi.fn(), pharmacies: vi.fn(), backlog: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacyDrugStock: { findMany: m.stock }, drugClassification: { findMany: m.known }, pharmacy: { findMany: m.pharmacies }, product: { groupBy: m.backlog } } }));
vi.mock("@/server/services/classification", () => ({ ensureClassifications: m.ensure, classificationKey: (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }));
vi.mock("@/server/services/product-classification", () => ({ classifyPharmacyProducts: m.classifyProducts }));

const { learnStockMedicines, learnPharmacyStock, runStockLearningPass } = await import("../stock-learning");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "u1" } as never;

const row = (id: string, name: string, substances: string[] = []) => ({ presentation: { specialty: { id, name, pharmaceuticalForm: "comprimé", compositions: substances.map((substanceLabel) => ({ substanceLabel })) } } });

beforeEach(() => {
  vi.clearAllMocks();
  m.known.mockResolvedValue([]);
  m.ensure.mockResolvedValue({ drugs: [] });
  m.classifyProducts.mockResolvedValue({ considered: 0 });
});

describe("connaître chaque médicament du stock avant qu'on en ait besoin", () => {
  it("classe les médicaments en stock que la mémoire commune ne connaît pas, avec leurs substances officielles", async () => {
    m.stock.mockResolvedValue([row("s1", "AMOXICILLINE KRKA 1 g", ["amoxicilline"]), row("s1", "AMOXICILLINE KRKA 1 g"), row("s2", "RULID 150 mg", ["roxithromycine"])]);
    m.known.mockResolvedValue([{ key: "rulid 150 mg" }]);
    const result = await learnStockMedicines(scope);
    expect(result).toEqual({ inStock: 2, alreadyKnown: 1, processed: 1, remaining: 0 });
    const lines = m.ensure.mock.calls[0][0].lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ drugName: "AMOXICILLINE KRKA 1 g", officialName: "AMOXICILLINE KRKA 1 g", officialSubstances: ["amoxicilline"], form: "comprimé" });
  });

  it("ne rappelle jamais le modèle pour un stock déjà connu", async () => {
    m.stock.mockResolvedValue([row("s1", "RULID 150 mg")]);
    m.known.mockResolvedValue([{ key: "rulid 150 mg" }]);
    expect(await learnStockMedicines(scope)).toMatchObject({ processed: 0, remaining: 0 });
    expect(m.ensure).not.toHaveBeenCalled();
  });

  it("travaille par lots de trente, borne le passage, et dit ce qu'il reste pour la nuit suivante", async () => {
    m.stock.mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(`s${i}`, `MEDICAMENT ${i}`)));
    const result = await learnStockMedicines(scope, { maxBatches: 2 });
    expect(result).toEqual({ inStock: 100, alreadyKnown: 0, processed: 60, remaining: 40 });
    expect(m.ensure).toHaveBeenCalledTimes(2);
    expect(m.ensure.mock.calls[0][0].lines).toHaveLength(30);
  });

  it("un lot qui échoue n'arrête pas les suivants", async () => {
    m.stock.mockResolvedValue(Array.from({ length: 60 }, (_, i) => row(`s${i}`, `MEDICAMENT ${i}`)));
    m.ensure.mockRejectedValueOnce(new Error("modèle indisponible"));
    await learnStockMedicines(scope, { maxBatches: 5 });
    expect(m.ensure).toHaveBeenCalledTimes(2);
  });

  it("une pharmacie sans médicament en stock : rien à faire", async () => {
    m.stock.mockResolvedValue([]);
    expect(await learnStockMedicines(scope)).toEqual({ inStock: 0, alreadyKnown: 0, processed: 0, remaining: 0 });
  });

  it("apprendre un stock, c'est ranger les produits PUIS classer les médicaments", async () => {
    m.stock.mockResolvedValue([row("s1", "RULID 150 mg")]);
    const result = await learnPharmacyStock(scope);
    expect(m.classifyProducts).toHaveBeenCalledWith({ scope, maxAiBatches: 60 });
    expect(result.medicines.processed).toBe(1);
  });
});

describe("l'échéance d'un passage", () => {
  it("n'entame plus de lot passé l'échéance et dit ce qui reste", async () => {
    m.stock.mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(`s${i}`, `MEDICAMENT ${i}`)));
    let calls = 0;
    m.ensure.mockImplementation(async () => { calls += 1; return { drugs: [] }; });
    // Échéance déjà dépassée : aucun lot n'est commencé.
    const none = await learnStockMedicines(scope, { maxBatches: 5, deadlineAt: Date.now() - 1 });
    expect(calls).toBe(0);
    expect(none).toMatchObject({ processed: 0, remaining: 100 });
  });
});

describe("un passage sur toutes les pharmacies", () => {
  const pharmacy = (id: string, owner = true) => ({ id, organizationId: "org", memberships: owner ? [{ userId: `u-${id}` }] : [] });
  beforeEach(() => {
    m.stock.mockResolvedValue([]);
    m.classifyProducts.mockResolvedValue({ considered: 0, remaining: 0 });
  });

  it("commence par la pharmacie qui a le plus de produits à ranger", async () => {
    m.pharmacies.mockResolvedValue([pharmacy("petit"), pharmacy("gros")]);
    m.backlog.mockResolvedValue([{ pharmacyId: "petit", _count: 3 }, { pharmacyId: "gros", _count: 900 }]);
    const order: string[] = [];
    m.classifyProducts.mockImplementation(async ({ scope }: { scope: { pharmacyId: string } }) => { order.push(scope.pharmacyId); return { considered: 0, remaining: 0 }; });
    const pass = await runStockLearningPass({ deadlineAt: Date.now() + 60_000 });
    expect(order).toEqual(["gros", "petit"]);
    expect(pass).toEqual({ pharmacies: 2, processed: 2, skipped: 0, moreToDo: false });
  });

  it("dit qu'il reste à faire quand des lots restent, ou quand l'échéance a coupé les pharmacies suivantes", async () => {
    m.pharmacies.mockResolvedValue([pharmacy("a"), pharmacy("b")]);
    m.backlog.mockResolvedValue([]);
    m.classifyProducts.mockResolvedValue({ considered: 40, remaining: 120 });
    expect((await runStockLearningPass({ deadlineAt: Date.now() + 60_000 })).moreToDo).toBe(true);
    m.classifyProducts.mockClear();
    const late = await runStockLearningPass({ deadlineAt: Date.now() - 1 });
    expect(m.classifyProducts).not.toHaveBeenCalled();
    expect(late).toMatchObject({ processed: 0, skipped: 2, moreToDo: true });
  });

  it("saute une pharmacie sans titulaire, et un échec d'une pharmacie n'arrête pas les autres", async () => {
    m.pharmacies.mockResolvedValue([pharmacy("sans", false), pharmacy("casse"), pharmacy("ok")]);
    m.backlog.mockResolvedValue([]);
    m.classifyProducts.mockImplementation(async ({ scope }: { scope: { pharmacyId: string } }) => { if (scope.pharmacyId === "casse") throw new Error("boom"); return { considered: 0, remaining: 0 }; });
    expect(await runStockLearningPass({ deadlineAt: Date.now() + 60_000 })).toEqual({ pharmacies: 3, processed: 1, skipped: 2, moreToDo: false });
  });

  it("peut se limiter à une pharmacie", async () => {
    m.pharmacies.mockResolvedValue([pharmacy("ph1")]);
    m.backlog.mockResolvedValue([]);
    await runStockLearningPass({ deadlineAt: Date.now() + 60_000, pharmacyId: "ph1" });
    expect(m.pharmacies).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "ph1", isDemo: false }) }));
  });
});
