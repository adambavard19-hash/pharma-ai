import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ stock: vi.fn(), known: vi.fn(), ensure: vi.fn(), classifyProducts: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacyDrugStock: { findMany: m.stock }, drugClassification: { findMany: m.known } } }));
vi.mock("@/server/services/classification", () => ({ ensureClassifications: m.ensure, classificationKey: (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }));
vi.mock("@/server/services/product-classification", () => ({ classifyPharmacyProducts: m.classifyProducts }));

const { learnStockMedicines, learnPharmacyStock } = await import("../stock-learning");
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
