import { describe, expect, it } from "vitest";
import { evaluateVigilances } from "../engines/vigilance";
import { ADVICE_RULES, isFragileForRehydration } from "../engines/advice";
import { classifyProductByName } from "../../catalog/product-vocabulary";
import { drug, patient } from "./fixtures";

/**
 * Électrolytes de réhydratation : le document « Médicaments et électrolytes »
 * du pharmacien associé, appliqué. Le traitement seul ne vend pas ; les
 * hyperkaliémiants bloquent ; enfants et personnes âgées reçoivent un vrai
 * soluté de réhydratation orale.
 */

function vig(name: string, inn: string | null, atc: string | null) {
  return evaluateVigilances([drug({ name, inn, atcCode: atc, therapeuticClass: null, commonSideEffects: [] })]);
}

const rehydration = ADVICE_RULES.find((rule) => rule.key === "rehydration-digestive")!;

describe("électrolytes — hyperkaliémiants", () => {
  it("IEC, ARA II, épargneur, drospirénone et chlorure de potassium écartent les produits de réhydratation", () => {
    for (const [name, inn, atc] of [
      ["TRIATEC 5", "RAMIPRIL", "C09AA05"],
      ["COZAAR 50", "LOSARTAN", "C09CA01"],
      ["ALDACTONE 25", "SPIRONOLACTONE", "C03DA01"],
      ["SLINDA", "DROSPIRENONE", "G03AC10"],
      ["DIFFU-K 600 mg", "CHLORURE DE POTASSIUM", "A12BA01"],
    ] as const) {
      const hit = vig(name, inn, atc).find((v) => v.key === "potassium-hyperkaliemia");
      expect(hit?.blockTags, name).toEqual(expect.arrayContaining(["potassium", "réhydratation"]));
    }
  });

  it("Hydratis, Hydrafizz, Adiaril et Fanolyte portent l'étiquette réhydratation", () => {
    for (const name of ["HYDRATIS pastilles citron", "HYDRAFIZZ électrolytes", "ADIARIL sachets", "FANOLYTE solution de réhydratation"]) {
      expect(classifyProductByName(name)?.tags, name).toContain("réhydratation");
    }
  });
});

describe("électrolytes — surveillance avant de proposer", () => {
  it("diurétique, SGLT2, lithium, digoxine et IPP mettent la réhydratation en précaution", () => {
    const cases: [string, string, string, string][] = [
      ["LASILIX 40", "FUROSEMIDE", "C03CA01", "loop-thiazide-monitoring"],
      ["DIAMOX 250", "ACETAZOLAMIDE", "S01EC01", "loop-thiazide-monitoring"],
      ["FORXIGA 10", "DAPAGLIFLOZINE", "A10BK01", "sglt2-dehydration"],
      ["TERALITHE 250", "LITHIUM", "N05AN01", "lithium-calcium"],
      ["DIGOXINE NATIVELLE", "DIGOXINE", "C01AA05", "digoxin-antiarrhythmic-electrolytes"],
      ["INEXIUM 20", "ESOMEPRAZOLE", "A02BC05", "ppi-longterm-b12-iron"],
    ];
    for (const [name, inn, atc, key] of cases) {
      const hit = vig(name, inn, atc).find((v) => v.key === key);
      expect(hit?.cautionTags, name).toContain("réhydratation");
      expect(hit?.precautionText, name).toBeTruthy();
    }
  });

  it("clindamycine et colchicine renvoient à un avis médical et ne déclenchent pas le conseil", () => {
    expect(vig("DALACINE 300", "CLINDAMYCINE", "J01FF01").map((v) => v.key)).toContain("clindamycin-diarrhea");
    expect(vig("COLCHICINE OPOCALCIUM", "COLCHICINE", "M04AC01").map((v) => v.key)).toContain("colchicine-gi-overdose");
    expect(rehydration.atcPrefixes.some((prefix) => "J01FF01".startsWith(prefix))).toBe(false);
    expect(rehydration.atcPrefixes.some((prefix) => "M04AC01".startsWith(prefix))).toBe(false);
  });

  it("l'AINS rappelle le risque rénal en cas de pertes hydriques", () => {
    const usage = vig("ADVIL 400", "IBUPROFENE", "M01AE01").find((v) => v.key === "usage-nsaid-with-food");
    expect(usage?.cautionTags).toContain("réhydratation");
    expect(usage?.explanation).toMatch(/rénal/);
  });
});

describe("électrolytes — le conseil lui-même", () => {
  it("se déclenche sur les antidiarrhéiques et les traitements qui provoquent des pertes, toujours avec la question", () => {
    for (const atc of ["A07XA04", "A07DA03", "A07BC05", "A10BJ06", "A10BA02", "J01CR02", "A06AB02"]) {
      expect(rehydration.atcPrefixes.some((prefix) => atc.startsWith(prefix)), atc).toBe(true);
    }
    expect(rehydration.question).toMatch(/réellement/);
    expect(rehydration.safetyNotes.join(" ")).toMatch(/glycémie/);
    expect(rehydration.safetyNotes.join(" ")).toMatch(/2 heures/);
  });

  it("préfère un vrai soluté de réhydratation orale pour l'enfant et la personne âgée, pas pour l'adulte", () => {
    const child = patient({ ageYears: 3 });
    const elderly = patient({ ageYears: 80 });
    const adult = patient({ ageYears: 40 });
    const unknown = patient({ ageYears: null });
    expect(isFragileForRehydration(child)).toBe(true);
    expect(isFragileForRehydration(elderly)).toBe(true);
    expect(isFragileForRehydration(adult)).toBe(false);
    expect(isFragileForRehydration(unknown)).toBe(false);
    expect(rehydration.productPreferFor?.(child)).toContain("adiaril");
    expect(rehydration.productExcludeFor?.(child)).toContain("hydratis");
    expect(rehydration.productPreferFor?.(adult)).toEqual([]);
    expect(rehydration.productExcludeFor?.(adult)).toEqual([]);
  });
});
