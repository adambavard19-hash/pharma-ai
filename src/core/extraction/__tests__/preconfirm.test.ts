import { describe, expect, it } from "vitest";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";
import { canPreconfirm, preconfirmPrescription, type LineReadout } from "../preconfirm";

/**
 * La règle qui décide si une ligne peut être retenue sans qu'un humain la
 * coche. C'est le seul allègement de ce produit qui touche à une garantie de
 * sécurité : elle est donc testée DANS LES DEUX SENS — ce qui doit passer, et
 * surtout tout ce qui ne doit jamais passer.
 */

const SUR = 0.95;

function ligne(overrides: Partial<LineReadout> = {}): LineReadout {
  return {
    drugName: "Amoxicilline",
    dosage: "1 g",
    form: "Comprimé dispersible",
    posology: "1 comprimé matin et soir",
    durationDays: 6,
    quantity: 12,
    instructions: null,
    unreadableFields: [],
    confidence: {
      drugName: SUR,
      dosage: SUR,
      form: SUR,
      posology: SUR,
      durationDays: SUR,
      quantity: SUR,
      instructions: 0,
    },
    ...overrides,
  };
}

const ACTIF = { enabled: true };

describe("pré-confirmation d'une ligne intégralement lue", () => {
  it("retient une ligne dont chaque champ renseigné est lu au-dessus du seuil", () => {
    expect(canPreconfirm(ligne(), ACTIF).preconfirmed).toBe(true);
  });

  it("ne réclame rien pour un champ vide et non mesuré", () => {
    // Il n'y avait pas d'instructions sur l'ordonnance : ne rien lire là où il
    // n'y a rien est un résultat correct, pas un doute.
    const result = canPreconfirm(ligne({ instructions: null }), ACTIF);
    expect(result.preconfirmed).toBe(true);
  });

  it("accepte le seuil exact", () => {
    const result = canPreconfirm(
      ligne({ confidence: { ...ligne().confidence, dosage: OCR_REVIEW_THRESHOLD } }),
      ACTIF,
    );
    expect(result.preconfirmed).toBe(true);
  });
});

describe("ce qui ne doit JAMAIS être pré-confirmé", () => {
  it("refuse une ligne sans nom de médicament", () => {
    const result = canPreconfirm(ligne({ drugName: null }), ACTIF);
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("SANS_MEDICAMENT");
  });

  it("refuse un nom de médicament réduit à des espaces", () => {
    expect(canPreconfirm(ligne({ drugName: "   " }), ACTIF).preconfirmed).toBe(false);
  });

  it("refuse dès qu'un champ est illisible, même avec une confiance parfaite ailleurs", () => {
    const result = canPreconfirm(
      ligne({ posology: null, unreadableFields: ["posology"] }),
      ACTIF,
    );
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("CHAMP_ILLISIBLE");
    expect(result.field).toBe("posology");
    expect(result.message).toContain("posologie");
  });

  it("refuse un champ illisible même si le modèle a quand même proposé une valeur", () => {
    // Le cas dangereux : une valeur plausible posée sur un champ que la lecture
    // a elle-même déclaré illisible.
    const result = canPreconfirm(
      ligne({ posology: "1 comprimé", unreadableFields: ["posology"] }),
      ACTIF,
    );
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("CHAMP_ILLISIBLE");
  });

  it("refuse un seul champ lu sous le seuil de relecture", () => {
    const result = canPreconfirm(
      ligne({
        confidence: { ...ligne().confidence, dosage: OCR_REVIEW_THRESHOLD - 0.01 },
      }),
      ACTIF,
    );
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("LECTURE_INCERTAINE");
    expect(result.field).toBe("dosage");
  });

  it("refuse une valeur présente qu'aucune mesure n'accompagne", () => {
    // « Pas de doute » et « pas de mesure » ne sont pas la même chose.
    const result = canPreconfirm(
      ligne({ instructions: "À prendre pendant le repas", confidence: { ...ligne().confidence } }),
      ACTIF,
    );
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("LECTURE_NON_MESUREE");
    expect(result.field).toBe("instructions");
  });

  it("refuse une confiance aberrante", () => {
    for (const aberrante of [Number.NaN, -1, 0]) {
      const result = canPreconfirm(
        ligne({ confidence: { ...ligne().confidence, drugName: aberrante } }),
        ACTIF,
      );
      expect(result.preconfirmed).toBe(false);
    }
  });

  it("refuse tout quand l'interrupteur est fermé", () => {
    const result = canPreconfirm(ligne(), { enabled: false });
    expect(result.preconfirmed).toBe(false);
    if (result.preconfirmed) return;
    expect(result.reason).toBe("DESACTIVEE");
  });
});

describe("verdict sur l'ordonnance entière", () => {
  it("n'allège le parcours que si TOUTES les lignes passent", () => {
    const douteuse = ligne({ posology: null, unreadableFields: ["posology"] });
    const result = preconfirmPrescription([ligne(), douteuse], ACTIF);

    expect(result.preconfirmedCount).toBe(1);
    expect(result.allPreconfirmed).toBe(false);
  });

  it("allège quand chaque ligne est intégralement lue", () => {
    const result = preconfirmPrescription([ligne(), ligne()], ACTIF);
    expect(result.allPreconfirmed).toBe(true);
    expect(result.preconfirmedCount).toBe(2);
  });

  it("ne traite pas une ordonnance sans ligne comme entièrement lue", () => {
    // Zéro sur zéro vaut cent pour cent : le piège classique. Une extraction
    // qui n'a rien produit ne doit pas ouvrir le parcours allégé.
    const result = preconfirmPrescription([], ACTIF);
    expect(result.allPreconfirmed).toBe(false);
    expect(result.preconfirmedCount).toBe(0);
  });

  it("interrupteur fermé : aucune ligne, quelle qu'elle soit", () => {
    const result = preconfirmPrescription([ligne(), ligne()], { enabled: false });
    expect(result.allPreconfirmed).toBe(false);
    expect(result.preconfirmedCount).toBe(0);
  });
});
