import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, CatalogProduct, ScoredAlternative, ScoredRecommendation } from "@/core/ai/types";
import { product } from "@/core/ai/__tests__/fixtures";

/**
 * Ce que l'analyse écrit pour ranger un conseil sous son médicament et lui
 * garder ses alternatives. Le moteur est simulé (il a ses propres tests) : on
 * vérifie ici le rapprochement avec les lignes de l'ordonnance et ce qui part
 * en base, sans base ni réseau.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    analysisRun: { create: vi.fn() },
    safetyFinding: { create: vi.fn() },
    adviceOpportunity: { create: vi.fn() },
    treatmentExplanation: { upsert: vi.fn() },
    recommendation: { deleteMany: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    recommendationEvent: { create: vi.fn() },
    prescription: { update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      prescription: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
    runAnalysisPipeline: vi.fn(),
    enrichCatalog: vi.fn(),
    recordAudit: vi.fn(),
    createNotification: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/core/ai/pipeline", () => ({ runAnalysisPipeline: mocks.runAnalysisPipeline }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("../interactions", () => ({
  loadInteractionCatalogState: async () => ({ status: "NOT_LOADED" }),
  loadInteractionData: async () => ({ rules: [], classMembers: [] }),
  substanceKey: (label: string) => label.toLowerCase(),
}));
vi.mock("../catalog", () => ({
  loadCatalogSnapshot: async () => [],
  loadStockState: async () => ({ configured: true, referenceCount: 4 }),
  loadNationalDrugCandidates: async () => [],
  loadPharmacyRules: async () => [],
  loadPreferredRanges: async () => [],
  loadValidationHistory: async () => ({}),
  enrichCatalog: mocks.enrichCatalog,
}));
vi.mock("../patients", () => ({ buildPatientContext: async () => ({ patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false }) }));
vi.mock("../drug-identification", () => ({
  identifyPrescriptionLines: async () => [],
  loadSpecialtyFacts: async () => new Map(),
  proposeSpecialties: async () => [],
}));
vi.mock("../reference", () => ({ getReferenceCatalogState: async () => ({ status: "EMPTY" }) }));
vi.mock("../classification", () => ({
  ensureClassifications: async () => ({ drugs: [], providerId: "test", model: "m", warnings: [], usage: null, cachedCount: 0, durationMs: 0 }),
}));
vi.mock("@/server/ai/registry", () => ({
  getOCRProvider: () => ({ info: { id: "ocr", capability: "SIMULATED" } }),
  getStorageProvider: () => ({}),
  getAIProvider: () => ({ info: { id: "ai", capability: "SIMULATED" }, explainTreatment: async () => ({}) }),
  getDrugKnowledgeProvider: () => ({ info: { id: "kb", capability: "SIMULATED" }, lookupMany: async () => new Map() }),
}));

const { analysePrescription } = await import("../analysis");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "user_1" };

function line(id: string, position: number, drugName: string) {
  return {
    id,
    position,
    status: "CONFIRMED",
    drugName,
    dosage: null,
    form: null,
    posology: null,
    durationDays: null,
    quantity: null,
    rawText: null,
    instructions: null,
    fieldConfidence: {},
    unreadableFields: [],
    drugSpecialtyId: null,
  };
}

const PRESCRIPTION = {
  id: "rx_1",
  pharmacyId: "ph_1",
  reference: "ORD-0001",
  patientId: null,
  isDemo: false,
  lines: [line("line_a", 0, "Amoxicilline 1 g"), line("line_b", 1, "Ibuprofene 400"), line("line_c", 2, "Paracetamol 1 g")],
};

const BREAKDOWN = { relevance: 1, safety: 1, availability: 1, patientFit: 0.95, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.8 };

function alternative(productId: string, totalScore = 0.8): ScoredAlternative {
  return {
    productId,
    totalScore,
    breakdown: BREAKDOWN,
    justification: `Référence retenue : ${productId}.`,
    shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
    patientReason: `${productId} l'accompagne.`,
    counterScript: `« ${productId} l'accompagne. »`,
    precautions: ["À conserver au frais."],
    explanation: [],
    vigilances: [],
    shortDate: null,
  };
}

function recommendation(productId: string, alternatives?: ScoredAlternative[], opportunityKey = "digestive-tolerance-antibiotics"): ScoredRecommendation {
  return { ...alternative(productId, 0.9), opportunityKey, ...(alternatives ? { alternatives } : {}) };
}

function opportunity(key: string, triggeredBy: { lineIndex: number; drugName: string }[]) {
  return {
    key,
    kind: "TOLERANCE",
    category: "PROBIOTIQUES",
    title: key,
    rationale: "r",
    shortReason: "s",
    counterScriptTemplate: "c",
    patientReasonTemplate: "p",
    clinicalContext: null,
    safetyNotes: [],
    priority: 70,
    isBlocked: false,
    blockReason: null,
    matchingTags: [],
    excludeTags: [],
    triggeredBy,
  };
}

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    engineVersion: "1.0.0",
    status: "COMPLETED",
    outcome: "PROPOSALS",
    safetyFindings: [],
    explanations: [],
    opportunities: [],
    recommendations: [],
    trace: [],
    blockedReasons: [],
    usedSimulatedProviders: false,
    vigilances: [],
    ...overrides,
  } as AnalysisResult;
}

const catalog = (...items: Partial<CatalogProduct>[]) => items.map((overrides) => product(overrides));
const SHELF = catalog({ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.prescription.findUnique.mockResolvedValue(PRESCRIPTION);
  mocks.enrichCatalog.mockResolvedValue(SHELF);
  mocks.tx.analysisRun.create.mockResolvedValue({ id: "run_1" });
  mocks.tx.adviceOpportunity.create.mockImplementation(async ({ data }: { data: { title: string } }) => ({ id: `opp_${data.title}` }));
  mocks.tx.recommendation.findMany.mockResolvedValue([]);
  mocks.tx.recommendation.create.mockImplementation(async () => ({ id: "rec_1" }));
});

const analyse = (value: AnalysisResult) => {
  mocks.runAnalysisPipeline.mockReturnValue(value);
  return analysePrescription({ scope: SCOPE, prescriptionId: "rx_1" });
};
const opportunityWrites = () => mocks.tx.adviceOpportunity.create.mock.calls.map(([arg]) => arg.data);
const recommendationWrites = () => mocks.tx.recommendation.create.mock.calls.map(([arg]) => arg.data);

describe("les lignes qui ont déclenché un conseil", () => {
  it("s'écrivent avec le conseil, rapprochées des lignes par position", async () => {
    await analyse(
      result({
        opportunities: [
          opportunity("antibiotique", [{ lineIndex: 0, drugName: "Amoxicilline 1 g" }]),
          opportunity("deux-lignes", [{ lineIndex: 2, drugName: "Paracetamol 1 g" }, { lineIndex: 1, drugName: "Ibuprofene 400" }]),
        ] as AnalysisResult["opportunities"],
      }),
    );
    const writes = opportunityWrites();
    expect(writes[0].triggeredLineIds).toEqual(["line_a"]);
    // L'ordre est celui du moteur ; la ligne est retrouvée par sa position, pas par son rang.
    expect(writes[1].triggeredLineIds).toEqual(["line_c", "line_b"]);
  });

  it("ignorent une ligne introuvable, sans erreur", async () => {
    await analyse(result({ opportunities: [opportunity("fantome", [{ lineIndex: 9, drugName: "Inconnu" }, { lineIndex: 1, drugName: "Ibuprofene 400" }])] as AnalysisResult["opportunities"] }));
    expect(opportunityWrites()[0].triggeredLineIds).toEqual(["line_b"]);
  });

  it("restent vides pour un conseil que rien ne rattache à une ligne", async () => {
    await analyse(result({ opportunities: [opportunity("seul", [])] as AnalysisResult["opportunities"] }));
    expect(opportunityWrites()[0].triggeredLineIds).toEqual([]);
  });
});

describe("les alternatives d'un conseil", () => {
  it("s'écrivent avec lui, dans l'ordre du moteur, avec de quoi être substituées", async () => {
    const alternatives = [alternative("p2", 0.85), alternative("p3", 0.8), alternative("p4", 0.7)];
    await analyse(result({ recommendations: [recommendation("p1", alternatives)] }));
    const [write] = recommendationWrites();
    expect(write.productId).toBe("p1");
    expect(write.alternatives).toEqual(alternatives);
    expect(write.alternatives[0]).toMatchObject({ productId: "p2", totalScore: 0.85, counterScript: "« p2 l'accompagne. »", precautions: ["À conserver au frais."] });
  });

  it("restent absentes (null en base) quand le moteur n'en a pas trouvé", async () => {
    await analyse(result({ recommendations: [recommendation("p1")] }));
    expect(recommendationWrites()[0].alternatives).toBeUndefined();
    await analyse(result({ recommendations: [recommendation("p1", [])] }));
    expect(recommendationWrites()[1].alternatives).toBeUndefined();
  });

  it("écartent de la liste un produit déjà tranché sur cette ordonnance, sans toucher au conseil", async () => {
    mocks.tx.recommendation.findMany.mockResolvedValue([{ productId: "p3" }]);
    await analyse(result({ recommendations: [recommendation("p1", [alternative("p2"), alternative("p3"), alternative("p4")])] }));
    expect(recommendationWrites()[0].alternatives.map((a: ScoredAlternative) => a.productId)).toEqual(["p2", "p4"]);
  });

  it("ne reproposent pas un produit déjà tranché comme conseil, ni ne gardent ses alternatives", async () => {
    mocks.tx.recommendation.findMany.mockResolvedValue([{ productId: "p1" }]);
    await analyse(result({ recommendations: [recommendation("p1", [alternative("p2")])] }));
    expect(mocks.tx.recommendation.create).not.toHaveBeenCalled();
  });

  it("n'écrivent que des références de l'officine : un médicament conseil du catalogue national n'est pas une alternative", async () => {
    mocks.enrichCatalog.mockResolvedValue([
      ...SHELF,
      product({ id: "nat-1", origin: "NATIONAL_DRUG", presentationId: "pres-1" }),
    ]);
    await analyse(result({ recommendations: [recommendation("p1", [alternative("nat-1"), alternative("p2")])] }));
    expect(recommendationWrites()[0].alternatives.map((a: ScoredAlternative) => a.productId)).toEqual(["p2"]);
  });

  it("ne sont pas écrites sous un médicament conseil du catalogue national : l'échange n'y a pas de retour possible", async () => {
    mocks.enrichCatalog.mockResolvedValue([...SHELF, product({ id: "nat-1", origin: "NATIONAL_DRUG", presentationId: "pres-1" })]);
    await analyse(result({ recommendations: [recommendation("nat-1", [alternative("p2")])] }));
    const [write] = recommendationWrites();
    expect(write.productId).toBeNull();
    expect(write.presentationId).toBe("pres-1");
    expect(write.alternatives).toBeUndefined();
  });

  it("une analyse sans aucune alternative écrit les conseils comme avant", async () => {
    await analyse(
      result({
        opportunities: [opportunity("antibiotique", [{ lineIndex: 0, drugName: "Amoxicilline 1 g" }])] as AnalysisResult["opportunities"],
        recommendations: [recommendation("p1")],
      }),
    );
    expect(mocks.tx.recommendation.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.recommendationEvent.create).toHaveBeenCalledTimes(1);
  });
});

describe("l'audit", () => {
  it("ne porte que des comptes : ni alternative, ni produit, ni ligne", async () => {
    await analyse(
      result({
        opportunities: [opportunity("antibiotique", [{ lineIndex: 0, drugName: "Amoxicilline 1 g" }])] as AnalysisResult["opportunities"],
        recommendations: [recommendation("p1", [alternative("p2"), alternative("p3")])],
      }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const [entry] = mocks.recordAudit.mock.calls[0];
    expect(Object.keys(entry.metadata).sort()).toEqual(["analysisRunId", "blocking", "durationMs", "engineVersion", "recommendations"]);
    expect(JSON.stringify(entry)).not.toMatch(/p1|p2|p3|line_a|alternative/);
  });
});
