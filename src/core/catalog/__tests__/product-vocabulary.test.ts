import { describe, expect, it } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import {
  ADVICE_VOCABULARY,
  classifyNationalDrug,
  classifyProductByName,
  restrictToVocabulary,
  rulesServedBy,
} from "../product-vocabulary";
import { validateProductClassification } from "../product-classification-schema";

describe("le vocabulaire fermé des règles", () => {
  it("contient exactement les étiquettes des règles de conseil", () => {
    const expected = new Set(ADVICE_RULES.flatMap((rule) => rule.matchingTags.map((t) => t.toLowerCase())));
    expect(new Set(ADVICE_VOCABULARY)).toEqual(expected);
  });

  it("ne garde d'un jeu d'étiquettes que celles du vocabulaire", () => {
    expect(restrictToVocabulary(["Probiotique", "licorne", "nez"])).toEqual(["probiotique", "nez"]);
  });
});

describe("comprendre un produit par son nom", () => {
  const cases: [string, string, string][] = [
    ["ULTRA-LEVURE 200MG GELULE B/30", "PROBIOTIQUES", "digestive-tolerance-antibiotics"],
    ["LACTIBIANE REFERENCE 30 GELULES", "PROBIOTIQUES", "digestive-tolerance-antibiotics"],
    ["PHYSIOMER SPRAY NASAL 135ML", "SOINS", "nasal-hygiene-orl"],
    ["STERIMAR NEZ BOUCHE 50ML", "SOINS", "nasal-hygiene-orl"],
    ["Sérum physiologique 40 dosettes", "SOINS", "nasal-hygiene-orl"],
    ["STREPSILS MIEL CITRON PASTILLES", "SOINS", "sore-throat-orl"],
    ["Thermomètre frontal infrarouge", "DISPOSITIFS_MEDICAUX", "fever-thermometer"],
    ["ADIARIL SOLUTION DE REHYDRATATION 10 SACHETS", "NUTRITION", "rehydration-digestive"],
    ["Larmes artificielles unidoses x30", "SOINS", "eye-irritation-allergy"],
    ["ELUDRIL BAIN DE BOUCHE 500ML", "HYGIENE", "mouth-rinse-inhaled-corticosteroid"],
    ["Spray bouche sèche 15 ml", "HYGIENE", "dry-mouth-hygiene"],
    ["MAGNESIUM MARIN B6 60 CP", "MAGNESIUM", "magnesium-fatigue"],
    ["ZYMAD 10000 UI/ML SOL BUV", "VITAMINES", "vitamin-d-elderly"],
    ["GAVISCON MENTHE SUSP BUV", "SOINS", "gastric-protection-nsaid"],
    ["Psyllium blond 300 g", "NUTRITION", "iron-absorption-support"],
    ["DEXERYL CREME 250G", "DERMOCOSMETIQUE", "hydration-dermato-topical"],
    ["ANTHELIOS UVMUNE SPF50+ 50ML", "DERMOCOSMETIQUE", "sun-photosensitivity"],
  ];

  it.each(cases)("%s → %s (règle %s)", (name, category, ruleKey) => {
    const result = classifyProductByName(name);
    expect(result).not.toBeNull();
    expect(result?.category).toBe(category);
    expect(result?.ruleKeys).toContain(ruleKey);
    expect(result?.tags.every((tag) => ADVICE_VOCABULARY.includes(tag))).toBe(true);
  });

  it("range sans étiquette d'usage ce qui ne sert aucune règle", () => {
    const shampoo = classifyProductByName("Shampooing doux 200 ml");
    expect(shampoo?.category).toBe("HYGIENE");
    expect(shampoo?.tags).toEqual([]);
    expect(shampoo?.ruleKeys).toEqual([]);
  });

  it("répond null pour un nom qui ne dit rien", () => {
    expect(classifyProductByName("REF 48213")).toBeNull();
    expect(classifyProductByName("")).toBeNull();
  });

  it("préfère un motif qui sert une règle à une catégorie générique", () => {
    // « crème » est générique (dermocosmétique) ; « émolliente » sert la règle d'hydratation.
    const cream = classifyProductByName("Crème émolliente 400 ml");
    expect(cream?.ruleKeys).toContain("hydration-dermato-topical");
  });
});

describe("comprendre un médicament du catalogue national", () => {
  it("reconnaît un probiotique par sa substance", () => {
    const result = classifyNationalDrug({ name: "ULTRA-LEVURE 200 mg, gélule", substances: ["SACCHAROMYCES BOULARDII"], form: "gélule" });
    expect(result?.category).toBe("PROBIOTIQUES");
    expect(result?.tags).toContain("probiotique");
  });

  it("n'appelle « nasal » un chlorure de sodium que sous forme nasale", () => {
    const nasal = classifyNationalDrug({ name: "SÉRUM PHYSIOLOGIQUE", substances: ["CHLORURE DE SODIUM"], form: "solution nasale", routes: ["nasale"] });
    expect(nasal?.ruleKeys).toContain("nasal-hygiene-orl");
    const injectable = classifyNationalDrug({ name: "CHLORURE DE SODIUM 0,9 %", substances: ["CHLORURE DE SODIUM"], form: "solution injectable", routes: ["intraveineuse"] });
    expect(injectable?.ruleKeys ?? []).not.toContain("nasal-hygiene-orl");
  });

  it("liste les règles qu'une catégorie et des étiquettes peuvent servir", () => {
    expect(rulesServedBy("PROBIOTIQUES", [])).toContain("digestive-tolerance-antibiotics");
    expect(rulesServedBy("AUTRE", ["thermomètre"])).toContain("fever-thermometer");
    expect(rulesServedBy("AUTRE", [])).toEqual([]);
  });
});

describe("valider ce que le modèle renvoie", () => {
  it("écarte les catégories inconnues, les étiquettes hors vocabulaire et la faible confiance", () => {
    const { results, warnings } = validateProductClassification(
      {
        produits: [
          { index: 0, categorie: "PROBIOTIQUES", etiquettes: ["probiotique", "licorne"], confiance: 0.9 },
          { index: 1, categorie: "COSMIQUE", etiquettes: [], confiance: 0.9 },
          { index: 2, categorie: "SOINS", etiquettes: ["nez"], confiance: 0.2 },
          { index: 7, categorie: "SOINS", etiquettes: [], confiance: 0.9 },
          { index: 0, categorie: "SOINS", etiquettes: [], confiance: 0.9 },
        ],
      },
      { count: 3, providerId: "test", model: "m" },
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ index: 0, category: "PROBIOTIQUES", tags: ["probiotique"], source: "AI" });
    expect(warnings.length).toBe(5);
  });
});

describe("pièges du dictionnaire", () => {
  it("ne range pas le fer bisglycinate dans le magnésium", async () => {
    const { classifyProductByName } = await import("../product-vocabulary");
    const iron = classifyProductByName("FER BISGLYCINATE 14MG 60 GEL");
    expect(iron?.category).toBe("MINERAUX");
    expect(iron?.ruleKeys ?? []).not.toContain("magnesium-fatigue");
  });
  it("garde le miel comme adoucissant de la gorge, sans en faire une pastille", async () => {
    const { classifyProductByName } = await import("../product-vocabulary");
    const honey = classifyProductByName("MIEL DE THYM 250G");
    expect(honey?.tags).not.toContain("pastilles");
    expect(honey?.ruleKeys.some((key) => ["sore-throat-orl", "cough-throat-comfort"].includes(key))).toBe(true);
  });
});
