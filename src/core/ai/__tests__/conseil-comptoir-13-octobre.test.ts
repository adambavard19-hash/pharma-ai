import { describe, expect, it } from "vitest";
import { MAX_RECOMMENDATIONS_COUNTER_SCAN } from "@/config/constants";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { runAnalysisPipeline } from "../pipeline";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { ADVICE_RULES, AROMATHERAPY_RANGES, DIGESTIVE_ESSENTIAL_OIL, detectAdviceOpportunities } from "../engines/advice";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { treeState } from "../../counter/tree-state";
import type { TreeAnswers } from "../../counter/question-tree";
import { patient, product } from "./fixtures";
import { analyse as analyseScenario } from "./scenarios-conseils";
import type { AnalysisResult, CatalogProduct, PatientContext } from "../types";

/**
 * Retours du pharmacien fondateur du 13 octobre 2026, après des scans réels au comptoir.
 *
 *   1. MÉTOPIMAZINE VIATRIS CONSEIL 7,5 mg + MAALOX (ORD-0334) : deux conseils, tous deux pour la métopimazine (ADIARIL,
 *      AQUASIAL) ; « je veux du conseil sur les deux médicaments », et pour la métopimazine un complexe d'huiles essentielles
 *      digestif et HYDRATIS (mieux margé qu'ADIARIL), pas AQUASIAL (remboursé, marge très faible).
 *   2. DOLIPRANE 500 mg (ORD-0337) : « Douleur localisée » → « Épaule » → aucun conseil. « Sois force de proposition. »
 *
 * Le catalogue reprend les libellés et les prix du stock réel de l'officine de test (export LGPI), lus en base locale.
 */

const cls = (lineIndex: number, substance: string, atcCode: string, therapeuticClass: string, commonSideEffects: string[] = []): DrugClassification => ({
  lineIndex,
  substance,
  atcCode,
  therapeuticClass,
  commonSideEffects,
  confidence: 0.95,
  source: "MODEL",
});

// Une classification du modèle qui dit « phénothiazine » et « sécheresse buccale » : ce qui ouvrait le substitut salivaire.
const METOPIMAZINE = cls(0, "métopimazine", "A04AD05", "Antiémétique neuroleptique (phénothiazine)", ["somnolence", "sécheresse buccale"]);
const MAALOX = cls(1, "hydroxyde d'aluminium + hydroxyde de magnésium", "A02AD01", "Antiacide");
const NAMES = ["METOPIMAZINE VIATRIS CONSEIL 7,5 mg", "MAALOX MAUX D'ESTOMAC 400 mg/400 mg"];

