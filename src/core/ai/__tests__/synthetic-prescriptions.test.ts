import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import type { CatalogProduct } from "../types";
import { patient, product } from "./fixtures";

/**
 * Des ordonnances SYNTHÉTIQUES, de bout en bout dans le moteur pur.
 *
 * Aucune ordonnance réelle n'est codée ici. Chaque scénario dit ce que le
 * moteur doit faire d'un traitement type — ORL, antibiotique, douleur,
 * allergie, dermatologie, digestif, chronique — selon le rayon de l'officine :
 * proposer, poser une question, dire honnêtement pourquoi il n'y a rien.
 */

type Line = { name: string; atc: string; klass: string };

function classify(lines: Line[]): DrugClassification[] {
  return lines.map((line, index) => ({
    lineIndex: index,
    substance: line.name.toUpperCase(),
    atcCode: line.atc,
    therapeuticClass: line.klass,
    commonSideEffects: [],
    confidence: 0.95,
    source: "MODEL" as const,
  }));
}

function analyse(lines: Line[], catalog: CatalogProduct[], options: Partial<PipelineInput> = {}) {
  const drugs = classify(lines);
  const understanding = deriveUnderstanding({
    drugs,
    patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false },
    providerId: "test",
    model: "m",
  });
  return runAnalysisPipeline({
    lines: lines.map((line, index) => ({ lineIndex: index, drugName: line.name, posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(lines.map((line) => [line.name.toLowerCase(), null])),
    patient: patient(),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
    ...options,
  });
}

// --- Les ordonnances synthétiques ------------------------------------------
const ORL_ANTIBIOTIQUE: Line[] = [
  { name: "Paracetamol 1 g", atc: "N02BE01", klass: "Antalgique antipyrétique" },
  { name: "Roxithromycine 150", atc: "J01FA06", klass: "Antibiotique macrolide" },
  { name: "Antitussif sirop", atc: "R05DA09", klass: "Antitussif opioïde" },
];
const ALLERGIE: Line[] = [{ name: "Antihistaminique H1", atc: "R06AX29", klass: "Antihistaminique H1" }];
const DOULEUR_AINS: Line[] = [{ name: "Ibuprofene 400", atc: "M01AE01", klass: "Anti-inflammatoire non stéroïdien" }];
const DERMATO: Line[] = [{ name: "Corticoïde crème", atc: "D07AC01", klass: "Corticoïde topique" }];
const DIGESTIF: Line[] = [{ name: "Pansement gastrique", atc: "A02BX", klass: "Antiacide" }];
const CHRONIQUE: Line[] = [
  { name: "Antihypertenseur", atc: "C09AA02", klass: "IEC" },
  { name: "Statine", atc: "C10AA05", klass: "Hypolipémiant" },
];
const PSY: Line[] = [{ name: "Antidépresseur ISRS", atc: "N06AB06", klass: "Antidépresseur ISRS" }];

// --- Le rayon --------------------------------------------------------------
const probiotic = product({ id: "probio", name: "Ferments lactiques 10 souches", category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"], stockQuantity: 8 });
const spray = product({ id: "spray", name: "Spray nasal eau de mer", category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "eau de mer", "spray nasal", "orl"], commercialClaims: [], stockQuantity: 5 });
const thermometer = product({ id: "thermo", name: "Thermomètre frontal", category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: ["thermomètre", "fièvre", "mesure"], commercialClaims: [], stockQuantity: 3 });
const eyeDrops = product({ id: "eyes", name: "Larmes artificielles", category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "larmes"], commercialClaims: [], stockQuantity: 6 });
const emollient = product({ id: "emol", name: "Crème émolliente", category: "DERMOCOSMETIQUE", subCategory: null, matchingTags: ["hydratation", "peau sensible", "émollient", "apaisant"], commercialClaims: [], stockQuantity: 4 });
const gastric = product({ id: "gastric", name: "Gel gastrique", category: "SOINS", subCategory: null, matchingTags: ["confort gastrique", "estomac", "digestion"], commercialClaims: [], stockQuantity: 4 });
const shampoo = product({ id: "shampoo", name: "Shampooing doux", category: "HYGIENE", subCategory: null, matchingTags: ["shampooing", "doux"], commercialClaims: [], stockQuantity: 40 });

const FULL_SHELF = [probiotic, spray, thermometer, eyeDrops, emollient, gastric, shampoo];

describe("ordonnances synthétiques — le moteur propose, questionne ou explique", () => {
  it("ORL + antibiotique, rayon complet : 1 à 3 propositions, la tolérance digestive en tête", () => {
    const result = analyse(ORL_ANTIBIOTIQUE, FULL_SHELF);
    expect(result.outcome).toBe("PROPOSALS");
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
    expect(result.recommendations[0].productId).toBe("probio");
    // Le shampooing n'a rien à faire là : aucune règle ne le désigne.
    expect(result.recommendations.map((r) => r.productId)).not.toContain("shampoo");
  });

  it("ORL : les conseils de confort attendent la question au patient", () => {
    const result = analyse(ORL_ANTIBIOTIQUE, FULL_SHELF);
    const nasal = result.opportunities.find((o) => o.key === "nasal-hygiene-orl");
    expect(nasal?.requiresConfirmation).toBe(true);
    expect(nasal?.question).toMatch(/nez/i);
    const digestive = result.opportunities.find((o) => o.key === "digestive-tolerance-antibiotics");
    expect(digestive?.requiresConfirmation).toBe(false);
  });

  it("allergie : le collyre est proposé, avec sa question", () => {
    const result = analyse(ALLERGIE, FULL_SHELF);
    expect(result.outcome).toBe("PROPOSALS");
    expect(result.recommendations.map((r) => r.productId)).toContain("eyes");
    expect(result.opportunities.find((o) => o.key === "eye-irritation-allergy")?.question).toBeTruthy();
  });

  it("douleur (AINS) : protection gastrique proposée", () => {
    const result = analyse(DOULEUR_AINS, FULL_SHELF);
    expect(result.recommendations.map((r) => r.productId)).toContain("gastric");
  });

  it("dermatologie : émollient proposé", () => {
    const result = analyse(DERMATO, FULL_SHELF);
    expect(result.recommendations.map((r) => r.productId)).toContain("emol");
  });

  it("digestif seul : aucun complément pertinent, et le moteur le dit sans forcer", () => {
    const result = analyse(DIGESTIF, FULL_SHELF);
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("NO_RELEVANT_NEED");
  });

  it("chronique cardio : rien à proposer plutôt qu'une vente inventée", () => {
    const result = analyse(CHRONIQUE, FULL_SHELF);
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("NO_RELEVANT_NEED");
  });

  it("psychotrope : le besoin (bouche sèche) existe, aucune référence du rayon n'y répond", () => {
    const result = analyse(PSY, FULL_SHELF);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("NO_COMPATIBLE_PRODUCT");
  });

  it("stock jamais importé : l'issue le nomme, avant tout autre message", () => {
    const result = analyse(ORL_ANTIBIOTIQUE, [], { stock: { configured: false, referenceCount: 0 } });
    expect(result.outcome).toBe("STOCK_NOT_CONFIGURED");
    expect(result.opportunities.length).toBeGreaterThan(0);
  });

  it("produit pertinent mais en rupture : l'issue distingue la rupture", () => {
    const result = analyse([ORL_ANTIBIOTIQUE[1]], [{ ...probiotic, stockQuantity: 0 }], { stock: { configured: true, referenceCount: 1 } });
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("OUT_OF_STOCK");
    expect(result.trace.find((s) => s.stage === "CATALOG_MATCHING")?.notes[0]).toMatch(/rupture/);
  });

  it("stock configuré mais sans référence adaptée : NO_COMPATIBLE_PRODUCT", () => {
    const result = analyse([ORL_ANTIBIOTIQUE[1]], [shampoo], { stock: { configured: true, referenceCount: 1 } });
    expect(result.outcome).toBe("NO_COMPATIBLE_PRODUCT");
  });

  it("IA indisponible et aucune couche éditoriale : l'issue le dit", () => {
    const result = runAnalysisPipeline({
      lines: [{ lineIndex: 0, drugName: "Roxithromycine 150", posology: null, durationDays: null, confirmed: true }],
      knowledge: new Map([["roxithromycine 150", null]]),
      patient: patient(),
      catalog: FULL_SHELF,
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      understanding: null,
      usedSimulatedProviders: true,
      aiUnavailable: true,
    });
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("AI_UNAVAILABLE");
  });

  it("aucune ligne confirmée : erreur moteur, jamais une proposition", () => {
    const result = runAnalysisPipeline({
      lines: [{ lineIndex: 0, drugName: "Roxithromycine 150", posology: null, durationDays: null, confirmed: false }],
      knowledge: new Map(),
      patient: patient(),
      catalog: FULL_SHELF,
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      usedSimulatedProviders: false,
    });
    expect(result.status).toBe("FAILED");
    expect(result.outcome).toBe("ENGINE_ERROR");
  });

  it("même ordonnance, deux officines : A reçoit X, B ne reçoit jamais X « en stock »", () => {
    const officineA = [probiotic];
    const officineB = [{ ...probiotic, id: "probio-b", stockQuantity: 0 }, shampoo];
    const a = analyse([ORL_ANTIBIOTIQUE[1]], officineA);
    const b = analyse([ORL_ANTIBIOTIQUE[1]], officineB, { stock: { configured: true, referenceCount: 2 } });
    expect(a.recommendations.map((r) => r.productId)).toEqual(["probio"]);
    expect(b.recommendations).toEqual([]);
    expect(b.outcome).toBe("OUT_OF_STOCK");
    // Aucune fuite : B ne voit pas l'identifiant de A.
    expect(JSON.stringify(b)).not.toContain('"probio"');
  });

  it("la marge ne fait jamais passer une référence moins pertinente devant", () => {
    const cheapExact = { ...probiotic, id: "exact", salePriceCents: 900, purchasePriceCents: 800 };
    const richVague = product({ id: "vague", name: "Complément confort", category: "PROBIOTIQUES", matchingTags: [], commercialClaims: [], salePriceCents: 3000, purchasePriceCents: 300, stockQuantity: 50 });
    const result = analyse([ORL_ANTIBIOTIQUE[1]], [richVague, cheapExact]);
    expect(result.recommendations[0]?.productId).toBe("exact");
  });
});
