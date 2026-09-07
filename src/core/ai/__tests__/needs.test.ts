import { describe, expect, it } from "vitest";
import { detectAdviceOpportunities } from "../engines/advice";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import type { IdentifiedNeed, TreatmentUnderstanding } from "../../understanding";
import { drug, patient, product } from "./fixtures";

/**
 * Le besoin compris par l'IA ne vaut pas conseil.
 *
 * Il déclenche une règle écrite, qui pose sa question, puis le stock et la
 * sécurité décident. Ces tests protègent cette chaîne : un besoin sans règle
 * ne produit rien, une règle avec question attend la réponse, et le catalogue
 * n'entre qu'après.
 */

const need = (overrides: Partial<IdentifiedNeed> = {}): IdentifiedNeed => ({
  key: "NASAL_CONGESTION",
  lineIndexes: [0],
  justification: "Infection ORL probable : la gêne nasale est fréquente et rien ne la traite.",
  confidence: 0.8,
  ...overrides,
});

const understanding = (needs: IdentifiedNeed[]): TreatmentUnderstanding => ({
  drugs: [],
  context: { summary: "Contexte ORL infectieux probable.", confidence: 0.8, groups: ["infectieux"] },
  needs,
  providerId: "test:model",
  model: "model",
  warnings: [],
  usage: null,
  cachedCount: 0,
});

// Des médicaments réels que la couche éditoriale de démonstration ignore.
const unknownDrugs = [
  { lineIndex: 0, drugName: "RULID", knowledge: null },
  { lineIndex: 1, drugName: "TUSSIDANE", knowledge: null },
];

describe("opportunités déclenchées par un besoin compris", () => {
  it("déclenche la règle et porte sa question", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: unknownDrugs,
      patient: patient(),
      needs: [need()],
    });

    const nasal = opportunities.find((o) => o.key === "nasal-hygiene-orl");
    expect(nasal).toBeDefined();
    expect(nasal!.requiresConfirmation).toBe(true);
    expect(nasal!.question).toMatch(/nez/);
    expect(nasal!.needKey).toBe("NASAL_CONGESTION");
    expect(nasal!.aiJustification).toContain("ORL");
    // Le déclencheur nommé est la ligne citée par le besoin, pas tout le traitement.
    expect(nasal!.triggeredBy.map((t) => t.drugName)).toEqual(["RULID"]);
    expect(nasal!.shortReason).toContain("RULID");
  });

  it("ne produit rien sans règle qui déclare le besoin", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: unknownDrugs,
      patient: patient(),
      needs: [need({ key: "BESOIN_INVENTE" as IdentifiedNeed["key"] })],
    });
    expect(opportunities).toEqual([]);
  });

  it("sans besoin ni fiche éditoriale, aucune opportunité — comme avant", () => {
    expect(detectAdviceOpportunities({ drugs: unknownDrugs, patient: patient() })).toEqual([]);
  });

  it("une règle avec question l'exige même quand la classe la déclenche", () => {
    const antihistamine = drug({
      name: "Bilastine",
      inn: "Bilastine",
      atcCode: "R06AX29",
      therapeuticClass: "Antihistaminique",
      commonSideEffects: [],
    });
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "Bilastine", knowledge: antihistamine }],
      patient: patient(),
    });
    const dryMouth = opportunities.find((o) => o.key === "dry-mouth-hygiene");
    expect(dryMouth).toBeDefined();
    expect(dryMouth!.requiresConfirmation).toBe(true);
    expect(dryMouth!.needKey).toBeNull();
  });

  it("un conseil d'observance déclenché par la classe ne pose pas de question", () => {
    const inhaled = drug({
      name: "Becotide",
      inn: "Béclométasone",
      atcCode: "R03BA01",
      therapeuticClass: "Corticoïde inhalé",
      commonSideEffects: [],
    });
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "Becotide", knowledge: inhaled }],
      patient: patient(),
    });
    const rinse = opportunities.find((o) => o.key === "mouth-rinse-inhaled-corticosteroid");
    expect(rinse).toBeDefined();
    expect(rinse!.requiresConfirmation).toBe(false);
    expect(rinse!.question).toBeNull();
  });
});

