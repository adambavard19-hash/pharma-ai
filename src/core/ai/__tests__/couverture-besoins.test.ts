import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { drug, patient, product } from "./fixtures";

/**
 * Ce que le stock a répondu à chaque besoin : c'est ce qui permet au titulaire de
 * voir, dans « Votre assortiment », les besoins réels que ses produits n'ont pas
 * couverts. Rien de cela n'influence un conseil.
 */

const amoxicilline: DrugClassification = { lineIndex: 0, substance: "AMOXICILLINE", atcCode: "J01CA04", therapeuticClass: "Antibiotique", commonSideEffects: [], confidence: 0.95, source: "MODEL" };

function analyse(catalog: PipelineInput["catalog"]) {
  const understanding = deriveUnderstanding({ drugs: [amoxicilline], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" });
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: "AMOXICILLINE", posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([["amoxicilline", drug({ name: "AMOXICILLINE", inn: "AMOXICILLINE", atcCode: "J01CA04", therapeuticClass: "Antibiotique", commonSideEffects: [] })]]),
    patient: patient(),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}

const probiotique = (over: Record<string, unknown> = {}) => product({ id: "pro", name: "Flore Équilibre 10 milliards", category: "PROBIOTIQUES", subCategory: null, matchingTags: ["probiotique", "flore", "intestinale", "tolérance", "digestive"], commercialClaims: [], stockQuantity: 12, salePriceCents: 1490, ...over });
const autre = product({ id: "aut", name: "Spray nasal eau de mer", category: "SOINS", subCategory: null, matchingTags: ["nez", "rhume"], commercialClaims: [], stockQuantity: 8, salePriceCents: 690 });

const digestive = (result: ReturnType<typeof analyse>) => result.opportunities.find((o) => o.ruleKey === "digestive-tolerance-antibiotics");

describe("couverture d'un besoin par le stock", () => {
  it("COVERED quand une référence convient", () => {
    expect(digestive(analyse([probiotique()]))?.coverage).toBe("COVERED");
  });

  it("NOT_REFERENCED quand aucune référence de l'officine ne correspond au besoin", () => {
    const result = analyse([autre]);
    expect(digestive(result)).toBeDefined();
    expect(digestive(result)?.coverage).toBe("NOT_REFERENCED");
    expect(result.recommendations.map((r) => r.productId)).not.toContain("pro");
  });

  it("OUT_OF_STOCK quand la référence existe mais est en rupture", () => {
    expect(digestive(analyse([probiotique({ stockQuantity: 0 })]))?.coverage).toBe("OUT_OF_STOCK");
  });

  it("un stock vide : aucun besoin n'est couvert", () => {
    const result = analyse([]);
    expect(digestive(result)?.coverage).toBe("NOT_REFERENCED");
    expect(result.recommendations).toEqual([]);
  });

  it("ajouter l'information ne change aucun conseil : le probiotique en stock reste proposé, avec son score", () => {
    const withStock = analyse([probiotique(), autre]);
    expect(withStock.recommendations.map((r) => r.productId)).toEqual(["pro"]);
    expect(withStock.recommendations[0].totalScore).toBeGreaterThan(0.5);
  });

  it("un besoin écarté par la sécurité n'a pas de couverture : ce n'est pas un manque d'assortiment", () => {
    const result = analyse([autre]);
    for (const opportunity of result.opportunities.filter((o) => o.isBlocked)) expect(opportunity.coverage).toBeNull();
  });
});
