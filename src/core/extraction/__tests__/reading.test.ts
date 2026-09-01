import { describe, expect, it } from "vitest";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";
import { FIELD_READING_LABELS, fieldReading } from "../reading";

/**
 * Le comptoir ne lit pas des pourcentages, il lit un état. Ces tests fixent la
 * seule chose qui compte ici : aucun champ douteux ne doit pouvoir passer pour
 * un champ lu.
 */
describe("état de lecture d'un champ", () => {
  it("dit « illisible » quoi qu'annonce la confiance", () => {
    // Le cas dangereux : un modèle très sûr d'un champ qu'il n'a pas lu.
    expect(fieldReading({ unreadable: true, confidence: 0.99 })).toBe("UNREADABLE");
  });

  it("dit « à vérifier » sous le seuil de relecture du moteur", () => {
    expect(fieldReading({ unreadable: false, confidence: OCR_REVIEW_THRESHOLD - 0.01 })).toBe(
      "TO_CHECK",
    );
  });

  it("dit « lu » au seuil exact et au-dessus", () => {
    expect(fieldReading({ unreadable: false, confidence: OCR_REVIEW_THRESHOLD })).toBe("READ");
    expect(fieldReading({ unreadable: false, confidence: 1 })).toBe("READ");
  });

  it("n'affirme rien quand aucune mesure n'accompagne le champ", () => {
    expect(fieldReading({ unreadable: false, confidence: 0 })).toBe("NO_SIGNAL");
    expect(fieldReading({ unreadable: false, confidence: null })).toBe("NO_SIGNAL");
    expect(fieldReading({ unreadable: false, confidence: undefined })).toBe("NO_SIGNAL");
    expect(fieldReading({ unreadable: false, confidence: Number.NaN })).toBe("NO_SIGNAL");
  });

  it("ne promet jamais qu'un champ a été confirmé par un humain", () => {
    // « Confirmé » appartient au pharmacien, sur la ligne entière. Un champ lu
    // par une machine ne doit pas emprunter ce mot.
    for (const state of Object.values(FIELD_READING_LABELS)) {
      expect(state.label.toLowerCase()).not.toContain("confirm");
    }
    expect(FIELD_READING_LABELS.READ.description).toContain("pas une vérification");
  });
});
