import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  gapFindMany: vi.fn(),
  gapFindUnique: vi.fn(),
  gapCreate: vi.fn(),
  gapUpdate: vi.fn(),
  productFindMany: vi.fn(),
  productUpdate: vi.fn(),
  pcUpsert: vi.fn(),
  dcUpsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    knowledgeGap: { findMany: m.gapFindMany, findUnique: m.gapFindUnique, create: m.gapCreate, update: m.gapUpdate, count: vi.fn() },
    product: { findMany: m.productFindMany, update: m.productUpdate },
    productClassification: { upsert: m.pcUpsert },
    drugClassification: { upsert: m.dcUpsert },
    pharmacy: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: vi.fn() }));

const { recordGaps } = await import("../knowledge-gap-store");
const { answerProductGap, answerDrugGap, dismissGap } = await import("../knowledge-gaps");

const admin = { id: "adm1", fullName: "Donna" };

beforeEach(() => {
  vi.clearAllMocks();
  m.gapFindMany.mockResolvedValue([]);
  m.gapCreate.mockImplementation(async ({ data }: { data: { kind: string; key: string; pharmacyIds: string[] } }) => ({ id: "g1", kind: data.kind, key: data.key, status: "OPEN", pharmacyIds: data.pharmacyIds, occurrences: 1 }));
});

describe("le carnet de ce que PharmaBoost ne sait pas ranger", () => {
  it("note un sujet nouveau une seule fois, avec la pharmacie qui l'a", async () => {
    await recordGaps([{ kind: "PRODUCT", key: "creme x", label: "CRÈME X", reason: "UNCLASSIFIED", pharmacyId: "ph1" }]);
    expect(m.gapCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "PRODUCT", key: "creme x", reason: "UNCLASSIFIED", pharmacyIds: ["ph1"] }) }));
  });

  it("une autre pharmacie qui a le même produit s'ajoute au même sujet ; la même pharmacie ne le compte pas deux fois", async () => {
    m.gapFindMany.mockResolvedValue([{ id: "g1", kind: "PRODUCT", key: "creme x", status: "OPEN", pharmacyIds: ["ph1"], occurrences: 1 }]);
    await recordGaps([{ kind: "PRODUCT", key: "creme x", label: "CRÈME X", reason: "UNCLASSIFIED", pharmacyId: "ph2" }]);
    expect(m.gapUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g1" }, data: expect.objectContaining({ pharmacyIds: ["ph1", "ph2"], occurrences: { increment: 1 } }) }));
    m.gapUpdate.mockClear();
    await recordGaps([{ kind: "PRODUCT", key: "creme x", label: "CRÈME X", reason: "UNCLASSIFIED", pharmacyId: "ph1" }]);
    expect(m.gapUpdate).not.toHaveBeenCalled();
  });

  it("ne rouvre jamais un sujet déjà répondu ou écarté", async () => {
    m.gapFindMany.mockResolvedValue([{ id: "g1", kind: "MEDICINE", key: "rulid", status: "ANSWERED", pharmacyIds: [], occurrences: 1 }]);
    await recordGaps([{ kind: "MEDICINE", key: "rulid", label: "RULID", reason: "NO_FAMILY", pharmacyId: "ph9" }]);
    expect(m.gapUpdate).not.toHaveBeenCalled();
    expect(m.gapCreate).not.toHaveBeenCalled();
  });

  it("un médicament et un produit de même nom sont deux sujets distincts", async () => {
    await recordGaps([{ kind: "PRODUCT", key: "x", label: "X", reason: "UNCLASSIFIED", pharmacyId: "ph1" }, { kind: "MEDICINE", key: "x", label: "X", reason: "NO_FAMILY", pharmacyId: "ph1" }]);
    expect(m.gapCreate).toHaveBeenCalledTimes(2);
  });
});

describe("la réponse de la pharmacienne pour un produit", () => {
  const gap = { id: "g1", kind: "PRODUCT", key: "ergyphilus intima", label: "ERGYPHILUS INTIMA", status: "OPEN" };

  it("s'écrit dans la mémoire commune comme réponse de la pharmacienne, et se répercute sur les produits déjà en stock", async () => {
    m.gapFindUnique.mockResolvedValue(gap);
    m.productFindMany.mockResolvedValue([{ id: "p1", name: "ERGYPHILUS INTIMA" }, { id: "p2", name: "ERGYPHILUS CONFORT" }]);
    const result = await answerProductGap(admin, "g1", { category: "PROBIOTIQUES", tags: ["probiotique"] });
    expect(result).toMatchObject({ ok: true, label: "ERGYPHILUS INTIMA" });
    expect(m.pcUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "ergyphilus intima" }, create: expect.objectContaining({ source: "PHARMACIST", confidence: 1 }), update: expect.objectContaining({ source: "PHARMACIST", confidence: 1 }) }));
    // Seul le produit dont le nom normalisé est exactement la clé est mis à jour : « ERGYPHILUS CONFORT » n'est pas touché.
    expect(result).toMatchObject({ applied: 1 });
    expect(m.productUpdate).toHaveBeenCalledTimes(1);
    expect(m.productUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ category: "PROBIOTIQUES", classificationSource: "PHARMACIST" }) }));
    expect(m.gapUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: expect.objectContaining({ status: "ANSWERED", answeredByAdminId: "adm1" }) });
  });

  it("refuse une étiquette inventée sans rien écrire, et un sujet déjà tranché", async () => {
    m.gapFindUnique.mockResolvedValue(gap);
    expect((await answerProductGap(admin, "g1", { category: "SOINS", tags: ["étiquette-inventée"] })).ok).toBe(false);
    expect(m.pcUpsert).not.toHaveBeenCalled();
    m.gapFindUnique.mockResolvedValue({ ...gap, status: "ANSWERED" });
    expect((await answerProductGap(admin, "g1", { category: "SOINS", tags: [] })).ok).toBe(false);
  });
});

describe("la réponse de la pharmacienne pour un médicament", () => {
  const gap = { id: "g2", kind: "MEDICINE", key: "rulid 150 mg", label: "RULID 150 mg", status: "OPEN" };
  it("devient la classification de référence : confirmée, à pleine confiance", async () => {
    m.gapFindUnique.mockResolvedValue(gap);
    expect(await answerDrugGap(admin, "g2", { substance: "Roxithromycine", atcCode: "j01fa06", therapeuticClass: "Macrolides" })).toEqual({ ok: true, label: "RULID 150 mg" });
    expect(m.dcUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "rulid 150 mg" }, update: expect.objectContaining({ atcCode: "J01FA06", confidence: 1, validatedAt: expect.any(Date), providerId: "pharmacienne" }) }));
  });
  it("refuse une réponse sans famille ou un code ATC faux", async () => {
    m.gapFindUnique.mockResolvedValue(gap);
    expect((await answerDrugGap(admin, "g2", { substance: "Roxithromycine" })).ok).toBe(false);
    expect((await answerDrugGap(admin, "g2", { atcCode: "ZZ" })).ok).toBe(false);
    expect(m.dcUpsert).not.toHaveBeenCalled();
  });
  it("« je ne sais pas » écarte le sujet sans rien apprendre au moteur", async () => {
    m.gapFindUnique.mockResolvedValue({ label: "RULID", status: "OPEN" });
    expect(await dismissGap(admin, "g2")).toEqual({ ok: true, label: "RULID" });
    expect(m.dcUpsert).not.toHaveBeenCalled();
    expect(m.pcUpsert).not.toHaveBeenCalled();
  });
});
