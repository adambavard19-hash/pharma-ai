import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { drug, patient, product, rule } from "./fixtures";
import type { DrugKnowledge, PipelineStageName } from "../types";

function buildInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  const knowledge = new Map<string, DrugKnowledge | null>([["amoxicilline", drug()]]);

  return {
    lines: [
      {
        lineIndex: 0,
        drugName: "Amoxicilline",
        posology: "1 comprimé matin et soir",
        durationDays: 6,
        confirmed: true,
      },
    ],
    knowledge,
    patient: patient(),
    catalog: [product()],
    rules: [],
    history: {},
    explanations: [
      {
        lineIndex: 0,
        purpose: "Cet antibiotique combat une infection bactérienne.",
        instructions: "1 comprimé matin et soir",
        tips: [],
        precautions: [],
        source: "REFERENTIAL",
        sourceRefs: ["Test 1.0"],
        confidence: 0.9,
        requiresReview: true,
      },
    ],
    extractionFindings: [],
    usedSimulatedProviders: false,
    ...overrides,
  };
}

/** Ordre imposé par l'architecture : la sécurité d'abord, le commercial en dernier. */
const EXPECTED_ORDER: PipelineStageName[] = [
  "SAFETY",
  "TREATMENT_UNDERSTANDING",
  "ADVICE_OPPORTUNITIES",
  "CATALOG_MATCHING",
  "SCORING",
  "COMMERCIAL_OPTIMIZATION",
];

describe("pipeline — ordre des étapes", () => {
  it("exécute les étapes dans l'ordre sécurité → … → commercial", () => {
    const result = runAnalysisPipeline(buildInput());
    expect(result.trace.map((stage) => stage.stage)).toEqual(EXPECTED_ORDER);
  });

  it("place systématiquement l'optimisation commerciale en dernier", () => {
    const result = runAnalysisPipeline(buildInput());
    const commercialIndex = result.trace.findIndex(
      (stage) => stage.stage === "COMMERCIAL_OPTIMIZATION",
    );
    expect(commercialIndex).toBe(result.trace.length - 1);
  });

  it("conserve une trace exploitable de chaque étape", () => {
    const result = runAnalysisPipeline(buildInput());
    for (const stage of result.trace) {
      expect(stage.label.length).toBeGreaterThan(0);
      expect(stage.inputCount).toBeGreaterThanOrEqual(0);
      expect(stage.outputCount).toBeGreaterThanOrEqual(0);
      expect(["OK", "PARTIAL", "BLOCKED", "SKIPPED"]).toContain(stage.status);
    }
  });
});

