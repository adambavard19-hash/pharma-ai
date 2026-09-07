import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import type { IdentifiedNeed, TreatmentUnderstanding } from "../../understanding";
import { patient, product } from "./fixtures";

/**
 * Une pharmacie, un stock.
 *
 * Le moteur ne reçoit que le catalogue de l'officine connectée — jamais celui
 * d'une autre. Sur la même ordonnance, la même référence est proposée là où
 * elle est en rayon et tue là où elle ne l'est pas ; la remettre en stock
 * dans une officine ne change rien à l'autre.
 */

const need: IdentifiedNeed = { key: "NASAL_CONGESTION", lineIndexes: [0], justification: "Contexte ORL.", confidence: 0.6 };
const understanding: TreatmentUnderstanding = {
  drugs: [],
  context: { summary: "Contexte probable : infectieux.", confidence: 1, groups: ["infectieux"] },
  needs: [need],
  providerId: "test",
  model: "m",
  warnings: [],
  usage: null,
  cachedCount: 0,
};

const spray = (stockQuantity: number, salePriceCents: number) =>
  product({
    id: `spray-${stockQuantity}-${salePriceCents}`,
    name: "Spray nasal eau de mer",
    category: "SOINS",
    subCategory: null,
    matchingTags: ["nez", "nasal", "orl"],
    commercialClaims: [],
    stockQuantity,
    salePriceCents,
  });

function analyse(catalog: PipelineInput["catalog"]) {
  return runAnalysisPipeline({
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
  });
}

describe("isolation du stock par officine", () => {
  const officineA = [spray(10, 690)];
  const officineB = [spray(0, 720)];

  it("propose la référence à l'officine qui l'a en rayon", () => {
    const result = analyse(officineA);
    expect(result.recommendations.map((r) => r.productId)).toEqual(["spray-10-690"]);
  });

  it("ne la propose pas à l'officine où elle est à zéro, sur la même ordonnance", () => {
    const result = analyse(officineB);
    expect(result.recommendations).toEqual([]);
  });

  it("la propose à B dès que B la remet en stock, sans toucher à A", () => {
    const b = analyse([spray(5, 720)]);
    expect(b.recommendations).toHaveLength(1);
    expect(b.recommendations[0].productId).toBe("spray-5-720");
    const a = analyse(officineA);
    expect(a.recommendations[0].productId).toBe("spray-10-690");
  });

  it("n'emprunte jamais le stock d'une autre officine", () => {
    // Le catalogue de B ne contient que ce que B détient : le produit de A n'y
    // est pas, il ne peut donc pas être proposé — quel que soit son stock.
    const result = analyse(officineB);
    expect(result.recommendations.some((r) => r.productId.startsWith("spray-10"))).toBe(false);
  });

  it("ne propose jamais une rupture locale au motif qu'une officine sœur l'a en rayon", () => {
    // La régression observée en test réel : B à zéro, A en stock, même groupe.
    const result = analyse([{ ...spray(0, 720), availableInSiblingPharmacy: true }]);
    expect(result.recommendations).toEqual([]);
  });

  it("ignore un produit désactivé même en stock", () => {
    const result = analyse([{ ...spray(10, 690), isActive: false }]);
    expect(result.recommendations).toEqual([]);
  });
});
