import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_MIN_CONFIDENCE,
  UNDERSTANDING_SCHEMA,
  validateClassification,
  type ClaimedClassification,
} from "..";

const context = { lineCount: 3, providerId: "test", model: "test-model" };

function claimed(overrides: Partial<ClaimedClassification> = {}): ClaimedClassification {
  return {
    medicaments: [
      {
        ligne: 0,
        substance: "roxithromycine",
        code_atc: "J01FA06",
        classe_therapeutique: "Antibiotique macrolide",
        confiance: 0.95,
      },
    ],
    ...overrides,
  };
}

describe("validation de la classification", () => {
  it("normalise une classification correcte", () => {
    const { result, rejected } = validateClassification(claimed(), context);
    expect(rejected).toEqual([]);
    expect(result.drugs).toHaveLength(1);
    expect(result.drugs[0]).toMatchObject({
      lineIndex: 0,
      substance: "ROXITHROMYCINE",
      atcCode: "J01FA06",
      source: "MODEL",
    });
  });

  it("garde la classification mais refuse un code ATC mal formé", () => {
    const { result, rejected } = validateClassification(
      claimed({ medicaments: [{ ...claimed().medicaments[0], code_atc: "ATC-J01" }] }),
      context,
    );
    expect(result.drugs[0].atcCode).toBeNull();
    expect(result.drugs[0].substance).toBe("ROXITHROMYCINE");
    expect(rejected[0].reason).toMatch(/^ATC_MAL_FORME/);
  });

  it("ignore une classification trop peu sûre plutôt que de la garder", () => {
    const { result, rejected } = validateClassification(
      claimed({
        medicaments: [
          { ...claimed().medicaments[0], confiance: CLASSIFICATION_MIN_CONFIDENCE - 0.01 },
        ],
      }),
      context,
    );
    expect(result.drugs).toEqual([]);
    expect(rejected[0].reason).toBe("CLASSIFICATION_PEU_SURE");
  });

  it("refuse une ligne qui n'existe pas sur l'ordonnance", () => {
    const { result, rejected } = validateClassification(
      claimed({ medicaments: [{ ...claimed().medicaments[0], ligne: 7 }] }),
      context,
    );
    expect(result.drugs).toEqual([]);
    expect(rejected).toContainEqual({ subject: "ligne 7", reason: "LIGNE_INEXISTANTE" });
  });

  it("traduit les chaînes vides en inconnu, jamais en fait", () => {
    const { result } = validateClassification(
      claimed({
        medicaments: [
          { ligne: 1, substance: "", code_atc: "", classe_therapeutique: "  ", confiance: 0.9 },
        ],
      }),
      context,
    );
    expect(result.drugs[0]).toMatchObject({ substance: null, atcCode: null, therapeuticClass: null });
  });

  it("garde la version la plus sûre d'une ligne classée deux fois", () => {
    const { result } = validateClassification(
      claimed({
        medicaments: [
          { ligne: 0, substance: "A", code_atc: "J01FA06", classe_therapeutique: "x", confiance: 0.8 },
          { ligne: 0, substance: "B", code_atc: "J01FA06", classe_therapeutique: "x", confiance: 0.95 },
        ],
      }),
      context,
    );
    expect(result.drugs).toHaveLength(1);
    expect(result.drugs[0].substance).toBe("B");
  });

  it("n'expose aucune union de types dans le schéma strict", () => {
    const text = JSON.stringify(UNDERSTANDING_SCHEMA);
    expect(text).not.toContain('"type":["');
    expect(text).not.toContain("anyOf");
  });
});
