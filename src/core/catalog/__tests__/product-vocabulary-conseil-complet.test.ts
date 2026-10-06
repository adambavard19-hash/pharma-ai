import { describe, expect, it } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { ADVICE_VOCABULARY, classifyProductByName } from "../product-vocabulary";

/**
 * Les produits que cinq règles du « conseil complet par ordonnance » appellent :
 * le dictionnaire doit les reconnaître par leur nom, avec la catégorie de la règle
 * et une étiquette de son vocabulaire — et ne jamais ranger à tort un produit voisin
 * (une lotion antipoux, une aiguille de stylo, un sirop de glucose).
 */

const RULE_KEYS = ["inhaler-spacer-chamber", "head-lice-comb", "self-injection-sharps-container", "corticosteroid-oral-calcium", "hypoglycemia-fast-sugar"] as const;
const ruleOf = (key: string) => ADVICE_RULES.find((rule) => rule.key === key)!;

const RECOGNISED: [string, (typeof RULE_KEYS)[number]][] = [
  ["AEROCHAMBER PLUS CHAMBRE D'INHALATION ADULTE EMBOUT", "inhaler-spacer-chamber"],
  ["BABYHALER chambre d'inhalation bébé masque", "inhaler-spacer-chamber"],
  ["OPTICHAMBER DIAMOND", "inhaler-spacer-chamber"],
  ["VOLUMATIC CHAMBRE INHALATION", "inhaler-spacer-chamber"],
  // Les libellés abrégés des vrais fichiers de stock (LGO) : « CH/INHAL », « CHAMB INHAL ».
  ["BIOSYNEX CH/INHAL NOURISS 0-", "inhaler-spacer-chamber"],
  ["INHAL'AIR CH/INHAL +6ANS/ADULTE", "inhaler-spacer-chamber"],
  ["CHAMB INHAL ENFANT MASQUE", "inhaler-spacer-chamber"],
  ["PEIGNE ANTI-POUX INOX", "head-lice-comb"],
  ["PEIGNE ANTIPOUX ET LENTES", "head-lice-comb"],
  ["Peigne à poux et à lentes métal", "head-lice-comb"],
  ["COLLECTEUR D'AIGUILLES DASTRI 1 L", "self-injection-sharps-container"],
  ["COLLECTEUR DASRI 0,5L", "self-injection-sharps-container"],
  ["MINICOLLECTEUR PIQUANTS COUPANTS", "self-injection-sharps-container"],
  ["BOITE A AIGUILLES 1,5 L", "self-injection-sharps-container"],
  ["OROCAL 500 mg comprimé à croquer", "corticosteroid-oral-calcium"],
  ["CALCIUM 500 MG 60 COMPRIMES", "corticosteroid-oral-calcium"],
  ["DEXTRO ENERGY CLASSIC 14 COMPRIMES", "hypoglycemia-fast-sugar"],
  ["GLUCOSE COMPRIMES A CROQUER B/20", "hypoglycemia-fast-sugar"],
  ["Sachets de glucose 15 g", "hypoglycemia-fast-sugar"],
];

describe("les produits des règles du conseil complet sont reconnus par leur nom", () => {
  it.each(RECOGNISED)("%s → règle %s", (name, ruleKey) => {
    const result = classifyProductByName(name);
    expect(result).not.toBeNull();
    expect(result?.ruleKeys).toContain(ruleKey);
    // La catégorie est celle de la règle : sans elle, la pertinence reste sous le seuil.
    expect(result?.category).toBe(ruleOf(ruleKey).category);
    // Au moins une étiquette de la règle, et toutes dans le vocabulaire fermé.
    expect(result?.tags.some((tag) => ruleOf(ruleKey).matchingTags.includes(tag))).toBe(true);
    expect(result?.tags.every((tag) => ADVICE_VOCABULARY.includes(tag))).toBe(true);
  });

  it("les étiquettes des cinq règles rejoignent le vocabulaire fermé", () => {
    for (const key of RULE_KEYS) for (const tag of ruleOf(key).matchingTags) expect(ADVICE_VOCABULARY).toContain(tag.toLowerCase());
  });
});