describe("du besoin compris au produit en rayon", () => {
  const spray = product({
    id: "spray-nasal",
    name: "Spray nasal eau de mer isotonique",
    category: "SOINS",
    subCategory: null,
    matchingTags: ["nez", "nasal", "orl", "hygiène"],
    commercialClaims: [],
    stockQuantity: 36,
    salePriceCents: 690,
  });

  function input(overrides: Partial<PipelineInput> = {}): PipelineInput {
    return {
      lines: [
        { lineIndex: 0, drugName: "RULID", posology: "2 par jour", durationDays: 5, confirmed: true },
        { lineIndex: 1, drugName: "TUSSIDANE", posology: null, durationDays: null, confirmed: true },
      ],
      knowledge: new Map([
        ["rulid", null],
        ["tussidane", null],
      ]),
      patient: patient(),
      catalog: [spray],
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      understanding: understanding([need()]),
      usedSimulatedProviders: false,
      ...overrides,
    };
  }

  it("propose le produit du stock qui répond au besoin, avec la question", () => {
    const result = runAnalysisPipeline(input());
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].productId).toBe("spray-nasal");
    const opportunity = result.opportunities.find((o) => o.key === "nasal-hygiene-orl");
    expect(opportunity?.requiresConfirmation).toBe(true);
    expect(result.recommendations[0].counterScript).toContain("Spray nasal eau de mer isotonique");
  });

  it("ne propose rien quand le stock ne répond pas au besoin", () => {
    const result = runAnalysisPipeline(input({ catalog: [] }));
    expect(result.recommendations).toEqual([]);
    // Le besoin a bien été compris : c'est le rayon qui ne suit pas.
    expect(result.opportunities.map((o) => o.key)).toContain("nasal-hygiene-orl");
  });

  it("ne propose jamais une référence à zéro en stock", () => {
    const result = runAnalysisPipeline(
      input({ catalog: [{ ...spray, stockQuantity: 0 }] }),
    );
    expect(result.recommendations).toEqual([]);
  });

  it("consigne la compréhension dans la trace, avant l'appariement", () => {
    const result = runAnalysisPipeline(input());
    const stages = result.trace.map((s) => s.stage);
    expect(stages.indexOf("TREATMENT_UNDERSTANDING")).toBeLessThan(
      stages.indexOf("CATALOG_MATCHING"),
    );
    const notes = result.trace.find((s) => s.stage === "TREATMENT_UNDERSTANDING")!.notes;
    expect(notes.join(" ")).toContain("NASAL_CONGESTION");
    expect(notes.join(" ")).toContain("Contexte ORL");
  });

  it("reste borné à trois propositions, besoins compris", () => {
    const needs: IdentifiedNeed[] = [
      need(),
      need({ key: "SORE_THROAT", justification: "Gorge irritée plausible." }),
      need({ key: "FEVER_MONITORING", justification: "Contexte fébrile." }),
      need({ key: "REHYDRATION", justification: "Diarrhée plausible." }),
    ];
    const catalog = [
      spray,
      product({ id: "gorge", name: "Pastilles gorge", category: "SOINS", matchingTags: ["gorge", "orl"], stockQuantity: 10 }),
      product({ id: "thermo", name: "Thermomètre", category: "DISPOSITIFS_MEDICAUX", matchingTags: ["thermomètre", "fièvre"], stockQuantity: 3 }),
      product({ id: "sro", name: "Solution de réhydratation", category: "NUTRITION", matchingTags: ["réhydratation", "diarrhée"], stockQuantity: 5 }),
    ];
    const result = runAnalysisPipeline(input({ understanding: understanding(needs), catalog }));
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });
});
