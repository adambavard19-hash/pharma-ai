import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnderstandingLine } from "@/core/understanding";

/**
 * La famille d'un médicament courant ne dépend plus du crédit du modèle (comptoir 3, 12 oct. 2026 : « credit balance is
 * too low », cétirizine sans famille, aucun conseil). Quand le modèle ne répond pas, une ligne rattachée au catalogue
 * national prend la famille officielle de sa spécialité (Open Medic) ; rien n'est écrit dans la mémoire commune, et la
 * réponse du modèle, le cache et la pharmacienne gardent la priorité.
 */
const m = vi.hoisted(() => ({ cache: vi.fn(), upsert: vi.fn(), usage: vi.fn(), classify: vi.fn(), recordGaps: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: { drugClassification: { findMany: m.cache, upsert: m.upsert }, aiUsageRecord: { create: m.usage } },
}));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: () => ({ info: { id: "anthropic:test", capability: "LIVE" }, classifyDrugs: m.classify }) }));
vi.mock("@/server/services/knowledge-gap-store", () => ({ recordGaps: m.recordGaps }));

const { classificationKey, ensureClassifications } = await import("../classification");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "u1" } as never;

const line = (lineIndex: number, drugName: string, officialCisCode: string | null, officialSubstances: string[] = []): UnderstandingLine => ({
  lineIndex,
  drugName,
  dosage: null,
  form: null,
  posology: null,
  durationDays: null,
  officialName: officialCisCode ? drugName : null,
  officialSubstances,
  officialCisCode,
});
// CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable — une vraie spécialité du catalogue national.
const cetirizine = line(0, "CETIRIZINE BIOGARAN 10 mg", "61665908", ["DICHLORHYDRATE DE CÉTIRIZINE"]);
const officialCetirizine = {
  lineIndex: 0,
  substance: "DICHLORHYDRATE DE CÉTIRIZINE",
  atcCode: "R06AE07",
  therapeuticClass: "Antihistaminiques a usage systemique — derives de la piperazine",
  commonSideEffects: [],
  confidence: 1,
  source: "OFFICIAL",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.cache.mockResolvedValue([]);
  m.upsert.mockResolvedValue({});
  m.usage.mockResolvedValue({});
  m.recordGaps.mockResolvedValue(0);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("le modèle ne répond pas : la famille officielle prend le relais", () => {
  it("crédit épuisé (erreur 400) : la cétirizine reçoit R06AE07 en famille officielle, et rien n'est écrit dans le cache", async () => {
    m.classify.mockRejectedValue(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}'));
    const outcome = await ensureClassifications({ scope, lines: [cetirizine] });
    expect(outcome.drugs).toEqual([officialCetirizine]);
    expect(outcome.officialCount).toBe(1);
    expect(outcome.cachedCount).toBe(0);
    expect(m.upsert).not.toHaveBeenCalled();
    // L'échec reste dit, et tracé comme tel.
    expect(outcome.warnings[0]).toMatch(/^Classification impossible/);
    expect(m.usage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ succeeded: false }) }));
  });

  it("une ligne non rattachée au catalogue (pas de CIS) reste sans famille : rien n'est deviné", async () => {
    m.classify.mockRejectedValue(new Error("réseau coupé"));
    const outcome = await ensureClassifications({ scope, lines: [cetirizine, line(1, "ZORGLUB 10 mg", null), line(2, "INCONNU", "00000000")] });
    expect(outcome.drugs.map((drug) => drug.lineIndex)).toEqual([0]);
  });

  it("fournisseur sans modèle (réponse nulle) : famille officielle, et ce n'est pas un « trou » pour la pharmacienne", async () => {
    m.classify.mockResolvedValue(null);
    const outcome = await ensureClassifications({ scope, lines: [cetirizine] });
    expect(outcome.drugs).toEqual([officialCetirizine]);
    expect(m.recordGaps).toHaveBeenCalledWith([]);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("le modèle lit la ligne sans rien en dire (ni ATC ni classe), ou l'omet : la famille officielle remplace, sans doublon ni trou", async () => {
    m.classify.mockResolvedValue({
      drugs: [{ lineIndex: 0, substance: null, atcCode: null, therapeuticClass: null, commonSideEffects: [], confidence: 0.2, source: "MODEL" }],
      providerId: "anthropic:test",
      model: "test",
      warnings: [],
      usage: null,
    });
    const omitted = line(1, "DOLIPRANE 1000 mg", "60234100", ["PARACÉTAMOL"]);
    const outcome = await ensureClassifications({ scope, lines: [cetirizine, omitted] });
    expect(outcome.drugs).toHaveLength(2);
    expect(outcome.drugs[0]).toEqual(officialCetirizine);
    expect(outcome.drugs[1]).toMatchObject({ lineIndex: 1, atcCode: "N02BE01", substance: "PARACÉTAMOL", source: "OFFICIAL" });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.recordGaps).toHaveBeenCalledWith([]);
  });
});

describe("sans régression quand le modèle répond", () => {
  it("une réponse du modèle avec sa famille passe avant la famille officielle, et s'écrit dans le cache", async () => {
    m.classify.mockResolvedValue({
      drugs: [{ lineIndex: 0, substance: "CÉTIRIZINE", atcCode: "R06AE07", therapeuticClass: "Antihistaminique H1", commonSideEffects: ["somnolence"], confidence: 0.95, source: "MODEL" }],
      providerId: "anthropic:test",
      model: "test",
      warnings: [],
      usage: null,
    });
    const outcome = await ensureClassifications({ scope, lines: [cetirizine] });
    expect(outcome.drugs).toEqual([expect.objectContaining({ source: "MODEL", therapeuticClass: "Antihistaminique H1", commonSideEffects: ["somnolence"] })]);
    expect(outcome.officialCount).toBe(0);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("une classification en cache (ou validée par la pharmacienne) garde la priorité : aucun appel, aucune famille officielle", async () => {
    m.cache.mockResolvedValue([
      { key: classificationKey(cetirizine.drugName), substance: "CÉTIRIZINE", atcCode: "R06AE07", therapeuticClass: "Antihistaminique", commonSideEffects: ["somnolence"], confidence: 1, validatedAt: new Date() },
    ]);
    const outcome = await ensureClassifications({ scope, lines: [cetirizine] });
    expect(m.classify).not.toHaveBeenCalled();
    expect(outcome.drugs).toEqual([expect.objectContaining({ source: "CACHE", therapeuticClass: "Antihistaminique" })]);
    expect(outcome).toMatchObject({ cachedCount: 1, officialCount: 0 });
  });
});
