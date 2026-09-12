import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { matchesAny, nameCarriesBrand } from "../engines/product-name";
import { drug, patient, product } from "./fixtures";

/**
 * Ce que le pharmacien a corrigé au comptoir, devenu règle : pas de bain de
 * bouche alcoolisé après un corticoïde inhalé, une seringue avec le flacon de
 * sérum physiologique, et les laboratoires que l'officine met en avant.
 */

const inhaled: DrugClassification = { lineIndex: 0, substance: "BECLOMETASONE", atcCode: "R03BA01", therapeuticClass: "Corticoïde inhalé", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
const antibiotic: DrugClassification = { lineIndex: 0, substance: "ROXITHROMYCINE", atcCode: "J01FA06", therapeuticClass: "Antibiotique macrolide", commonSideEffects: [], confidence: 0.95, source: "MODEL" };

function analyse(drugClass: DrugClassification, catalog: PipelineInput["catalog"], rules: PipelineInput["rules"] = []) {
  const understanding = deriveUnderstanding({ drugs: [drugClass], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" });
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: drugClass.substance ?? "X", posology: null, durationDays: null, confirmed: true }],
    // La fiche éditoriale (ou la classification IA fusionnée côté serveur) :
    // c'est elle qui porte l'ATC et la classe pour les règles de classe.
    knowledge: new Map([[(drugClass.substance ?? "x").toLowerCase(), drug({ name: drugClass.substance ?? "X", inn: drugClass.substance, atcCode: drugClass.atcCode, therapeuticClass: drugClass.therapeuticClass, commonSideEffects: [] })]]),
    patient: patient(),
    catalog,
    rules,
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}

const mouthwash = (id: string, name: string) =>
  product({ id, name, category: "HYGIENE", subCategory: null, matchingTags: ["bain de bouche", "rinçage", "bucco-dentaire"], commercialClaims: [], stockQuantity: 5 });

describe("formules écartées ou préférées par la règle", () => {
  it("n'associe pas un bain de bouche alcoolisé à un corticoïde inhalé", () => {
    const result = analyse(inhaled, [mouthwash("eludril", "ELUDRIL 0,5 ml/0,5 g solution pour bain de bouche"), mouthwash("meridol", "MERIDOL bain de bouche sans alcool 400 ml")]);
    expect(result.recommendations.map((r) => r.productId)).toEqual(["meridol"]);
  });

  it("garde une formule alcoolisée si c'est la seule ? non : rien plutôt qu'un mauvais conseil", () => {
    const result = analyse(inhaled, [mouthwash("eludril", "ELUDRIL solution pour bain de bouche")]);
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("NO_COMPATIBLE_PRODUCT");
  });

  it("une mention « sans alcool » sauve une marque autrement écartée", () => {
    const result = analyse(inhaled, [mouthwash("listerine-zero", "LISTERINE ZERO sans alcool 500 ml")]);
    expect(result.recommendations.map((r) => r.productId)).toEqual(["listerine-zero"]);
  });
});

describe("produit associé", () => {
  const bottle = product({ id: "serum", name: "VOG SERUM PHY BOUTEILLE 500ML PHYSIO PHARMA", category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "lavage", "eau de mer", "orl"], commercialClaims: [], stockQuantity: 94 });
  const syringe = product({ id: "seringue", name: "SERINGUE LAVAGE NASAL 20 ML", category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: [], commercialClaims: [], stockQuantity: 12, salePriceCents: 190 });
  const spray = product({ id: "spray", name: "PHYSIOMER SPRAY NASAL 135ML", category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "spray nasal", "orl"], commercialClaims: [], stockQuantity: 11 });

  it("associe une seringue de lavage à un flacon de sérum physiologique", () => {
    const result = analyse({ ...antibiotic, atcCode: "J01FA06" }, [bottle, syringe]);
    const nasal = result.recommendations.find((r) => r.productId === "serum");
    expect(nasal?.companion).toMatchObject({ productId: "seringue", name: "SERINGUE LAVAGE NASAL 20 ML", salePriceCents: 190, stockQuantity: 12 });
  });

  it("n'associe rien à un spray, ni quand la seringue est en rupture", () => {
    const withSpray = analyse(antibiotic, [spray, syringe]);
    expect(withSpray.recommendations.find((r) => r.productId === "spray")?.companion ?? null).toBeNull();
    const noSyringe = analyse(antibiotic, [bottle, { ...syringe, stockQuantity: 0 }]);
    expect(noSyringe.recommendations.find((r) => r.productId === "serum")?.companion ?? null).toBeNull();
  });
});

