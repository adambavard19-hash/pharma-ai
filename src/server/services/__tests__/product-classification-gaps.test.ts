import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le classement du stock fait de ce qu'il ne comprend pas : la réponse de la pharmacienne passe avant tout, un doute ou un
 * échec du modèle ne se confondent pas, et seul un vrai « je ne sais pas » arrive dans le carnet « Produits à connaître ».
 */
const m = vi.hoisted(() => ({
  products: vi.fn(),
  cache: vi.fn(),
  productUpdate: vi.fn(),
  cacheUpsert: vi.fn(),
  usage: vi.fn(),
  classifyProducts: vi.fn(),
  recordGaps: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: { product: { findMany: m.products, update: m.productUpdate }, productClassification: { findMany: m.cache, upsert: m.cacheUpsert }, aiUsageRecord: { create: m.usage } },
}));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: () => ({ info: { id: "anthropic:test", capability: "LIVE" }, classifyProducts: m.classifyProducts }) }));
vi.mock("@/server/services/knowledge-gap-store", () => ({ recordGaps: m.recordGaps }));

const { classifyPharmacyProducts } = await import("../product-classification");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "u1" } as never;
const item = (id: string, name: string) => ({ id, name, brand: null, description: null });

beforeEach(() => {
  vi.clearAllMocks();
  m.cache.mockResolvedValue([]);
  m.recordGaps.mockResolvedValue(0);
  m.usage.mockResolvedValue({});
  m.classifyProducts.mockResolvedValue({ results: [], warnings: [], providerId: "anthropic:test", model: "test", usage: null });
});

describe("la réponse de la pharmacienne passe avant le dictionnaire et le modèle", () => {
  it("un produit qu'elle a rangé garde sa réponse, même si le dictionnaire reconnaît le nom autrement", async () => {
    m.products.mockResolvedValue([item("p1", "LACTIBIANE Référence")]);
    m.cache.mockResolvedValue([{ key: "lactibiane reference", category: "AUTRE", tags: [], confidence: 1, source: "PHARMACIST" }]);
    await classifyPharmacyProducts({ scope });
    expect(m.productUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: "AUTRE", classificationSource: "PHARMACIST" }) }));
    expect(m.classifyProducts).not.toHaveBeenCalled();
    // Le dictionnaire n'écrase jamais sa réponse dans la mémoire commune.
    expect(m.cacheUpsert).not.toHaveBeenCalled();
    expect(m.recordGaps).toHaveBeenCalledWith([]);
  });
});

describe("ce qui arrive dans « Produits à connaître »", () => {
  it("un produit que le modèle a lu sans savoir le ranger", async () => {
    m.products.mockResolvedValue([item("p1", "ZORGLUB 50 ml")]);
    await classifyPharmacyProducts({ scope });
    expect(m.recordGaps).toHaveBeenCalledWith([expect.objectContaining({ kind: "PRODUCT", label: "ZORGLUB 50 ml", reason: "UNCLASSIFIED", pharmacyId: "ph1" })]);
  });

  it("un produit dont le modèle doute, avec sa supposition pour aider la pharmacienne", async () => {
    m.products.mockResolvedValue([item("p1", "ZORGLUB 50 ml")]);
    m.classifyProducts.mockResolvedValue({ results: [{ index: 0, category: "SOINS", tags: [], confidence: 0.3 }], warnings: [], providerId: "anthropic:test", model: "test", usage: null });
    await classifyPharmacyProducts({ scope });
    expect(m.recordGaps).toHaveBeenCalledWith([expect.objectContaining({ reason: "LOW_CONFIDENCE", guess: { category: "SOINS", tags: [], confidence: 0.3 } })]);
  });

  it("un produit que le modèle range avec assurance n'est pas signalé", async () => {
    m.products.mockResolvedValue([item("p1", "ZORGLUB 50 ml")]);
    m.classifyProducts.mockResolvedValue({ results: [{ index: 0, category: "SOINS", tags: [], confidence: 0.9 }], warnings: [], providerId: "anthropic:test", model: "test", usage: null });
    await classifyPharmacyProducts({ scope });
    expect(m.recordGaps).toHaveBeenCalledWith([]);
  });

  it("un échec du modèle (réseau) n'est pas un « trou » : rien n'est signalé, le passage suivant reprendra", async () => {
    m.products.mockResolvedValue([item("p1", "ZORGLUB 50 ml")]);
    m.classifyProducts.mockRejectedValue(new Error("réseau coupé"));
    const summary = await classifyPharmacyProducts({ scope });
    expect(summary.unclassified).toBe(1);
    expect(m.recordGaps).toHaveBeenCalledWith([]);
  });

  it("un produit pas encore traité (lot au-delà de la borne) n'est pas non plus un trou", async () => {
    m.products.mockResolvedValue(Array.from({ length: 50 }, (_, i) => item(`p${i}`, `ZORGLUB ${i}`)));
    const summary = await classifyPharmacyProducts({ scope, maxAiBatches: 1 });
    expect(summary.remaining).toBe(10);
    // Les 40 du premier lot ont été lus sans réponse : trous. Les 10 suivants attendent : pas des trous.
    const gaps = m.recordGaps.mock.calls[0][0] as unknown[];
    expect(gaps).toHaveLength(40);
  });
});
