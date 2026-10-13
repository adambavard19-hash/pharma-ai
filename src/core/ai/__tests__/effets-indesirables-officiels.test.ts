import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { evaluateKnowledgeCoverage } from "../engines/safety";
import { applyOfficialSideEffects, deriveUnderstanding, type DrugClassification } from "../../understanding";
import { officialAtcForCis } from "../../reference/atc/official-atc";
import { officialSideEffectLabels, readRcpSideEffects } from "../../reference/rcp/side-effects";
import { patient, product } from "./fixtures";

/**
 * Les effets indésirables lus dans le RCP officiel ouvrent les règles « classe ou effet » sans le modèle.
 *
 * Le tramadol (TRAMADOL BIOGARAN 50 mg, gélule — CIS 61644643) : son RCP dit « Fréquent : constipation, sécheresse de la
 * bouche, vomissements ». Sa famille (N02AX02, un opioïde) n'ouvre pas la règle « bouche sèche » (antidépresseurs,
 * antihistaminiques, neuroleptiques) : seul l'effet indésirable peut l'ouvrir. Le 12 octobre, crédit du modèle épuisé,
 * le tramadol n'avait aucun effet connu — donc pas ce conseil.
 */
const LINE = { lineIndex: 0, officialCisCode: "61644643", officialSubstances: ["CHLORHYDRATE DE TRAMADOL"] };
const DRUG_NAME = "TRAMADOL BIOGARAN 50 mg";
const rcp = readRcpSideEffects(readFileSync(path.join(__dirname, "../../reference/rcp/__tests__/fixtures/61644643-tramadol-biogaran.html"), "utf8"));
const OFFICIAL = new Map([["61644643", { effects: officialSideEffectLabels(rcp.effects) }]]);

const family = officialAtcForCis("61644643")!;
const officialFamily: DrugClassification = { lineIndex: 0, substance: "CHLORHYDRATE DE TRAMADOL", atcCode: family.atcCode, therapeuticClass: family.therapeuticClass, commonSideEffects: [], confidence: 1, source: "OFFICIAL" };

const CATALOG = [
  product({ id: "salive", name: "SPRAY BOUCHE SECHE 50 ML", category: "HYGIENE", subCategory: null, matchingTags: ["bouche sèche", "salive", "hygiène bucco-dentaire"], commercialClaims: [], stockQuantity: 5 }),
];

function analyse(drugs: DrugClassification[]) {
  const understanding = deriveUnderstanding({ drugs, patient: { ageYears: 52, sex: "MALE", isPregnant: false, isBreastfeeding: false }, providerId: "anthropic:test", model: "test" });
  const classification = drugs[0];
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: DRUG_NAME, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[DRUG_NAME.toLowerCase(), classification ? classifiedDrugKnowledge({ key: DRUG_NAME.toLowerCase(), drugName: DRUG_NAME, form: null, classification, publishedSubstance: classification.substance, model: "test" }) : null]]),
    patient: patient({ sex: "MALE", ageYears: 52 }),
    catalog: CATALOG,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}
const keys = (result: ReturnType<typeof analyse>) => result.opportunities.map((opportunity) => opportunity.key);

describe("règle « sécheresse buccale » ouverte par un effet officiel, sans modèle", () => {
  it("le RCP du tramadol donne bien la sécheresse buccale (fréquent)", () => {
    expect(rcp.status).toBe("READ");
    expect(rcp.effects.find((effect) => effect.key === "DRY_MOUTH")).toMatchObject({ frequency: "COMMON", evidence: "Fréquent : constipation, sécheresse de la bouche, vomissements." });
  });

  it("famille officielle seule (modèle muet, aucun effet) : pas de conseil « bouche sèche »", () => {
    expect(keys(analyse([officialFamily]))).not.toContain("dry-mouth-hygiene");
  });

  it("famille officielle + effets du RCP : le conseil « bouche sèche » s'ouvre sur l'effet", () => {
    const { drugs, applied } = applyOfficialSideEffects([officialFamily], [LINE], OFFICIAL);
    expect(applied).toBe(1);
    expect(drugs[0]).toMatchObject({ source: "OFFICIAL", atcCode: "N02AX02", sideEffectsSource: "RCP_BDPM" });
    expect(drugs[0].commonSideEffects).toContain("sécheresse buccale");
    expect(keys(analyse(drugs))).toContain("dry-mouth-hygiene");
  });

  it("ni modèle ni famille : les effets du RCP suffisent à eux seuls", () => {
    const { drugs } = applyOfficialSideEffects([], [LINE], OFFICIAL);
    expect(drugs).toEqual([
      { lineIndex: 0, substance: "CHLORHYDRATE DE TRAMADOL", atcCode: null, therapeuticClass: null, commonSideEffects: ["sécheresse buccale", "nausées", "vomissements", "constipation", "somnolence", "fatigue (asthénie)"], confidence: 1, source: "OFFICIAL_RCP", sideEffectsSource: "RCP_BDPM" },
    ]);
    expect(keys(analyse(drugs))).toContain("dry-mouth-hygiene");
    // Une règle qui affirme la classe (CLASS_ONLY) ne s'ouvre jamais sur un simple effet : pas de probiotique « sous antibiotique ».
    expect(keys(analyse(drugs))).not.toContain("digestive-tolerance-antibiotics");
  });
});