describe("jamais un produit voisin rangé à tort", () => {
  const NOT_FOR: [string, (typeof RULE_KEYS)[number]][] = [
    // Chambre d'inhalation
    ["NEBULISEUR PNEUMATIQUE AVEC CHAMBRE DE NEBULISATION", "inhaler-spacer-chamber"],
    ["KIT MASQUE ADULTE AEROSOL CIRRUS", "inhaler-spacer-chamber"],
    ["FFP2 BLANCS SACHET DE 5 MASQUES", "inhaler-spacer-chamber"],
    ["THERMCOOL HOT POCHE BILLE MASQUE", "inhaler-spacer-chamber"],
    ["VENTOLINE 100 µg/dose suspension pour inhalation", "inhaler-spacer-chamber"],
    // Peigne à poux : ni un peigne ordinaire, ni la lotion, ni le coffret, ni le peigne électrique
    ["PEIGNE DEMELANT CHEVEUX LONGS", "head-lice-comb"],
    ["LOTION ANTI-POUX ET LENTES 100 ML", "head-lice-comb"],
    ["COFFRET ANTI-POUX LOTION + PEIGNE", "head-lice-comb"],
    ["PEIGNE ANTI-POUX ELECTRIQUE", "head-lice-comb"],
    // Les coffrets « lotion + peigne » des fichiers de stock, en abrégé
    ["PARANIX Sol antipoux Hle ess Spr/100ml+peigne +peigne anti-poux", "head-lice-comb"],
    ["PARANIX LOT ANTIPOUX 100ML + PEIGNE", "head-lice-comb"],
    ["POUXIT XF LOT 100ML+PEIGNE", "head-lice-comb"],
    ["APAISYL XPERT LOT+PEIGNE POUX", "head-lice-comb"],
    // Collecteur : une boîte d'aiguilles n'est pas une boîte à aiguilles
    ["AIGUILLES STYLO INSULINE 31G 5 MM BOITE DE 100", "self-injection-sharps-container"],
    ["BOITE D'AIGUILLES POUR STYLO", "self-injection-sharps-container"],
    ["SERINGUE INSULINE 1 ML", "self-injection-sharps-container"],
    // Calcium : seul le calcium sert la règle, pas un autre minéral ni un produit qui n'en apporte pas
    ["CITRATE BETAINE/CALCIUM UPSA DOS10", "corticosteroid-oral-calcium"],
    ["FLUORURE DE CALCIUM CRINEX 0,25 mg", "corticosteroid-oral-calcium"],
    ["CHLORURE DE CALCIUM 10 % solution injectable", "corticosteroid-oral-calcium"],
    ["GLUCONATE DE CALCIUM 10 % perfusion", "corticosteroid-oral-calcium"],
    ["FOLINATE DE CALCIUM 50 mg injectable", "corticosteroid-oral-calcium"],
    ["MAGNESIUM MARIN B6 60 CP", "corticosteroid-oral-calcium"],
    ["ZINC 15 MG 60 GELULES", "corticosteroid-oral-calcium"],
    // Sucre rapide : ni glucagon, ni sirop de glucose, ni soluté
    ["GLUCAGEN HYPOKIT 1 MG", "hypoglycemia-fast-sugar"],
    ["SIROP DE GLUCOSE 125 ML", "hypoglycemia-fast-sugar"],
    ["SOLUTE DE GLUCOSE 5 % PERFUSION", "hypoglycemia-fast-sugar"],
    ["ADIARIL SOLUTION DE REHYDRATATION 10 SACHETS", "hypoglycemia-fast-sugar"],
  ];

  it.each(NOT_FOR)("%s ne sert pas la règle %s", (name, ruleKey) => {
    expect(classifyProductByName(name)?.ruleKeys ?? []).not.toContain(ruleKey);
  });

  it("une lotion antipoux reste rangée au rayon saisonnier, sans étiquette de peigne", () => {
    const lotion = classifyProductByName("LOTION ANTI-POUX ET LENTES 100 ML");
    expect(lotion?.category).toBe("SAISONNIER");
    expect(lotion?.tags).not.toContain("peigne anti-poux");
  });

  it("un calcium associé à la vitamine D3 reste rangé en vitamines mais porte l'étiquette « calcium » : c'est ce qui permet à la préférence de la règle de le retenir", () => {
    for (const name of ["Calcium 500 + Vitamine D3", "CALCIUM VITAMINE D3 ARROW 500/400", "CACIT VITAMINE D3 500 mg/440 UI"]) {
      const result = classifyProductByName(name);
      expect(result?.category, name).toBe("VITAMINES");
      expect(result?.tags, name).toContain("calcium");
    }
  });

  it("un calcium rangé comme tel (même avec D3) sert la règle du calcium ; un complément rangé comme vitamine D reste à la règle de la vitamine D", () => {
    const calcium = classifyProductByName("OROCAL D3 500 mg/200 UI comprimé");
    expect(calcium?.category).toBe("MINERAUX");
    expect(calcium?.ruleKeys).toContain("corticosteroid-oral-calcium");
    const vitamin = classifyProductByName("CACIT VITAMINE D3 500 mg/440 UI");
    expect(vitamin?.category).toBe("VITAMINES");
    expect(vitamin?.ruleKeys).toContain("vitamin-d-elderly");
    expect(vitamin?.ruleKeys).not.toContain("corticosteroid-oral-calcium");
  });
});
