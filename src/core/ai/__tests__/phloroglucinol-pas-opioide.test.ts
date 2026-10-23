import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { ADVICE_RULES } from "../engines/advice";
import { patient, product } from "./fixtures";

/**
 * Le Phloroglucinol n'est pas un opioïde (fondateur, 22 oct. 2026 : « Opioïde (PHLOROGLUCINOL HYDRATE) : la constipation est
 * un effet quasi constant »). Antispasmodique musculotrope (A03AX12) : ni besoin « constipation », ni règle des opioïdes.
 */
const PHLORO: DrugClassification = { lineIndex: 0, substance: "PHLOROGLUCINOL HYDRATE", atcCode: "A03AX12", therapeuticClass: "Antispasmodique musculotrope", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
const MACROGOL = product({ id: "macrogol", name: "MACROGOL 4000 4 g sachets", category: "NUTRITION", subCategory: null as never, matchingTags: ["transit", "fibres", "confort digestif"], description: "Laxatif osmotique" });

function analyse(drugs: DrugClassification[]) {
  const understanding = deriveUnderstanding({ drugs, patient: { ageYears: 45, sex: "FEMALE", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" });
  return {
    understanding,
    result: runAnalysisPipeline({
      lines: drugs.map((drug) => ({ lineIndex: drug.lineIndex, drugName: "PHLOROGLUCINOL VIATRIS 80 mg", posology: null, durationDays: null, confirmed: true })),
      knowledge: new Map([["phloroglucinol viatris 80 mg", null]]),
      patient: patient(),
      catalog: [MACROGOL],
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      understanding,
      usedSimulatedProviders: false,
    }),
  };
}

describe("le Phloroglucinol n'est jamais présenté comme un opioïde", () => {
  it("un antispasmodique musculotrope (A03A) n'ouvre pas le besoin « constipation »", () => {
    expect(analyse([PHLORO]).understanding.needs.map((need) => need.key)).not.toContain("CONSTIPATION");
  });

  it("aucune opportunité « transit sous opioïde », aucun texte « Opioïde »", () => {
    const text = JSON.stringify(analyse([PHLORO]).result);
    expect(text).not.toContain("opioid-transit");
    expect(text).not.toMatch(/Opio[iï]de \(/);
  });

  it("les règles qui nomment la classe du médicament le déclarent", () => {
    const named = ADVICE_RULES.filter((rule) => rule.namesDrugClass).map((rule) => rule.key);
    expect(named).toEqual(expect.arrayContaining(["opioid-transit", "digestive-tolerance-antibiotics", "gastric-protection-nsaid"]));
  });
});
