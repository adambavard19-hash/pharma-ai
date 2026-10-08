import { describe, expect, it } from "vitest";
import { associationError, cleanSentence, MAX_SENTENCE_LENGTH } from "../rules";

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
});

describe("ce qu'une association refuse", () => {
  const ok = { triggerProductId: "a", adviceProductId: "b", sentence: null };
  it("accepte deux produits différents, avec ou sans phrase", () => {
    expect(associationError(ok)).toBeNull();
    expect(associationError({ ...ok, sentence: "x".repeat(MAX_SENTENCE_LENGTH) })).toBeNull();
  });
  it("refuse un produit associé à lui-même, un choix incomplet et une phrase trop longue", () => {
    expect(associationError({ ...ok, adviceProductId: "a" })).toBe("Un produit ne peut pas être associé à lui-même.");
    expect(associationError({ ...ok, adviceProductId: "" })).toBe("Choisissez les deux produits.");
    expect(associationError({ ...ok, sentence: "x".repeat(MAX_SENTENCE_LENGTH + 1) })).toContain("trop longue");
  });
});
