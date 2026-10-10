import { describe, expect, it } from "vitest";
import { drugClassificationIsUncertain, parseDrugAnswer, parseProductAnswer, productDecisionIsUncertain } from "../gaps";

describe("ce que PharmaBoost ne sait pas ranger", () => {
  it("un produit sans décision est « pas su le ranger », un doute du modèle est signalé, le dictionnaire et la pharmacienne passent", () => {
    expect(productDecisionIsUncertain(null)).toBe("UNCLASSIFIED");
    expect(productDecisionIsUncertain({ source: "AI", confidence: 0.4 })).toBe("LOW_CONFIDENCE");
    expect(productDecisionIsUncertain({ source: "AI", confidence: 0.85 })).toBeNull();
    expect(productDecisionIsUncertain({ source: "HEURISTIC", confidence: 0.75 })).toBeNull();
    expect(productDecisionIsUncertain({ source: "PHARMACIST", confidence: 0.1 })).toBeNull();
  });

  it("un médicament sans famille, ou dont le modèle doute, est signalé ; un médicament confirmé ne l'est jamais", () => {
    expect(drugClassificationIsUncertain({ atcCode: null, therapeuticClass: null, confidence: 0.9 })).toBe("NO_FAMILY");
    expect(drugClassificationIsUncertain({ atcCode: "J01CA04", therapeuticClass: null, confidence: 0.3 })).toBe("LOW_CONFIDENCE");
    expect(drugClassificationIsUncertain({ atcCode: "J01CA04", therapeuticClass: "Pénicillines", confidence: 0.9 })).toBeNull();
    expect(drugClassificationIsUncertain({ atcCode: null, therapeuticClass: null, confidence: 0.1, validated: true })).toBeNull();
  });
});

describe("la réponse de la pharmacienne pour un produit", () => {
  it("accepte une catégorie et des étiquettes du vocabulaire des règles", () => {
    expect(parseProductAnswer({ category: "PROBIOTIQUES", tags: ["probiotique", "Flore intestinale"] })).toEqual({ ok: true, value: { category: "PROBIOTIQUES", tags: ["probiotique", "flore intestinale"] } });
  });
  it("« pas un produit de conseil » : une catégorie sans étiquette", () => {
    expect(parseProductAnswer({ category: "AUTRE", tags: [] })).toEqual({ ok: true, value: { category: "AUTRE", tags: [] } });
  });
  it("refuse une catégorie inconnue, une étiquette inventée, trop d'étiquettes", () => {
    expect(parseProductAnswer({ category: "MAGIE", tags: [] }).ok).toBe(false);
    expect(parseProductAnswer({ category: "SOINS", tags: ["étiquette-inventée"] })).toMatchObject({ ok: false, error: expect.stringContaining("n'existe pas") });
    expect(parseProductAnswer({ category: "SOINS", tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).ok).toBe(false);
    expect(parseProductAnswer(null).ok).toBe(false);
  });
});

describe("la réponse de la pharmacienne pour un médicament", () => {
  it("accepte une famille : code ATC et/ou classe", () => {
    expect(parseDrugAnswer({ substance: "Amoxicilline", atcCode: "j01ca04", therapeuticClass: "Pénicillines" })).toEqual({ ok: true, value: { substance: "Amoxicilline", atcCode: "J01CA04", therapeuticClass: "Pénicillines" } });
    expect(parseDrugAnswer({ therapeuticClass: "Antibiotique" })).toMatchObject({ ok: true, value: { atcCode: null } });
    expect(parseDrugAnswer({ atcCode: "N02BE01" })).toMatchObject({ ok: true });
    // Une famille suffit : le niveau d'un groupe (J01) est accepté, les règles se déclenchent sur des débuts de code.
    expect(parseDrugAnswer({ atcCode: "J01" })).toMatchObject({ ok: true, value: { atcCode: "J01" } });
  });
  it("refuse une réponse sans famille, un code ATC mal écrit, une classe trop courte", () => {
    expect(parseDrugAnswer({ substance: "Amoxicilline" }).ok).toBe(false);
    expect(parseDrugAnswer({ atcCode: "J0" }).ok).toBe(false);
    expect(parseDrugAnswer({ atcCode: "ZZ99" }).ok).toBe(false);
    expect(parseDrugAnswer({ therapeuticClass: "ab" }).ok).toBe(false);
  });
});