function analyse(drugs: DrugClassification[], names: string[], catalog: CatalogProduct[], who: PatientContext = patient()): AnalysisResult {
  const understanding = deriveUnderstanding({ drugs, patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding }, providerId: "anthropic:test", model: "test" });
  return runAnalysisPipeline({
    maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN,
    lines: drugs.map((drug) => ({ lineIndex: drug.lineIndex, drugName: names[drug.lineIndex], posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(drugs.map((drug) => [names[drug.lineIndex].toLowerCase(), classifiedDrugKnowledge({ key: names[drug.lineIndex].toLowerCase(), drugName: names[drug.lineIndex], form: null, classification: drug, publishedSubstance: drug.substance, model: "test" })])),
    patient: who,
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}

const stocked = (id: string, name: string, overrides: Partial<CatalogProduct>) => {
  const classified = classifyProductByName(name);
  return product({ id, name, brand: null, subCategory: null, commercialClaims: [], description: null, category: classified?.category ?? "AUTRE", matchingTags: classified?.tags ?? [], stockQuantity: 8, ...overrides });
};

// Prix de l'export réel (PA HT, PV TTC, TVA) : HYDRATIS 3,98 € HT de marge, ADIARIL 3,28 €.
const hydratis = stocked("hydratis", "HYDRATIS PECHE PAST EFF 20", { purchasePriceCents: 540, salePriceCents: 990, vatRate: 5.5, stockQuantity: 16 });
const electrolytesEff = stocked("electrolytes-eff", "ELECTROLYTES CPR EFF X20", { category: "NUTRITION", matchingTags: ["réhydratation", "sels minéraux"], purchasePriceCents: 600, salePriceCents: 890, vatRate: 5.5 });
const adiaril = stocked("adiaril", "ADIARIL Pdr sbuv réhydrat 10Sach/7", { purchasePriceCents: 260, salePriceCents: 620, vatRate: 5.5, stockQuantity: 11 });
const aequasyal = stocked("aequasyal", "AEQUASYAL SPRAY BUC FL 40ML T", { purchasePriceCents: 640, salePriceCents: 797, vatRate: 20, stockQuantity: 1, reimbursed: true, reimbursementSource: "export : prestation AAD (LPP)" });
// La faute de l'export réel : « OLISEPTIL ».
const olioseptil = stocked("olioseptil-gastro", "OLISEPTIL GASTRO        GELU 15", { purchasePriceCents: 445, salePriceCents: 830, vatRate: 5.5, stockQuantity: 10 });
const olioseptilBronches = stocked("olioseptil-bronche", "OLIOSEPTIL BRONCHE GELU 15", { purchasePriceCents: 445, salePriceCents: 830, vatRate: 5.5, stockQuantity: 12 });
const tisane = stocked("tisane", "TISANE DIGESTION 20 SACHETS", { matchingTags: ["digestion", "confort digestif"], purchasePriceCents: 220, salePriceCents: 450 });
const gaviscon = stocked("gaviscon", "GAVISCON MENTHE SUSP BUV 24 SACH", { purchasePriceCents: 340, salePriceCents: 590 });
const RAYON = [hydratis, electrolytesEff, adiaril, aequasyal, olioseptil, olioseptilBronches, tisane, gaviscon];

const byKey = (result: AnalysisResult, key: string) => result.recommendations.find((r) => r.opportunityKey === key);
const forLine = (result: AnalysisResult, lineIndex: number) =>
  result.recommendations.filter((r) => result.opportunities.find((o) => o.key === r.opportunityKey)?.triggeredBy.some((t) => t.lineIndex === lineIndex));

describe("les données réelles : classification et étiquettes", () => {
  it("le stock de l'officine : l'OLISEPTIL GASTRO (faute de l'export) est un complexe d'huiles essentielles digestif, pas un conseil de la toux", () => {
    expect(classifyProductByName("OLISEPTIL GASTRO        GELU 15")).toMatchObject({ category: "PHYTOTHERAPIE", tags: ["huiles essentielles", "gastro-intestinal"], ruleKeys: ["nausea-digestive-essential-oils"] });
    expect(classifyProductByName("OLIOSEPTIL GASTRO-INTESTINAL 15 GELULES")?.ruleKeys).toEqual(["nausea-digestive-essential-oils"]);
    expect(classifyProductByName("OLIOSEPTIL BRONCHE GELU 15")?.ruleKeys).toEqual(["cough-bronchial-essential-oils"]);
    expect(classifyProductByName("TISANE DIGESTION 20 SACHETS")?.ruleKeys ?? []).toEqual([]);
    expect(classifyProductByName("CALMOSINE BOISS DIGEST 100ML")?.ruleKeys ?? []).toEqual([]);
  });

  it("la règle s'écrit sans marque : huiles essentielles + sphère digestive, en attente de validation, consigne du fondateur citée", () => {
    const rule = ADVICE_RULES.find((candidate) => candidate.key === "nausea-digestive-essential-oils")!;
    expect(rule.validation.status).toBe("PENDING");
    expect(rule.atcPrefixes).toEqual(["A04AD05"]);
    expect(rule.clinicalContext).toContain("Consigne du pharmacien fondateur, 13 octobre 2026");
    expect(JSON.stringify(rule.matchingTags)).not.toMatch(/olio|oliseptil|hydratis|adiaril/i);
  });

  // Ce qui est vrai, et seulement cela : la RÈGLE ne nomme aucune marque, mais la RECONNAISSANCE du produit dans le stock dépend
  // d'une liste de gammes d'aromathérapie à maintenir (`AROMATHERAPY_RANGES`), faute de composition dans un libellé d'export.
  it("aucune marque dans les étiquettes ni dans les textes de la règle ; les gammes ne vivent que dans la liste à maintenir", () => {
    const rule = ADVICE_RULES.find((candidate) => candidate.key === "nausea-digestive-essential-oils")!;
    const brand = new RegExp(AROMATHERAPY_RANGES.replace(/\|?aromatherap/, ""), "i");
    const said = [rule.title, rule.matchingTags, rule.benefits, rule.shortReasonTemplate, rule.rationaleTemplate, rule.counterScriptTemplate, rule.patientReasonTemplate, rule.clinicalContext, rule.safetyNotes];
    expect(JSON.stringify(said)).not.toMatch(brand);
    expect(JSON.stringify(said)).not.toMatch(/hydratis|adiaril|aquasial/i);
    // Dans le filtre du produit, les noms de gamme viennent tous de la liste, sans copie à part.
    const filter = rule.productExclude!.join(" ");
    expect(filter).toContain(AROMATHERAPY_RANGES);
    expect(filter.split(AROMATHERAPY_RANGES).join("")).not.toMatch(brand);
  });

  it("le vocabulaire reconnaît chaque gamme de la liste, et sans gamme seulement la mention « huiles essentielles »", () => {
    const ranges = ["OLISEPTIL", "OLIOSEPTIL", "AROMAFORCE", "PRANAROM", "PURESSENTIEL", "PHYTOSUN", "ARKOESSENTIEL"];
    for (const range of ranges) {
      expect(classifyProductByName(`${range} GASTRO GELU 15`)?.ruleKeys, range).toEqual(["nausea-digestive-essential-oils"]);
      expect(new RegExp(DIGESTIVE_ESSENTIAL_OIL, "i").test(`${range} GASTRO GELU 15`.toLowerCase()), range).toBe(true);
    }
    expect(classifyProductByName("COMPLEXE HUILES ESSENTIELLES DIGESTION 30 CAPS")?.ruleKeys).toEqual(["nausea-digestive-essential-oils"]);
    // La limite assumée : une gamme hors liste, sans mention d'huiles essentielles, n'est pas reconnue.
    expect(classifyProductByName("ZZGAMME GASTRO GELU 15")?.ruleKeys ?? []).toEqual([]);
  });
});

describe("MÉTOPIMAZINE + MAALOX, au comptoir (trois places)", () => {
  const result = analyse([METOPIMAZINE, MAALOX], NAMES, RAYON);

  it("la métopimazine reçoit le complexe d'huiles essentielles digestif ET la réhydratation", () => {
    expect(byKey(result, "nausea-digestive-essential-oils")?.productId).toBe("olioseptil-gastro");
    expect(byKey(result, "rehydration-digestive")?.productId).toBe("hydratis");
    // Les huiles essentielles des bronches et la tisane ne sont jamais le conseil digestif.
    expect(result.recommendations.map((r) => r.productId)).not.toEqual(expect.arrayContaining(["olioseptil-bronche"]));
    expect(result.recommendations.map((r) => r.productId)).not.toContain("tisane");
  });

  it("HYDRATIS passe devant ADIARIL : comprimés effervescents sous métopimazine, puis la meilleure marge entre comprimés", () => {
    const rehydration = byKey(result, "rehydration-digestive")!;
    expect(rehydration.productId).toBe("hydratis");
    expect(rehydration.alternatives?.map((a) => a.productId)).toEqual(expect.arrayContaining(["adiaril"]));
    // Sans le comprimé effervescent concurrent, c'est la formule de la règle qui tranche face au soluté.
    const seul = byKey(analyse([METOPIMAZINE, MAALOX], NAMES, [hydratis, adiaril, olioseptil]), "rehydration-digestive")!;
    expect(seul).toMatchObject({ productId: "hydratis", tiebreak: "FORMULE" });
    // Entre deux comprimés équivalents, la marge HT départage (3,98 € contre 2,44 €).
    expect(rehydration.tiebreak).toBe("COMMERCIAL");
  });

  it("AQUASIAL (substitut salivaire) n'est plus proposé pour la métopimazine — ni en tête, ni en troisième", () => {
    expect(result.opportunities.some((o) => o.key === "dry-mouth-hygiene")).toBe(false);
    expect(result.recommendations.map((r) => r.productId)).not.toContain("aequasyal");
  });

  it("le MAALOX n'ouvre aucune règle : aucun conseil n'est inventé pour lui, et le rayon antiacide n'est pas proposé", () => {
    expect(forLine(result, 1)).toEqual([]);
    expect(result.opportunities.filter((o) => o.triggeredBy.some((t) => t.lineIndex === 1))).toEqual([]);
    expect(result.recommendations.map((r) => r.productId)).not.toContain("gaviscon");
  });

  it("rien de commercial n'atteint le patient", () => {
    for (const r of result.recommendations) for (const text of [r.patientReason, r.counterScript]) expect(text).not.toMatch(/marge|rembours|€/i);
  });

  it("sous antidépresseur ET métopimazine, la sécheresse buccale reste pour l'antidépresseur : la garde ne vaut que pour la métopimazine", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [
        { lineIndex: 0, drugName: NAMES[0], knowledge: classifiedDrugKnowledge({ key: "m", drugName: NAMES[0], form: null, classification: METOPIMAZINE, publishedSubstance: null, model: "t" }) },
        { lineIndex: 1, drugName: "SERTRALINE 50 mg", knowledge: classifiedDrugKnowledge({ key: "s", drugName: "SERTRALINE 50 mg", form: null, classification: cls(1, "sertraline", "N06AB06", "Antidépresseur ISRS", ["sécheresse buccale"]), publishedSubstance: null, model: "t" }) },
      ],
      patient: patient(),
    });
    const dryMouth = opportunities.find((o) => o.key === "dry-mouth-hygiene");
    expect(dryMouth?.triggeredBy.map((t) => t.lineIndex)).toEqual([1]);
  });
});

describe("les garde-fous des huiles essentielles", () => {
  it("enfant de 4 ans : pas d'huiles essentielles ; la réhydratation passe au vrai soluté, jamais un comprimé effervescent", () => {
    const result = analyse([METOPIMAZINE, MAALOX], NAMES, RAYON, patient({ ageYears: 4 }));
    expect(byKey(result, "nausea-digestive-essential-oils")).toBeUndefined();
    expect(result.opportunities.find((o) => o.key === "nausea-digestive-essential-oils")).toMatchObject({ isBlocked: true });
    expect(byKey(result, "rehydration-digestive")?.productId).toBe("adiaril");
    expect(result.recommendations.map((r) => r.productId)).not.toEqual(expect.arrayContaining(["hydratis"]));
    expect(result.recommendations.map((r) => r.productId)).not.toContain("electrolytes-eff");
  });

  it("femme enceinte : pas d'huiles essentielles, la réhydratation reste proposée", () => {
    const result = analyse([METOPIMAZINE, MAALOX], NAMES, RAYON, patient({ sex: "FEMALE", isPregnant: true }));
    expect(byKey(result, "nausea-digestive-essential-oils")).toBeUndefined();
    expect(result.opportunities.find((o) => o.key === "nausea-digestive-essential-oils")?.blockReason).toMatch(/grossesse/i);
    expect(byKey(result, "rehydration-digestive")).toBeDefined();
  });

  it("allaitement, épilepsie déclarée : pas d'huiles essentielles", () => {
    expect(byKey(analyse([METOPIMAZINE], NAMES, RAYON, patient({ sex: "FEMALE", isBreastfeeding: true })), "nausea-digestive-essential-oils")).toBeUndefined();
    expect(byKey(analyse([METOPIMAZINE], NAMES, RAYON, patient({ chronicConditions: ["épilepsie"] })), "nausea-digestive-essential-oils")).toBeUndefined();
  });

  it("âge inconnu (comptoir sans patient) : proposé, avec les contre-indications sur la carte pour le pharmacien", () => {
    const advice = byKey(analyse([METOPIMAZINE], NAMES, RAYON, patient({ ageYears: null })), "nausea-digestive-essential-oils");
    expect(advice?.productId).toBe("olioseptil-gastro");
    expect(advice?.vigilances?.map((v) => v.population)).toEqual(expect.arrayContaining(["CHILD", "EPILEPSY", "ASTHMA"]));
  });
});

describe("répartition : chaque médicament de la vente a son conseil avant un deuxième pour l'un d'eux", () => {
  const VALACICLOVIR = { name: "Valaciclovir 500", atc: "J05AB11", klass: "Antiviral" };
  const RAMIPRIL = { name: "Ramipril 5", atc: "C09AA05", klass: "Inhibiteur de l'enzyme de conversion" };
  const shelf = [
    stocked("antiseptique", "BISEPTINE SOLUTION 100ML", { category: "SOINS", matchingTags: ["antiseptique", "cutané"] }),
    stocked("lysine", "L-LYSINE 500 MG GELULES", { category: "NUTRITION", matchingTags: ["lysine", "herpès"] }),
    stocked("patch", "PATCH BOUTON DE FIEVRE X15", { category: "SOINS", matchingTags: ["herpès", "bouton de fièvre"] }),
    stocked("tensiometre", "TENSIOMETRE BRAS M3", { category: "DISPOSITIFS_MEDICAUX", matchingTags: ["tensiomètre"] }),
  ];

  it("deux médicaments, chacun ses conseils, trois places : au moins un chacun, l'ordre de la priorité clinique gardé", () => {
    const full = analyseScenario([VALACICLOVIR, RAMIPRIL], shelf, { maxRecommendations: 1000 });
    // Sans répartition, les trois premiers conseils étaient tous pour le valaciclovir.
    expect(full.recommendations.slice(0, 3).map((r) => r.productId)).toEqual(["antiseptique", "lysine", "patch"]);

    const result = analyseScenario([VALACICLOVIR, RAMIPRIL], shelf, { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(result.recommendations.map((r) => r.productId)).toEqual(["antiseptique", "lysine", "tensiometre"]);
    expect(result.trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes).toContain("« hypertension-self-measurement » : gardé pour que chaque médicament de la vente ait son conseil.");
  });

  it("avec une seule place, le conseil le plus prioritaire reste seul : la répartition ne dépasse jamais le plafond", () => {
    const result = analyseScenario([VALACICLOVIR, RAMIPRIL], shelf, { maxRecommendations: 1 });
    expect(result.recommendations.map((r) => r.productId)).toEqual(["antiseptique"]);
  });
});

describe("l'arbre de questions : chaque réponse qui débloque un conseil en montre un quand le stock le permet", () => {
  const DOLIPRANE = { name: "DOLIPRANE 500 mg", atc: "N02BE01", klass: "Antalgique antipyrétique" };
  const pack = (id: string, name: string) => stocked(id, name, { category: "DISPOSITIFS_MEDICAUX", matchingTags: ["chaud froid", "douleur musculaire"], purchasePriceCents: 750, salePriceCents: 1395, vatRate: 20 });
  const backPack = pack("dos", "THERAPEARL DOS    COMP XXX");
  const multiPack = pack("multi", "THERMCOOL HOT POCHE BILLE ARTICUL XXXX");
  const thermometer = stocked("thermo", "EXACTO THERMOMETRE SOUPLE 10 SEC", {});

  /** Ce que le comptoir montre après ces réponses : les conseils visibles de la vente. */
  function shownAfter(result: AnalysisResult, answers: TreeAnswers) {
    const state = treeState({
      opportunities: result.opportunities.map((o) => ({ ruleKey: o.ruleKey ?? o.key, answer: null, triggeredLineIds: o.triggeredBy.map((t) => String(t.lineIndex)) })),
      lineNames: new Map([["0", DOLIPRANE.name]]),
      answers,
    });
    return result.recommendations.filter((r) => state.isVisible(result.opportunities.find((o) => o.key === r.opportunityKey)?.ruleKey ?? r.opportunityKey));
  }

  it("ORD-0337 : DOLIPRANE 500 → « Douleur localisée » → « Épaule », une poche « dos » et une poche multi-zones en rayon : la poche multi-zones", () => {
    const result = analyseScenario([DOLIPRANE], [backPack, multiPack, thermometer], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(shownAfter(result, {})).toEqual([]);
    expect(shownAfter(result, { why: ["PAIN"] })).toEqual([]);
    expect(shownAfter(result, { why: ["PAIN"], where: ["SHOULDER"] }).map((r) => [r.opportunityKey, r.productId])).toEqual([["pain-pack-shoulder", "multi"]]);
    // Le dos garde SA poche ; « ailleurs » la poche multi-zones.
    expect(shownAfter(result, { why: ["PAIN"], where: ["BACK"] }).map((r) => r.productId)).toEqual(["dos"]);
    expect(shownAfter(result, { why: ["PAIN"], where: ["ELSEWHERE"] }).map((r) => r.productId)).toEqual(["multi"]);
  });

  it("chaque zone a son conseil retenu dès le bip, hors du plafond de trois : aucune n'est coupée au profit d'une autre", () => {
    const result = analyseScenario([DOLIPRANE], [backPack, multiPack, thermometer], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    for (const zone of ["back", "neck", "shoulder", "knee", "hip", "ankle", "other"]) expect(byKey(result, `pain-pack-${zone}`), zone).toBeDefined();
    expect(byKey(result, "pain-pack-knee")?.productId).toBe("multi");
  });

  it("la poche de l'épaule abrégée par l'export (« THERA PEARL EPAU/CER ») passe devant la poche multi-zones", () => {
    const shoulder = pack("epaule", "THERA PEARL EPAU/CER COMP29,2X33CM XXX");
    const result = analyseScenario([DOLIPRANE], [backPack, multiPack, shoulder], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(shownAfter(result, { why: ["PAIN"], where: ["SHOULDER"] }).map((r) => r.productId)).toEqual(["epaule"]);
    expect(byKey(result, "pain-pack-back")?.productId).toBe("dos");
    expect(byKey(result, "pain-pack-other")?.productId).toBe("multi");
  });

  it("un masque n'est jamais la poche d'une zone, même sans « oculaire » dans son nom", () => {
    const mask = pack("masque", "THERMCOOL HOT POCHE BILLE MASQUE XXXXX");
    const result = analyseScenario([DOLIPRANE], [mask], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(result.recommendations.map((r) => r.productId)).not.toContain("masque");
  });

  it("« Fièvre » → « pas de thermomètre » : le thermomètre", () => {
    const result = analyseScenario([DOLIPRANE], [backPack, multiPack, thermometer], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(shownAfter(result, { why: ["FEVER"] })).toEqual([]);
    expect(shownAfter(result, { why: ["FEVER"], "fever-thermometer": ["NO"] }).map((r) => r.productId)).toEqual(["thermo"]);
  });

  it("le patch chauffant abrégé par l'export (« Patch chauff cou/dos/épa/poi ») : reconnu, et proposé à « Épaule » et à « Dos »", () => {
    expect(classifyProductByName("THERM-O-HOT Patch chauff cou/dos/épa/poi")?.tags).toEqual(expect.arrayContaining(["chaud froid"]));
    const patch = stocked("patch-chauff", "THERM-O-HOT Patch chauff cou/dos/épa/poi", { purchasePriceCents: 495, salePriceCents: 950, vatRate: 20 });
    const result = analyseScenario([DOLIPRANE], [patch, thermometer], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(shownAfter(result, { why: ["PAIN"], where: ["SHOULDER"] }).map((r) => r.productId)).toEqual(["patch-chauff"]);
    expect(shownAfter(result, { why: ["PAIN"], where: ["BACK"] }).map((r) => r.productId)).toEqual(["patch-chauff"]);
    // Il nomme ses zones : ce n'est pas le produit d'« ailleurs », ni celui du genou.
    expect(shownAfter(result, { why: ["PAIN"], where: ["KNEE"] })).toEqual([]);
  });

  it("aucune poche en rayon : rien n'est inventé pour « Épaule »", () => {
    const result = analyseScenario([DOLIPRANE], [thermometer], { maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN });
    expect(shownAfter(result, { why: ["PAIN"], where: ["SHOULDER"] })).toEqual([]);
  });
});
