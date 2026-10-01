import { describe, expect, it } from "vitest";
import { fallbackRequestUnderstanding, runRequestPipeline, validateRequestUnderstanding, type RequestUnderstanding } from "../request";
import { patient, product } from "../../ai/__tests__/fixtures";

const noPatient = patient({ patientId: null, ageYears: 35, isPregnant: false, isBreastfeeding: false, allergies: [], chronicConditions: [], currentTreatments: [] });

describe("la validation de ce que le modèle affirme sur une demande", () => {
  it("ne garde que les clés de la liste fermée, au-dessus du seuil de confiance", () => {
    const result = validateRequestUnderstanding(
      {
        besoins: [
          { cle: "NASAL_CONGESTION", justification: "Nez bouché décrit", confiance: 0.9 },
          { cle: "ANTIBIOTIQUE", justification: "inventé", confiance: 0.9 },
          { cle: "SORE_THROAT", justification: "peu probable", confiance: 0.2 },
          { cle: "NASAL_CONGESTION", justification: "doublon", confiance: 0.7 },
        ],
        questions: ["Depuis quand ?", "", "Fièvre ?", "Traitements ?", "Une de trop"],
        orientation_medecin: true,
        motif_orientation: "Fièvre depuis cinq jours.",
        resume: "Rhume probable chez un adulte.",
      },
      { providerId: "anthropic:test", model: "test" },
    );
    expect(result.needs.map((need) => need.key)).toEqual(["NASAL_CONGESTION"]);
    expect(result.questions).toEqual(["Depuis quand ?", "Fièvre ?", "Traitements ?"]);
    expect(result.referToDoctor).toBe(true);
    expect(result.referReason).toBe("Fièvre depuis cinq jours.");
    expect(result.warnings.some((w) => w.includes("ANTIBIOTIQUE"))).toBe(true);
  });
});

describe("la lecture par mots-clés, sans modèle", () => {
  it("reconnaît les besoins dans les mots du client et le dit", () => {
    const result = fallbackRequestUnderstanding({ text: "J'ai le nez bouché et mal à la gorge depuis hier", patient: { ageYears: null, isPregnant: null, isBreastfeeding: null, currentTreatments: [] } });
    expect(result.needs.map((need) => need.key)).toEqual(["NASAL_CONGESTION", "SORE_THROAT"]);
    expect(result.providerId).toBe("mots-clés");
    expect(result.questions[0]).toContain("âge");
    expect(result.referToDoctor).toBe(false);
  });

  it("oriente vers le médecin devant du sang ou une gêne respiratoire", () => {
    const result = fallbackRequestUnderstanding({ text: "je tousse et je crache du sang", patient: { ageYears: 50, isPregnant: false, isBreastfeeding: false, currentTreatments: [] } });
    expect(result.referToDoctor).toBe(true);
  });
});

describe("du besoin au produit, par les mêmes règles qu'une ordonnance", () => {
  const understanding: RequestUnderstanding = {
    needs: [{ key: "NASAL_CONGESTION", lineIndexes: [0], justification: "Nez bouché décrit par le client.", confidence: 0.9 }],
    questions: [],
    referToDoctor: false,
    referReason: null,
    summary: "Rhume probable.",
    providerId: "test",
    model: null,
    warnings: [],
  };
  const catalog = [
    product({ id: "spray", name: "Spray nasal eau de mer hypertonique", category: "SOINS", matchingTags: ["nez", "nasal", "eau de mer"], stockQuantity: 8, salePriceCents: 690 }),
    product({ id: "collyre", name: "Collyre apaisant", category: "SOINS", matchingTags: ["yeux"], stockQuantity: 4 }),
    product({ id: "rupture", name: "Dosettes sérum physiologique", category: "SOINS", matchingTags: ["nez", "nasal", "lavage"], stockQuantity: 0 }),
  ];

  it("propose la référence du stock qui répond au besoin, avec la phrase de comptoir", () => {
    const result = runRequestPipeline({ understanding, patient: noPatient, catalog, rules: [], history: {}, stockConfigured: true });
    expect(result.proposals.map((p) => p.productId)).toEqual(["spray"]);
    const proposal = result.proposals[0]!;
    expect(proposal.shortReason).toContain("Nez bouché");
    expect(proposal.counterScript).toContain("Spray nasal");
    expect(proposal.counterScript).not.toContain("{product}");
    expect(result.ruleQuestions).toEqual([]);
  });

  it("dit pourquoi il n'y a rien : rupture, ou stock non configuré", () => {
    const empty = runRequestPipeline({ understanding, patient: noPatient, catalog: [catalog[2]!], rules: [], history: {}, stockConfigured: true });
    expect(empty.proposals).toEqual([]);
    expect(empty.notes[0]).toContain("rupture");
    const none = runRequestPipeline({ understanding, patient: noPatient, catalog: [], rules: [], history: {}, stockConfigured: false });
    expect(none.notes[0]).toContain("pas configuré");
  });

  it("ne propose rien sans besoin reconnu", () => {
    const result = runRequestPipeline({ understanding: { ...understanding, needs: [] }, patient: noPatient, catalog, rules: [], history: {}, stockConfigured: true });
    expect(result.proposals).toEqual([]);
  });

  it("ne propose jamais deux fois la même référence", () => {
    const two: RequestUnderstanding = { ...understanding, needs: [...understanding.needs, { key: "SORE_THROAT", lineIndexes: [0], justification: "Gorge irritée.", confidence: 0.8 }] };
    const pastilles = product({ id: "pastilles", name: "Pastilles gorge miel-citron", category: "SOINS", matchingTags: ["gorge", "pastille", "nez", "nasal"], stockQuantity: 10 });
    const result = runRequestPipeline({ understanding: two, patient: noPatient, catalog: [pastilles], rules: [], history: {}, stockConfigured: true });
    expect(result.proposals.filter((p) => p.productId === "pastilles")).toHaveLength(1);
  });
});
