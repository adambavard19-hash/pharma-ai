import { describe, expect, it } from "vitest";
import { associationError, cleanSentence, MAX_SENTENCE_LENGTH, sentenceError } from "../rules";

describe("la phrase du pharmacien", () => {
  it("ramène les espaces et les retours à la ligne à un seul espace, et retire les caractères de contrôle", () => {
    expect(cleanSentence("  Pour la toux\n\n  qui\ts'installe.  ")).toBe("Pour la toux qui s'installe.");
    expect(cleanSentence("a\u0000b\u0007c")).toBe("a b c");
  });

  it("est absente quand elle est vide ou ne contient que des espaces", () => {
    expect(cleanSentence("   \n ")).toBeNull();
    expect(cleanSentence("")).toBeNull();
    expect(cleanSentence(null)).toBeNull();
    expect(cleanSentence(undefined)).toBeNull();
  });

  it("garde le texte tel quel : aucune balise interprétée, aucune réécriture", () => {
    expect(cleanSentence("<b>ça</b> « marche »")).toBe("<b>ça</b> « marche »");
  });

  it("a une longueur limitée", () => {
    expect(sentenceError("x".repeat(MAX_SENTENCE_LENGTH))).toBeNull();
    expect(sentenceError("x".repeat(MAX_SENTENCE_LENGTH + 1))).toContain("trop longue");
    expect(sentenceError(null)).toBeNull();
  });
});

describe("ce qu'une association refuse", () => {
  const byProduct = { triggerProductId: "a", adviceProductId: "b", sentence: null };
  const byDrug = { triggerSpecialtyId: "s1", adviceProductId: "b", sentence: null };

  it("accepte un produit OU un médicament comme déclencheur, avec ou sans phrase", () => {
    expect(associationError(byProduct)).toBeNull();
    expect(associationError(byDrug)).toBeNull();
    expect(associationError({ ...byDrug, sentence: "x".repeat(MAX_SENTENCE_LENGTH) })).toBeNull();
  });

  it("refuse un produit associé à lui-même, un choix incomplet, deux déclencheurs et une phrase trop longue", () => {
    expect(associationError({ ...byProduct, adviceProductId: "a" })).toBe("Un produit ne peut pas être associé à lui-même.");
    expect(associationError({ ...byProduct, adviceProductId: "" })).toBe("Choisissez le produit à conseiller.");
    expect(associationError({ adviceProductId: "b", sentence: null })).toBe("Choisissez le produit ou le médicament déclencheur.");
    expect(associationError({ triggerProductId: "a", triggerSpecialtyId: "s1", adviceProductId: "b", sentence: null })).toBe("Choisissez un seul déclencheur : un produit ou un médicament.");
    expect(associationError({ ...byDrug, sentence: "x".repeat(MAX_SENTENCE_LENGTH + 1) })).toContain("trop longue");
  });

  it("un médicament peut déclencher un produit portant le même identifiant : ce ne sont pas les mêmes choses", () => {
    expect(associationError({ triggerSpecialtyId: "b", adviceProductId: "b", sentence: null })).toBeNull();
  });
});
