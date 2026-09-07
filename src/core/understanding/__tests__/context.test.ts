import { describe, expect, it } from "vitest";
import { deriveUnderstanding, type DrugClassification } from "..";

/**
 * Le contexte et les besoins se dérivent des codes ATC, localement.
 *
 * Ces règles remplacent une hypothèse de modèle par une lecture écrite : un
 * antibiotique avec un antitussif et un antihistaminique, c'est un contexte
 * respiratoire infectieux — et l'ordonnance qui traite déjà la toux ne doit
 * pas faire proposer un sirop.
 */

const drug = (lineIndex: number, atcCode: string | null, substance = "X"): DrugClassification => ({
  lineIndex,
  substance,
  atcCode,
  therapeuticClass: null,
  commonSideEffects: [],
  confidence: 0.9,
  source: "CACHE",
});

const patient = { ageYears: 26, sex: "UNSPECIFIED" as const, isPregnant: null, isBreastfeeding: null };
const base = { patient, providerId: "test", model: "m" };

describe("dérivation locale du contexte", () => {
  it("lit l'ordonnance réelle : macrolide + corticoïde inhalé + antitussif + antihistaminique", () => {
    const result = deriveUnderstanding({
      ...base,
      drugs: [
        drug(0, "N02BE01", "PARACÉTAMOL"),
        drug(1, "J01FA06", "ROXITHROMYCINE"),
        drug(2, "R03BA01", "BÉCLOMÉTASONE"),
        drug(3, "R05DA09", "DEXTROMÉTHORPHANE"),
        drug(4, "R06AX29", "BILASTINE"),
      ],
    });
    const keys = result.needs.map((need) => need.key);
    expect(keys).toContain("ANTIBIOTIC_DIGESTIVE_TOLERANCE");
    expect(keys).toContain("NASAL_CONGESTION");
    expect(keys).toContain("SORE_THROAT");
    expect(keys).toContain("FEVER_MONITORING");
    expect(keys).toContain("ALLERGIC_EYE_IRRITATION");
    // La toux est déjà traitée : aucun besoin de confort pour la toux.
    expect(keys).not.toContain("COUGH_COMFORT");
    // Un antihistaminique non sédatif ne donne pas la bouche sèche.
    expect(keys).not.toContain("DRY_MOUTH");
    expect(result.context.groups).toEqual(
      expect.arrayContaining(["infectieux", "respiratoire", "allergique", "douleur ou fièvre"]),
    );
    expect(result.context.summary).toMatch(/^Contexte probable/);
    expect(result.cachedCount).toBe(5);
  });

  it("nomme les lignes qui motivent chaque besoin", () => {
    const result = deriveUnderstanding({ ...base, drugs: [drug(0, "N02BE01"), drug(3, "J01CA04")] });
    const antibiotic = result.needs.find((need) => need.key === "ANTIBIOTIC_DIGESTIVE_TOLERANCE");
    expect(antibiotic?.lineIndexes).toEqual([3]);
  });

  it("se tait quand l'ordonnance couvre déjà le besoin", () => {
    const withProbiotic = deriveUnderstanding({ ...base, drugs: [drug(0, "J01CA04"), drug(1, "A07FA01")] });
    expect(withProbiotic.needs.map((n) => n.key)).not.toContain("ANTIBIOTIC_DIGESTIVE_TOLERANCE");

    const withNasal = deriveUnderstanding({ ...base, drugs: [drug(0, "R06AX29"), drug(1, "R01AD09")] });
    expect(withNasal.needs.map((n) => n.key)).not.toContain("NASAL_CONGESTION");

    const withGastric = deriveUnderstanding({ ...base, drugs: [drug(0, "M01AE01"), drug(1, "A02BC01")] });
    expect(withGastric.needs.map((n) => n.key)).not.toContain("GASTRIC_DISCOMFORT");
  });

  it("ne déduit rien d'une ligne non classée", () => {
    const result = deriveUnderstanding({ ...base, drugs: [drug(0, null), drug(1, null)] });
    expect(result.needs).toEqual([]);
    expect(result.context.summary).toBe("");
    expect(result.context.confidence).toBe(0);
  });

  it("tient compte de l'âge pour la réhydratation", () => {
    const child = deriveUnderstanding({ ...base, patient: { ...patient, ageYears: 4 }, drugs: [drug(0, "J01CA04")] });
    expect(child.needs.map((n) => n.key)).toContain("REHYDRATION");
    const adult = deriveUnderstanding({ ...base, drugs: [drug(0, "J01CA04")] });
    expect(adult.needs.map((n) => n.key)).not.toContain("REHYDRATION");
  });

  it("signale la photosensibilisation d'une cycline", () => {
    const result = deriveUnderstanding({ ...base, drugs: [drug(0, "J01AA02", "DOXYCYCLINE")] });
    expect(result.needs.find((need) => need.key === "PHOTOSENSITIVITY")).toMatchObject({
      confidence: 0.9,
      lineIndexes: [0],
    });
  });
});