describe("pipeline — garde-fous", () => {
  it("refuse d'analyser sans ligne confirmée par un professionnel", () => {
    const result = runAnalysisPipeline(
      buildInput({
        lines: [
          {
            lineIndex: 0,
            drugName: "Amoxicilline",
            posology: null,
            durationDays: null,
            confirmed: false,
          },
        ],
      }),
    );

    expect(result.status).toBe("FAILED");
    expect(result.recommendations).toHaveLength(0);
    expect(result.blockedReasons.length).toBeGreaterThan(0);
  });

  it("ne propose jamais un produit en rupture de stock", () => {
    const result = runAnalysisPipeline(
      buildInput({ catalog: [product({ stockQuantity: 0, availableInSiblingPharmacy: false })] }),
    );
    expect(result.recommendations).toHaveLength(0);
  });

  it("ne propose jamais un produit correspondant à une allergie déclarée", () => {
    const result = runAnalysisPipeline(
      buildInput({
        patient: patient({ allergies: ["ferments lactiques"] }),
        catalog: [product({ matchingTags: ["probiotique", "ferments lactiques"] })],
      }),
    );
    expect(result.recommendations).toHaveLength(0);
    expect(
      result.safetyFindings.some((f) => f.code === "PATIENT_ALLERGY"),
    ).toBe(true);
  });

  it("ne propose jamais une référence exclue par l'officine", () => {
    const result = runAnalysisPipeline(
      buildInput({
        rules: [rule({ type: "EXCLUDE_PRODUCT", productId: "prod-1" })],
      }),
    );
    expect(result.recommendations).toHaveLength(0);
  });

  it("bloque une opportunité contre-indiquée et en conserve le motif", () => {
    const result = runAnalysisPipeline(
      buildInput({
        knowledge: new Map([
          [
            "escitalopram",
            drug({
              name: "Escitalopram",
              atcCode: "N06AB10",
              therapeuticClass: "Antidépresseur",
              commonSideEffects: ["fatigue"],
            }),
          ],
        ]),
        lines: [
          {
            lineIndex: 0,
            drugName: "Escitalopram",
            posology: "1 comprimé le matin",
            durationDays: 30,
            confirmed: true,
          },
        ],
        patient: patient({ renalImpairment: true }),
        catalog: [
          product({
            id: "mag",
            category: "MAGNESIUM",
            matchingTags: ["magnésium", "fatigue", "crampes"],
          }),
        ],
      }),
    );

    const magnesium = result.opportunities.find((o) => o.key === "magnesium-fatigue");
    expect(magnesium?.isBlocked).toBe(true);
    expect(result.blockedReasons.join(" ")).toContain("rénale");
    expect(result.recommendations.some((r) => r.productId === "mag")).toBe(false);
  });

  it("limite le nombre de propositions et le signale dans la trace", () => {
    const catalog = Array.from({ length: 10 }, (_, index) =>
      product({ id: `p${index}`, reference: `REF-${index}` }),
    );
    const result = runAnalysisPipeline(
      buildInput({ catalog, maxRecommendations: 2 }),
    );
    expect(result.recommendations.length).toBeLessThanOrEqual(2);
  });
});

describe("pipeline — séparation médical / commercial", () => {
  /**
   * Le test central du produit : à pertinence clinique nettement différente,
   * la marge ne doit jamais faire basculer le choix.
   */
  it("retient la référence la plus pertinente, pas la plus rentable", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [
          product({
            id: "pertinent",
            name: "Probiotique adapté",
            matchingTags: ["probiotique", "flore", "intestinale", "tolérance", "digestive"],
            purchasePriceCents: 1400,
            salePriceCents: 1490,
          }),
          product({
            id: "rentable",
            name: "Produit très rentable",
            category: "PROBIOTIQUES",
            matchingTags: ["probiotique"],
            purchasePriceCents: 100,
            salePriceCents: 4900,
          }),
        ],
      }),
    );

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].productId).toBe("pertinent");
  });

  it("n'utilise le départage commercial qu'entre références équivalentes", () => {
    // Deux références rigoureusement identiques hormis la marge.
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [
          product({ id: "a", purchasePriceCents: 1400, salePriceCents: 1490 }),
          product({ id: "b", purchasePriceCents: 600, salePriceCents: 1490 }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].productId).toBe("b");

    const commercialStage = result.trace.find(
      (stage) => stage.stage === "COMMERCIAL_OPTIMIZATION",
    );
    expect(commercialStage?.notes.join(" ")).toContain("départage commercial");
  });

  it("signale une explication indisponible plutôt que d'en inventer une", () => {
    const result = runAnalysisPipeline(
      buildInput({
        explanations: [
          {
            lineIndex: 0,
            purpose: null,
            instructions: null,
            tips: [],
            precautions: [],
            source: "UNAVAILABLE",
            sourceRefs: [],
            confidence: 0,
            requiresReview: true,
          },
        ],
      }),
    );

    const stage = result.trace.find((s) => s.stage === "TREATMENT_UNDERSTANDING");
    expect(stage?.status).toBe("PARTIAL");
    expect(stage?.notes.join(" ")).toContain("sans information référencée");
    expect(result.explanations[0].purpose).toBeNull();
  });

  it("signale l'usage de fournisseurs simulés", () => {
    const result = runAnalysisPipeline(buildInput({ usedSimulatedProviders: true }));
    expect(result.usedSimulatedProviders).toBe(true);
  });
});
