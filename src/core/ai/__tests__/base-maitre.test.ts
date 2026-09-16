import { describe, expect, it } from "vitest";
import { baseMaitreCoverage, BASE_MAITRE } from "../engines/base-maitre";
import { VIGILANCE_RULES, evaluateVigilances, VIGILANCE_TAGS } from "../engines/vigilance";
import { ADVICE_VOCABULARY, classifyProductByName } from "../../catalog/product-vocabulary";
import { drug } from "./fixtures";

/**
 * La Base maître V1 du pharmacien associé : cent lignes, cent réponses.
 * Chaque ligne est portée par une règle du moteur ou écartée avec une raison,
 * et les compléments qu'elle nomme sont reconnus dans les noms de produits.
 */

function d(name: string, inn: string | null, atc: string | null) {
  return drug({ name, inn, atcCode: atc, therapeuticClass: null, commonSideEffects: [] });
}

function vig(name: string, inn: string | null, atc: string | null) {
  return evaluateVigilances([d(name, inn, atc)]).filter((v) => v.kind !== "USAGE");
}

describe("Base maître V1 — couverture", () => {
  it("chacune des cent lignes est couverte ou explicitement écartée", () => {
    const rows = baseMaitreCoverage();
    expect(rows).toHaveLength(BASE_MAITRE.total);
    const orphans = rows.filter((row) => row.coveredBy.length === 0 && !row.notIntegrated).map((row) => row.ruleId);
    expect(orphans).toEqual([]);
  });

  it("aucune règle ne cite une ligne inexistante, et chaque règle a une source", () => {
    for (const rule of VIGILANCE_RULES) {
      for (const id of rule.sourceRules ?? []) expect(id).toBeGreaterThanOrEqual(1);
      for (const id of rule.sourceRules ?? []) expect(id).toBeLessThanOrEqual(BASE_MAITRE.total);
      expect(rule.sources.length).toBeGreaterThan(0);
      expect(rule.explanationTemplate).toContain("{drug}");
    }
  });

  it("les étiquettes des vigilances sont dans le vocabulaire fermé et reconnues dans les noms", () => {
    for (const tag of VIGILANCE_TAGS) expect(ADVICE_VOCABULARY).toContain(tag);
    const cases: [string, string][] = [
      ["ARKOGELULES COENZYME Q10 x45", "coenzyme q10"],
      ["LEVURE DE RIZ ROUGE 600 mg 30 gélules", "levure de riz rouge"],
      ["GINKGO BILOBA ARKOPHARMA", "ginkgo"],
      ["OMEGA 3 EPA DHA 1000 mg", "oméga-3"],
      ["GINSENG PANAX 500", "ginseng"],
      ["ECHINACEA ELUSANES", "échinacée"],
      ["THE VERT MINCEUR 60 gélules", "thé vert"],
      ["CURCUMA PIPERINE BIO", "curcuma"],
      ["SUPRADYN INTENSIA 30 cp", "multivitamines"],
      ["VITAMINE K1 ROCHE 2 mg/0,2 ml", "vitamine k"],
      ["VITAMINE B12 GERDA", "vitamine b12"],
      ["ACIDE FOLIQUE CCD 5 mg", "acide folique"],
      ["TOCO 500 mg vitamine E", "vitamine e"],
      ["LAROSCORBINE 1 g vitamine C", "vitamine c"],
      ["CHROME PICOLINATE 200 µg", "chrome"],
      ["IODE FUCUS VESICULOSUS", "iode"],
      ["MAALOX MAUX D'ESTOMAC suspension", "antiacide"],
      ["KAVA 300 mg", "kava"],
      ["REGLISSE 60 gélules", "réglisse"],
      ["BIOTINE BAYER 0,25 %", "biotine"],
    ];
    for (const [name, tag] of cases) expect(classifyProductByName(name)?.tags, name).toContain(tag);
    // Un tube homéopathique n'est pas un complément.
    expect(classifyProductByName("GINSENG 9CH tube granules")?.tags ?? []).not.toContain("ginseng");
  });
});

