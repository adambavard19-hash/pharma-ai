import { describe, expect, it } from "vitest";
import { ADVICE_FAMILIES, adviceFamilyOf, countByFamily, describeFamilyMix, FAMILY_LABELS, FAMILY_PLURAL_LABELS, FAMILY_SINGULAR_LABELS } from "../family";

describe("la famille d'un conseil", () => {
  it("un médicament du catalogue national est un médicament conseil, même rangé en probiotique", () => {
    expect(adviceFamilyOf({ presentationId: "pres_1", category: "PROBIOTIQUES" })).toBe("MEDICAMENT");
    expect(adviceFamilyOf({ origin: "NATIONAL_DRUG", category: "SOINS" })).toBe("MEDICAMENT");
  });

  it("probiotiques, vitamines, minéraux, magnésium, phytothérapie et nutrition sont des compléments alimentaires", () => {
    for (const category of ["PROBIOTIQUES", "VITAMINES", "MINERAUX", "MAGNESIUM", "PHYTOTHERAPIE", "NUTRITION"]) {
      expect(adviceFamilyOf({ category })).toBe("COMPLEMENT");
    }
  });

  it("le reste est de la parapharmacie : hygiène, dermo, soins, dispositifs, saisonnier, autres", () => {
    for (const category of ["HYGIENE", "DERMATOLOGIE", "DERMOCOSMETIQUE", "SOINS", "DISPOSITIFS_MEDICAUX", "SAISONNIER", "AUTRE", "INCONNUE"]) {
      expect(adviceFamilyOf({ category })).toBe("PARAPHARMACIE");
    }
  });
});

describe("le résumé d'un conseil complet", () => {
  it("compte par famille et écrit seulement les familles présentes, au singulier ou au pluriel", () => {
    expect(countByFamily(["MEDICAMENT", "COMPLEMENT", "COMPLEMENT", "PARAPHARMACIE", "PARAPHARMACIE", "PARAPHARMACIE"])).toEqual({ MEDICAMENT: 1, COMPLEMENT: 2, PARAPHARMACIE: 3 });
    expect(describeFamilyMix({ MEDICAMENT: 1, COMPLEMENT: 2, PARAPHARMACIE: 3 })).toBe("1 médicament conseil · 2 compléments alimentaires · 3 produits de parapharmacie");
    expect(describeFamilyMix({ MEDICAMENT: 0, COMPLEMENT: 1, PARAPHARMACIE: 0 })).toBe("1 complément alimentaire");
    expect(describeFamilyMix({ MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 0 })).toBe("");
  });

  it("au singulier, chaque famille a son libellé : « 1 produit de parapharmacie », jamais « 1 parapharmacie »", () => {
    expect(describeFamilyMix({ MEDICAMENT: 1, COMPLEMENT: 0, PARAPHARMACIE: 0 })).toBe("1 médicament conseil");
    expect(describeFamilyMix({ MEDICAMENT: 0, COMPLEMENT: 1, PARAPHARMACIE: 0 })).toBe("1 complément alimentaire");
    expect(describeFamilyMix({ MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 1 })).toBe("1 produit de parapharmacie");
    expect(describeFamilyMix({ MEDICAMENT: 1, COMPLEMENT: 1, PARAPHARMACIE: 1 })).toBe("1 médicament conseil · 1 complément alimentaire · 1 produit de parapharmacie");
  });

  it("le singulier ne vaut que pour un : zéro n'est pas écrit, deux passent au pluriel, et le mélange reste lisible", () => {
    expect(describeFamilyMix({ MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 2 })).toBe("2 produits de parapharmacie");
    expect(describeFamilyMix({ MEDICAMENT: 2, COMPLEMENT: 1, PARAPHARMACIE: 0 })).toBe("2 médicaments conseil · 1 complément alimentaire");
    expect(describeFamilyMix({ MEDICAMENT: 1, COMPLEMENT: 0, PARAPHARMACIE: 3 })).toBe("1 médicament conseil · 3 produits de parapharmacie");
  });

  it("chaque famille a un libellé de pastille, un singulier et un pluriel distincts", () => {
    for (const family of ADVICE_FAMILIES) {
      expect(FAMILY_LABELS[family].length).toBeGreaterThan(0);
      expect(FAMILY_SINGULAR_LABELS[family]).not.toBe(FAMILY_PLURAL_LABELS[family]);
    }
    expect(FAMILY_SINGULAR_LABELS).toEqual({ MEDICAMENT: "médicament conseil", COMPLEMENT: "complément alimentaire", PARAPHARMACIE: "produit de parapharmacie" });
  });

  it("l'ordre d'affichage est médicament, complément, parapharmacie", () => {
    expect(ADVICE_FAMILIES).toEqual(["MEDICAMENT", "COMPLEMENT", "PARAPHARMACIE"]);
  });
});
