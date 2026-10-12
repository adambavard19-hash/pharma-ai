import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { evaluateKnowledgeCoverage } from "../engines/safety";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { officialAtcForCis } from "../../reference/atc/official-atc";
import { officialFacts, patient, product } from "./fixtures";
import type { DrugKnowledge } from "../types";

/**
 * Le moteur face à une famille officielle (Open Medic), quand le modèle n'a pas répondu : une cétirizine classée
 * officiellement déclenche les mêmes conseils que si le modèle l'avait classée, et le libellé de l'arbre ATC — qui
 * n'est pas une classe écrite pour nos règles — n'ouvre aucune règle par son texte.
 */

const official = (cisCode: string, substance: string): DrugClassification => {
  const family = officialAtcForCis(cisCode);
  if (!family) throw new Error(`CIS ${cisCode} absent de la table officielle`);
  return { lineIndex: 0, substance, atcCode: family.atcCode, therapeuticClass: family.therapeuticClass, commonSideEffects: [], confidence: 1, source: "OFFICIAL" };
};

/** Comme `mergeClassifications` côté serveur : la fiche de la ligne est faite de sa classification. */
const knowledgeOf = (drugName: string, classification: DrugClassification): DrugKnowledge =>
  classifiedDrugKnowledge({ key: drugName.toLowerCase(), drugName, form: null, classification, publishedSubstance: classification.substance, model: "test" });

const CATALOG = [
  product({ id: "larmes", name: "LARMES ARTIFICIELLES UNIDOSES X30", category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], commercialClaims: [], stockQuantity: 5 }),
  product({ id: "spray", name: "PHYSIOMER SPRAY NASAL 135ML", category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "spray nasal", "orl"], commercialClaims: [], stockQuantity: 5 }),
  product({ id: "probiotique" }),
  product({ id: "pieds", name: "CREME PIEDS SECS 100 ML", category: "SOINS", subCategory: null, matchingTags: ["pieds", "hydratation"], commercialClaims: [], stockQuantity: 5 }),
];

function analyse(drugName: string, classification: DrugClassification | null) {
  const understanding = deriveUnderstanding({ drugs: classification ? [classification] : [], patient: { ageYears: 42, sex: "FEMALE", isPregnant: false, isBreastfeeding: false }, providerId: "anthropic:test", model: "test" });
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[drugName.toLowerCase(), classification ? knowledgeOf(drugName, classification) : null]]),
    patient: patient(),
    catalog: CATALOG,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}
const keys = (result: ReturnType<typeof analyse>) => result.opportunities.map((opportunity) => opportunity.key).sort();

describe("cétirizine classée d'après la famille officielle", () => {
  // CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable.
  const cetirizine = official("61665908", "DICHLORHYDRATE DE CÉTIRIZINE");

  it("déclenche les règles antihistaminiques (yeux, nez), et propose ce que le rayon a", () => {
    expect(cetirizine.atcCode).toBe("R06AE07");
    const result = analyse("CETIRIZINE BIOGARAN 10 mg", cetirizine);
    expect(keys(result)).toEqual(expect.arrayContaining(["eye-irritation-allergy", "nasal-hygiene-orl"]));
    expect(result.recommendations.map((recommendation) => recommendation.productId)).toEqual(expect.arrayContaining(["larmes", "spray"]));
  });

  it("exactement comme le ferait la classification du modèle (même ATC)", () => {
    const byModel: DrugClassification = { ...cetirizine, therapeuticClass: "Antihistaminique H1", confidence: 0.95, source: "MODEL" };
    expect(keys(analyse("CETIRIZINE BIOGARAN 10 mg", cetirizine))).toEqual(keys(analyse("CETIRIZINE BIOGARAN 10 mg", byModel)));
  });

  it("sans famille du tout (le 12 oct., crédit épuisé, avant ce secours) : aucun conseil", () => {
    expect(analyse("CETIRIZINE BIOGARAN 10 mg", null).opportunities).toEqual([]);
  });

  it("la fiche porte sa source et son origine, distinctes d'une classification du modèle", () => {
    expect(knowledgeOf("CETIRIZINE BIOGARAN 10 mg", cetirizine)).toMatchObject({
      id: "official:cetirizine biogaran 10 mg",
      inn: "DICHLORHYDRATE DE CÉTIRIZINE",
      atcCode: "R06AE07",
      sourceName: "Open Medic (Assurance Maladie)",
      sourceVersion: "base complète 2025",
      origin: "OFFICIAL_ATC",
      isDemoData: false,
    });
    expect(knowledgeOf("CETIRIZINE BIOGARAN 10 mg", { ...cetirizine, source: "MODEL" })).toMatchObject({ id: "ai:cetirizine biogaran 10 mg", sourceName: "Classification IA", sourceVersion: "test", origin: "AI_CLASSIFICATION" });
  });

  it("au comptoir : pas de « classé par l'IA » (c'est un fait), mais l'absence d'interactions vérifiées reste dite", () => {
    const name = "CETIRIZINE BIOGARAN 10 mg";
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: name }],
      new Map([[name.toLowerCase(), knowledgeOf(name, cetirizine)]]),
      new Map([[name.toLowerCase(), officialFacts({ cisCode: "61665908", name: "CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable", substances: ["DICHLORHYDRATE DE CÉTIRIZINE"], prescriptionConditions: [] })]]),
    );
    const codes = findings.map((finding) => finding.code);
    expect(codes).not.toContain("DRUG_CLASSIFIED_BY_AI");
    expect(codes).toContain("DRUG_NO_INTERACTION_DATA");
  });
});

describe("le libellé officiel n'ouvre aucune règle par son texte", () => {
  it("FUCIDINE 2 % pommade (« antibiotiques a usage topique ») : pas de probiotiques ni de soins intimes « sous antibiotique »", () => {
    const fucidine = official("62345035", "ACIDE FUSIDIQUE");
    expect(fucidine).toMatchObject({ atcCode: "D06AX01", therapeuticClass: expect.stringContaining("antibiotiques") });
    const found = keys(analyse("FUCIDINE 2 POUR CENT, pommade", fucidine));
    for (const key of ["digestive-tolerance-antibiotics", "antibiotic-intimate-care", "convalescence-immunity-vitamins"]) expect(found).not.toContain(key);
  });

  it("BISEPTINE (« biguanides et amidines », la chlorhexidine) : pas de soin du pied diabétique", () => {
    const biseptine = official("61837560", "CHLORHEXIDINE");
    expect(biseptine).toMatchObject({ atcCode: "D08AC52", therapeuticClass: expect.stringContaining("biguanides") });
    expect(keys(analyse("BISEPTINE", biseptine))).not.toContain("diabetes-foot-care");
  });

  it("une metformine officielle (A10BA02, « … — biguanides ») ouvre bien la règle du pied diabétique : par son code", () => {
    const metformine = official("67346461", "CHLORHYDRATE DE METFORMINE"); // METFORMINE BIOGARAN 1000 mg, comprimé pelliculé
    expect(metformine).toMatchObject({ atcCode: "A10BA02", therapeuticClass: expect.stringContaining("biguanides") });
    expect(keys(analyse("METFORMINE BIOGARAN 1000 mg", metformine))).toContain("diabetes-foot-care");
  });
});
