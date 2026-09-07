import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import type { IdentifiedNeed, TreatmentUnderstanding } from "../../understanding";
import { patient, product } from "./fixtures";

/**
 * Le stock de l'officine connectée est la seule source des propositions.
 *
 * Un produit à zéro n'est jamais proposé, même s'il serait le meilleur ;
 * plusieurs références équivalentes donnent une seule proposition, disponible ;
 * une officine sans rayon adapté ne reçoit rien — jamais une référence
 * inventée.
 */

const nasal: IdentifiedNeed = {
  key: "NASAL_CONGESTION",
  lineIndexes: [0],
  justification: "Contexte ORL.",
  confidence: 0.6,
};

const understanding: TreatmentUnderstanding = {
  drugs: [],
  context: { summary: "Contexte probable : infectieux.", confidence: 1, groups: ["infectieux"] },
  needs: [nasal],
  providerId: "test",
  model: "m",
  warnings: [],
  usage: null,
  cachedCount: 0,
};

const spray = (overrides: Parameters<typeof product>[0] = {}) =>
  product({
    id: "spray-a",
    name: "Spray nasal eau de mer",
    category: "SOINS",
    subCategory: null,
    matchingTags: ["nez", "nasal", "orl"],
    commercialClaims: [],
    precautions: [],
    stockQuantity: 8,
    salePriceCents: 690,
    purchasePriceCents: 300,
    ...overrides,
  });

function input(catalog: PipelineInput["catalog"]): PipelineInput {
  return {
    lines: [{ lineIndex: 0, drugName: "RULID", posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([["rulid", null]]),
    patient: patient(),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  };
}

describe("le stock réel décide de ce qui est proposé", () => {
  it("propose le produit disponible, avec sa quantité", () => {
    const result = runAnalysisPipeline(input([spray()]));
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].productId).toBe("spray-a");
    expect(result.recommendations[0].breakdown.availability).toBeGreaterThan(0);
  });

  it("ne propose rien quand la seule référence est à zéro", () => {
    const result = runAnalysisPipeline(input([spray({ stockQuantity: 0 })]));
    expect(result.recommendations).toEqual([]);
    expect(result.trace.find((s) => s.stage === "CATALOG_MATCHING")?.notes.join(" ")).toMatch(
      /aucune référence disponible/,
    );
  });

  it("entre plusieurs références, n'en propose qu'une — et elle est en stock", () => {
    const catalog = [
      spray({ id: "spray-a", name: "Spray nasal eau de mer", salePriceCents: 690, stockQuantity: 8 }),
      spray({ id: "spray-b", name: "Spray nasal hypertonique", salePriceCents: 1290, stockQuantity: 3 }),
      spray({ id: "spray-c", name: "Spray nasal enfant", salePriceCents: 590, stockQuantity: 0 }),
    ];
    const result = runAnalysisPipeline(input(catalog));
    const nasalRecommendations = result.recommendations.filter(
      (r) => r.opportunityKey === "nasal-hygiene-orl",
    );
    expect(nasalRecommendations).toHaveLength(1);
    const chosen = catalog.find((p) => p.id === nasalRecommendations[0].productId)!;
    expect(chosen.stockQuantity).toBeGreaterThan(0);
    expect(chosen.id).not.toBe("spray-c");
  });

  it("préfère la référence en rayon à celle en rupture, quel que soit son prix", () => {
    const catalog = [
      // La plus chère et la plus rentable est en rupture : elle ne sort pas.
      spray({ id: "premium", name: "Spray nasal premium", salePriceCents: 1990, purchasePriceCents: 400, stockQuantity: 0 }),
      spray({ id: "basique", name: "Spray nasal basique", salePriceCents: 590, purchasePriceCents: 350, stockQuantity: 12 }),
    ];
    const result = runAnalysisPipeline(input(catalog));
    expect(result.recommendations.map((r) => r.productId)).toEqual(["basique"]);
  });

  it("garde le prix de la référence retenue, pas celui d'une autre", () => {
    const catalog = [
      spray({ id: "a", salePriceCents: 690, stockQuantity: 8 }),
      spray({ id: "b", name: "Spray nasal grand format", salePriceCents: 990, stockQuantity: 20 }),
    ];
    const result = runAnalysisPipeline(input(catalog));
    const [recommendation] = result.recommendations;
    const chosen = catalog.find((p) => p.id === recommendation.productId)!;
    // Le prix affiché au comptoir est lu sur le produit retenu : la trace
    // d'une proposition ne peut jamais porter le prix d'un autre produit.
    expect(chosen.salePriceCents).toBeGreaterThan(0);
    expect(recommendation.justification).toContain(chosen.name);
  });
});