describe("laboratoires mis en avant par l'officine", () => {
  const a = product({ id: "a", name: "LACTIBIANE ATB Gél B/10", brand: null, category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"], stockQuantity: 8, salePriceCents: 1200, purchasePriceCents: 600 });
  const b = product({ id: "b", name: "ULTRA-LEVURE 200 mg gélule", brand: null, category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"], stockQuantity: 8, salePriceCents: 1200, purchasePriceCents: 600 });

  it("fait remonter le laboratoire préféré entre deux références équivalentes", () => {
    const rules: PipelineInput["rules"] = [{ id: "r1", type: "PREFER_BRAND", productId: null, category: null, brand: "Ultra-Levure", context: {}, weight: 1 }];
    const result = analyse(antibiotic, [a, b], rules);
    expect(result.recommendations[0]?.productId).toBe("b");
  });

  it("écarte un laboratoire exclu, même pertinent", () => {
    const rules: PipelineInput["rules"] = [{ id: "r2", type: "EXCLUDE_BRAND", productId: null, category: null, brand: "Lactibiane", context: {}, weight: 1 }];
    const result = analyse(antibiotic, [a, b], rules);
    expect(result.recommendations.map((r) => r.productId)).toEqual(["b"]);
  });

  it("reconnaît la marque dans le nom, sans casse ni accents", () => {
    expect(nameCarriesBrand("LACTIBIANE ATB Gél B/10", "lactibiane")).toBe(true);
    expect(nameCarriesBrand("VOG SERUM PHY 500ML", "vog")).toBe(true);
    expect(nameCarriesBrand("ANTIVOG CREME", "vog")).toBe(false);
    expect(matchesAny(["\\balcool\\b"], "Bain de bouche sans ALCOOL")).toBe(true);
  });
});

describe("collyre en contexte allergique", () => {
  it("écarte un collyre antiseptique au profit de larmes artificielles", async () => {
    const { runAnalysisPipeline } = await import("../pipeline");
    const { deriveUnderstanding } = await import("../../understanding");
    const { drug, patient, product } = await import("./fixtures");
    const antihistamine = { lineIndex: 0, substance: "BILASTINE", atcCode: "R06AX29", therapeuticClass: "Antihistaminique H1", commonSideEffects: [], confidence: 0.9, source: "MODEL" as const };
    const understanding = deriveUnderstanding({ drugs: [antihistamine], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "t", model: "m" });
    const eye = (id: string, name: string) => product({ id, name, category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], commercialClaims: [], stockQuantity: 5 });
    const result = runAnalysisPipeline({
      lines: [{ lineIndex: 0, drugName: "BILASTINE", posology: null, durationDays: null, confirmed: true }],
      knowledge: new Map([["bilastine", drug({ name: "BILASTINE", inn: "BILASTINE", atcCode: "R06AX29", therapeuticClass: "Antihistaminique H1", commonSideEffects: [] })]]),
      patient: patient(), catalog: [eye("deso", "DESOMEDINE 0,1 %, collyre en solution"), eye("larmes", "LARMES ARTIFICIELLES UNIDOSES X30")], rules: [], history: {}, explanations: [], extractionFindings: [], understanding, usedSimulatedProviders: false,
    });
    expect(result.recommendations.map((r) => r.productId)).toEqual(["larmes"]);
  });
});
