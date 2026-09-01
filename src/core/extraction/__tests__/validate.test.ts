import { describe, expect, it } from "vitest";
import { validateVisionExtraction } from "../validate";
import type { ClaimedField, ClaimedPrescription } from "../types";

/**
 * La garantie du lot : un modèle de vision ne peut PAS faire entrer dans
 * l'ordonnance une valeur qu'il n'a pas lue. Ces tests attaquent le validateur
 * comme le ferait un modèle trop serviable.
 */

const OPTIONS = { providerId: "anthropic:test", model: "test" };

function champ(overrides: Partial<ClaimedField> = {}): ClaimedField {
  return { valeur: null, lu_tel_quel: null, confiance: null, ...overrides };
}

function ordonnance(overrides: Partial<ClaimedPrescription> = {}): ClaimedPrescription {
  return {
    prescripteur: champ(),
    rpps: champ(),
    date_prescription: champ(),
    patient: champ(),
    lignes: [],
    ...overrides,
  };
}

function ligne(overrides: Record<string, ClaimedField> = {}) {
  return {
    medicament: champ(),
    dosage: champ(),
    forme: champ(),
    posologie: champ(),
    duree_jours: champ(),
    quantite: champ(),
    instructions: champ(),
    ...overrides,
  };
}

describe("filtre entre le modèle et l'ordonnance", () => {
  it("retient un champ cité sur l'image", () => {
    const { extraction, rejected } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            medicament: champ({
              valeur: "Amoxicilline",
              lu_tel_quel: "AMOXICILLINE 1g",
              confiance: 0.96,
            }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].drugName.value).toBe("Amoxicilline");
    expect(extraction.lines[0].drugName.confidence).toBe(0.96);
    expect(rejected).toEqual([]);
  });

  it("ÉCARTE une valeur que le modèle ne peut pas citer", () => {
    // Le cas dangereux : une posologie plausible, née d'une habitude et non
    // d'une lecture. Sans citation, elle n'entre pas.
    const { extraction, rejected } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            medicament: champ({
              valeur: "Amoxicilline",
              lu_tel_quel: "AMOXICILLINE",
              confiance: 0.9,
            }),
            posologie: champ({
              valeur: "1 comprimé matin et soir",
              lu_tel_quel: null,
              confiance: 0.99,
            }),
          }),
        ],
      }),
      OPTIONS,
    );

    expect(extraction.lines[0].posology.value).toBeNull();
    expect(extraction.lines[0].posology.unreadable).toBe(true);
    expect(rejected).toContainEqual({
      lineIndex: 0,
      field: "posologie",
      reason: "AUCUNE_CITATION",
      claimed: "1 comprimé matin et soir",
    });
  });

  it("une confiance de 0,99 ne rachète jamais une absence de citation", () => {
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [ligne({ dosage: champ({ valeur: "500 mg", lu_tel_quel: "", confiance: 0.99 }) })],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].dosage.value).toBeNull();
  });

  it("écarte une durée dont la citation ne contient aucun chiffre", () => {
    // « 7 jours » ne doit pas naître d'une durée habituelle de traitement.
    const { extraction, rejected } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            duree_jours: champ({
              valeur: "7",
              lu_tel_quel: "pendant une semaine",
              confiance: 0.8,
            }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].durationDays.value).toBeNull();
    expect(rejected[0].reason).toBe("NOMBRE_ILLISIBLE");
  });

  it("accepte une durée dont le chiffre figure bien dans la citation", () => {
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            duree_jours: champ({ valeur: "6", lu_tel_quel: "pendant 6 jours", confiance: 0.93 }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].durationDays.value).toBe(6);
  });

  it("écarte un champ dont la confiance annoncée est hors intervalle", () => {
    const { extraction, rejected } = validateVisionExtraction(
      ordonnance({
        lignes: [ligne({ dosage: champ({ valeur: "1 g", lu_tel_quel: "1 g", confiance: 12 }) })],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].dosage.value).toBeNull();
    expect(rejected[0].reason).toBe("CONFIANCE_INVALIDE");
  });

  it("ne fait jamais disparaître une ligne dont le médicament est illisible", () => {
    // Une ligne supprimée est une ligne que personne ne relira.
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({ medicament: champ({ valeur: null, lu_tel_quel: null, confiance: 0.1 }) }),
          ligne({
            medicament: champ({ valeur: "Doliprane", lu_tel_quel: "DOLIPRANE", confiance: 0.97 }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.lines).toHaveLength(2);
    expect(extraction.lines[0].drugName.value).toBeNull();
    expect(extraction.lines[0].drugName.unreadable).toBe(true);
  });

  it("conserve les citations en texte brut, pour la relecture", () => {
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            medicament: champ({ valeur: "Amoxicilline", lu_tel_quel: "AMOXICILL???", confiance: 0.4 }),
            posologie: champ({ valeur: null, lu_tel_quel: "1 cp x3/j", confiance: 0.3 }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.lines[0].rawText).toBe("AMOXICILL??? 1 cp x3/j");
  });

  it("un champ absent de l'ordonnance n'est pas un rejet", () => {
    // Ne rien lire là où il n'y a rien est le comportement correct.
    const { rejected } = validateVisionExtraction(
      ordonnance({ lignes: [ligne()] }),
      OPTIONS,
    );
    expect(rejected).toEqual([]);
  });

  it("compte les rejets et en donne le motif dans les avertissements", () => {
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            posologie: champ({ valeur: "1 le matin", lu_tel_quel: null, confiance: 0.9 }),
            dosage: champ({ valeur: "500 mg", lu_tel_quel: null, confiance: 0.9 }),
          }),
        ],
      }),
      OPTIONS,
    );
    expect(extraction.warnings[0]).toContain("2 champ(s) écarté(s)");
    expect(extraction.warnings.join(" ")).toContain("sans pouvoir citer le texte");
  });

  it("ne se déclare jamais simulée", () => {
    const { extraction } = validateVisionExtraction(ordonnance(), OPTIONS);
    expect(extraction.isSimulated).toBe(false);
    expect(extraction.providerId).toBe("anthropic:test");
  });

  it("ne moyenne la confiance que sur ce qui a été retenu", () => {
    const { extraction } = validateVisionExtraction(
      ordonnance({
        lignes: [
          ligne({
            medicament: champ({ valeur: "A", lu_tel_quel: "A", confiance: 0.9 }),
            dosage: champ({ valeur: "B", lu_tel_quel: "B", confiance: 0.7 }),
          }),
        ],
      }),
      OPTIONS,
    );
    // Les champs absents ne tirent pas la confiance vers le bas.
    expect(extraction.overallConfidence).toBe(0.8);
  });

  it("survit à une réponse vide sans rien inventer", () => {
    const { extraction } = validateVisionExtraction(
      { lignes: [] } as unknown as ClaimedPrescription,
      OPTIONS,
    );
    expect(extraction.lines).toEqual([]);
    expect(extraction.overallConfidence).toBe(0);
    expect(extraction.warnings).toContain("Aucune ligne n'a pu être lue sur cette image.");
  });
});