describe("priorité et source affichée", () => {
  it("les effets officiels remplacent ceux du modèle ; famille et substance du modèle restent", () => {
    const byModel: DrugClassification = { lineIndex: 0, substance: "TRAMADOL", atcCode: "N02AX02", therapeuticClass: "Antalgique opioïde", commonSideEffects: ["vertiges", "bouche sèche"], confidence: 0.9, source: "CACHE" };
    const [merged] = applyOfficialSideEffects([byModel], [LINE], OFFICIAL).drugs;
    expect(merged).toMatchObject({ substance: "TRAMADOL", therapeuticClass: "Antalgique opioïde", source: "CACHE", sideEffectsSource: "RCP_BDPM" });
    expect(merged.commonSideEffects).not.toContain("vertiges");
  });

  it("aucun effet officiel enregistré (ou une lecture sans effet) : rien ne change", () => {
    const byModel: DrugClassification = { lineIndex: 0, substance: "TRAMADOL", atcCode: "N02AX02", therapeuticClass: "Antalgique opioïde", commonSideEffects: ["vertiges"], confidence: 0.9, source: "MODEL" };
    expect(applyOfficialSideEffects([byModel], [LINE], new Map())).toEqual({ drugs: [byModel], applied: 0 });
    expect(applyOfficialSideEffects([byModel], [LINE], new Map([["61644643", { effects: [] }]]))).toEqual({ drugs: [byModel], applied: 0 });
    // Une ligne non rattachée au catalogue national (pas de CIS) ne reçoit jamais d'effets officiels.
    expect(applyOfficialSideEffects([byModel], [{ ...LINE, officialCisCode: null }], OFFICIAL)).toEqual({ drugs: [byModel], applied: 0 });
  });

  it("la fiche dit « RCP (BDPM) » : en source, et dans la mention de la classification IA lue par le pharmacien", () => {
    const byModel: DrugClassification = { lineIndex: 0, substance: "TRAMADOL", atcCode: "N02AX02", therapeuticClass: "Antalgique opioïde", commonSideEffects: [], confidence: 0.9, source: "MODEL" };
    const [merged] = applyOfficialSideEffects([byModel], [LINE], OFFICIAL).drugs;
    const knowledge = classifiedDrugKnowledge({ key: "t", drugName: DRUG_NAME, form: null, classification: merged, publishedSubstance: null, model: "claude-test" });
    expect(knowledge).toMatchObject({ sourceName: "Classification IA · effets indésirables : RCP (BDPM)", sideEffectsSource: "RCP (BDPM)", origin: "AI_CLASSIFICATION" });
    const rcpOnly = classifiedDrugKnowledge({ key: "t", drugName: DRUG_NAME, form: null, classification: applyOfficialSideEffects([], [LINE], OFFICIAL).drugs[0], publishedSubstance: null, model: "claude-test" });
    expect(rcpOnly).toMatchObject({ id: "rcp:t", sourceName: "RCP (BDPM)", sourceVersion: "rubrique 4.8", origin: "OFFICIAL_RCP" });

    const findings = evaluateKnowledgeCoverage([{ drugName: DRUG_NAME }], new Map([[DRUG_NAME.toLowerCase(), knowledge]]));
    expect(findings.map((finding) => finding.message).join(" ")).toContain("Effets indésirables fréquents : RCP (BDPM).");
  });
});