describe("Base maître V1 — comportement", () => {
  it("AVK : millepertuis et vitamine K écartés, ginkgo et ail en précaution", () => {
    const [avk] = vig("COUMADINE 2 mg", "WARFARINE", "B01AA03");
    expect(avk?.blockTags).toEqual(expect.arrayContaining(["millepertuis", "vitamine k"]));
    expect(avk?.cautionTags).toEqual(expect.arrayContaining(["ginkgo", "ail", "coenzyme q10"]));
  });

  it("statine : levure de riz rouge écartée, CoQ10 en précaution", () => {
    const keys = vig("TAHOR 20 mg", "ATORVASTATINE", "C10AA05");
    const statin = keys.find((v) => v.key === "statin-red-yeast-rice");
    expect(statin?.blockTags).toContain("levure de riz rouge");
    expect(statin?.cautionTags).toContain("coenzyme q10");
    // L'atorvastatine est aussi sensible aux extraits de thé vert.
    expect(keys.map((v) => v.key)).toContain("green-tea-extract-interactions");
  });

  it("hyperkaliémiants : spironolactone, IEC et drospirénone écartent le potassium", () => {
    for (const [name, inn, atc] of [["ALDACTONE", "SPIRONOLACTONE", "C03DA01"], ["TRIATEC", "RAMIPRIL", "C09AA05"], ["JASMINE", "DROSPIRENONE ETHINYLESTRADIOL", "G03AA12"]] as const) {
      const hit = vig(name, inn, atc).find((v) => v.key === "potassium-hyperkaliemia");
      expect(hit?.blockTags, name).toContain("potassium");
    }
  });

  it("diurétique de l'anse : potassium écarté, magnésium et zinc en précaution", () => {
    const [loop] = vig("LASILIX 40", "FUROSEMIDE", "C03CA01");
    expect(loop?.blockTags).toContain("potassium");
    expect(loop?.cautionTags).toEqual(expect.arrayContaining(["magnésium", "zinc"]));
  });

  it("antiépileptique : millepertuis écarté, folates et vitamine D à coordonner", () => {
    const [aed] = vig("TEGRETOL 200", "CARBAMAZEPINE", "N03AF01");
    expect(aed?.key).toBe("antiepileptic-nutrition-and-inducers");
    expect(aed?.blockTags).toContain("millepertuis");
    expect(aed?.cautionTags).toEqual(expect.arrayContaining(["acide folique", "vitamine d", "biotine"]));
    // La gabapentine ajoute l'espacement des antiacides.
    expect(vig("NEURONTIN 300", "GABAPENTINE", "N03AX12").map((v) => v.key)).toEqual(expect.arrayContaining(["antiepileptic-nutrition-and-inducers", "gabapentin-antacid-spacing"]));
  });

  it("traitement anticancéreux : millepertuis et antioxydants écartés", () => {
    const [onco] = vig("XELODA 500", "CAPECITABINE", "L01BC06");
    expect(onco?.key).toBe("anticancer-supplements");
    expect(onco?.blockTags).toEqual(expect.arrayContaining(["millepertuis", "vitamine c", "vitamine e"]));
  });

  it("méthotrexate : folates hors protocole écartés, et risque hépatique signalé", () => {
    const keys = vig("METOJECT 15 mg", "METHOTREXATE", "L04AX03").map((v) => v.key);
    expect(keys).toEqual(expect.arrayContaining(["methotrexate-folate-protocol", "hepatotoxic-drug-supplements"]));
  });

  it("contraception, immunosuppresseur, antidépresseur : millepertuis écarté", () => {
    for (const [name, inn, atc] of [["LEELOO", "LEVONORGESTREL ETHINYLESTRADIOL", "G03AA07"], ["PROGRAF", "TACROLIMUS", "L04AD02"], ["SEROPLEX", "ESCITALOPRAM", "N06AB10"]] as const) {
      const blocks = vig(name, inn, atc).flatMap((v) => v.blockTags);
      expect(blocks, name).toContain("millepertuis");
    }
  });

  it("antidiabétique : chrome et ginseng en précaution ; metformine écarte l'hydraste", () => {
    const results = vig("GLUCOPHAGE 1000", "METFORMINE", "A10BA02");
    expect(results.find((v) => v.key === "antidiabetic-glycemia-supplements")?.cautionTags).toEqual(expect.arrayContaining(["chrome", "ginseng"]));
    expect(results.find((v) => v.key === "metformin-b12")?.blockTags).toContain("hydraste");
  });

  it("lévothyroxine : chrome et biotine rejoignent les précautions", () => {
    const [levo] = vig("LEVOTHYROX 75", "LEVOTHYROXINE", "H03AA01");
    expect(levo?.cautionTags).toEqual(expect.arrayContaining(["chrome", "biotine"]));
  });

  it("antithyroïdien écarte l'iode, sédatif écarte le kava", () => {
    expect(vig("NEOMERCAZOLE 5", "CARBIMAZOLE", "H03BB01")[0]?.blockTags).toContain("iode");
    expect(vig("XANAX 0,25", "ALPRAZOLAM", "N05BA12")[0]?.blockTags).toContain("kava");
  });

  it("le paracétamol n'appelle aucune vigilance de la Base maître", () => {
    expect(vig("DOLIPRANE 1000", "PARACETAMOL", "N02BE01")).toEqual([]);
  });
});
