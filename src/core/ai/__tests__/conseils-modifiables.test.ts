import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { uncoveredDrugs } from "../robot-suggestion";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { classifyNationalDrug, classifyProductByName } from "../../catalog/product-vocabulary";
import { MAX_RECOMMENDATIONS_COUNTER_SCAN } from "@/config/constants";
import { ADVICE_RULES, type AdviceRule } from "../engines/advice";
import { applyRuleEdit, describeCodeExclusions, editContextOf, editValuesOf, exclusionReason, parseRuleEdit, type RuleEditValues } from "../central-advice-edit";
import { NO_EXCLUSIONS } from "../central-advice-edit-constants";
import { buildCustomRule, centralState, customRulesFrom, effectiveCodeRule, overriddenRulesFrom, parseCustomRuleDefinition, readOverride, rowsByKey, type CentralRuleRow } from "../central-advice";
import { patient, product } from "./fixtures";
import type { CatalogProduct, PatientContext } from "../types";

/**
 * MODIFIER un conseil depuis la console (demande du fondateur, 13 oct. 2026) : la modification part dans le moteur de toutes
 * les pharmacies, elle ne passe jamais outre la sécurité, et l'on revient à l'origine d'un clic.
 *
 * Le rayon est construit comme le vrai : chaque référence est rangée par le dictionnaire d'usage (son libellé), jamais
 * étiquetée à la main pour le besoin du test.
 */

const CETIRIZINE: DrugClassification = { lineIndex: 0, substance: "DICHLORHYDRATE DE CÉTIRIZINE", atcCode: "R06AE07", therapeuticClass: "Antihistaminique H1", commonSideEffects: [], confidence: 1, source: "OFFICIAL" };

function para(id: string, name: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const understood = classifyProductByName(name);
  if (!understood) throw new Error(`« ${name} » n'est pas reconnu par le dictionnaire`);
  return product({ id, name, brand: null, ean: "3401000000017", category: understood.category, subCategory: null, description: null, matchingTags: understood.tags, commercialClaims: [], stockQuantity: 6, salePriceCents: 990, purchasePriceCents: 500, vatRate: 20, ...overrides });
}

function boite(id: string, name: string, substances: string[], routes: string[], prescriptionConditions: string[] = []): CatalogProduct {
  const understood = classifyNationalDrug({ name, substances, routes });
  return product({ id: `presentation:${id}`, origin: "NATIONAL_DRUG", presentationId: id, substances, prescriptionConditions, name, brand: null, category: understood?.category ?? "AUTRE", subCategory: null, description: name, commercialClaims: [], matchingTags: [...(understood?.tags ?? []), ...substances, name], salePriceCents: 790, purchasePriceCents: 0, vatRate: 0, stockQuantity: 5 });
}

const nezAllergique = para("nez-allergique", "EAU DE MER NEZ ALLERGIQUE SPRAY 50ML");
const gorge = para("gorge", "COMPRIMES A SUCER GORGE MIEL CITRON X30");
const eauDeMer = para("eau-de-mer", "EAU DE MER ISOTONIQUE SPRAY NASAL 100ML");
const collyre = boite("levo", "OPHTALEVO 0,05 %, collyre en solution en récipient unidose", ["CHLORHYDRATE DE LÉVOCABASTINE"], ["ophtalmique"]);
const RAYON = [nezAllergique, gorge, eauDeMer, collyre];

function inputFor(catalog: CatalogProduct[], options: { patient?: PatientContext; custom?: AdviceRule[] } = {}): PipelineInput {
  const who = options.patient ?? patient();
  const lines = [CETIRIZINE];
  const understanding = deriveUnderstanding({ drugs: lines, patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding }, providerId: "test", model: "test" });
  return {
    maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN,
    lines: lines.map((drug) => ({ lineIndex: drug.lineIndex, drugName: drug.substance!, posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(lines.map((drug) => [drug.substance!.toLowerCase(), classifiedDrugKnowledge({ key: drug.substance!.toLowerCase(), drugName: drug.substance!, form: null, classification: drug, publishedSubstance: drug.substance, model: "test" })])),
    patient: who,
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
    customRules: options.custom,
  };
}

const analyse = (catalog: CatalogProduct[], options: { patient?: PatientContext; custom?: AdviceRule[] } = {}) => runAnalysisPipeline(inputFor(catalog, options));

const cards = (result: ReturnType<typeof analyse>) => Object.fromEntries(result.recommendations.map((r) => [r.opportunityKey, r.productId]));
const proposedEverywhere = (result: ReturnType<typeof analyse>) => result.recommendations.flatMap((r) => [r.productId, ...(r.alternatives ?? []).map((a) => a.productId)]);

const THROAT = ADVICE_RULES.find((rule) => rule.key === "antihistamine-dry-throat")!;
const contextOf = (rule: AdviceRule, previous = NO_EXCLUSIONS) => editContextOf(rule, previous);
const edited = (rule: AdviceRule, change: Partial<RuleEditValues>, revision = 1): AdviceRule => {
  const parsed = parseRuleEdit({ ...editValuesOf(rule), ...change }, contextOf(rule));
  if (!parsed.ok) throw new Error(parsed.error);
  return applyRuleEdit(rule, parsed.value, revision);
};
const row = (overrides: Partial<CentralRuleRow> & { ruleKey: string }): CentralRuleRow => ({ source: "BUILT_IN", status: "ACTIVE", ruleVersion: null, definition: null, decidedAt: null, decidedByName: null, ...overrides });

describe("le formulaire part de la règle telle qu'elle parle", () => {
  it("chacune des règles du moteur, renvoyée telle quelle, passe la vérification (aucune n'est immodifiable)", () => {
    const refused = ADVICE_RULES.map((rule) => ({ key: rule.key, result: parseRuleEdit(editValuesOf(rule), contextOf(rule)) })).filter((entry) => !entry.result.ok);
    expect(refused.map((entry) => `${entry.key} : ${entry.result.ok ? "" : entry.result.error}`)).toEqual([]);
  });
});

describe("les garde-fous de la modification", () => {
  const base = () => editValuesOf(THROAT);
  it("refuse un nom vide, une phrase sans {product}, un code de famille mal écrit, une étiquette inventée, une priorité hors bornes", () => {
    expect(parseRuleEdit({ ...base(), title: " " }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/nom/) });
    expect(parseRuleEdit({ ...base(), counterScript: "Proposez quelque chose pour la gorge." }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/\{product\}/) });
    expect(parseRuleEdit({ ...base(), atcPrefixes: ["R6AE"] }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/code de famille/) });
    expect(parseRuleEdit({ ...base(), matchingTags: ["marque-miracle"] }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/n'existe pas/) });
    expect(parseRuleEdit({ ...base(), matchingTags: [] }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/besoin/) });
    expect(parseRuleEdit({ ...base(), priority: 0 }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/priorité/i) });
    expect(parseRuleEdit({ ...base(), atcPrefixes: [], therapeuticClasses: [] }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/déclenche/) });
    expect(parseRuleEdit({ ...base(), counterScript: "Avec {drug}, {patient} doit prendre {product}." }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/\{patient\}/) });
  });

  it("retirer TOUTES les exclusions posées par la console demande une confirmation explicite", () => {
    const previous = { minAgeYears: 12, pregnancy: true, breastfeeding: false, conditions: [] };
    const none = { ...base(), exclusions: NO_EXCLUSIONS };
    expect(parseRuleEdit(none, contextOf(THROAT, previous))).toMatchObject({ ok: false, needsConfirmation: true });
    expect(parseRuleEdit({ ...none, confirmNoExclusions: true }, contextOf(THROAT, previous)).ok).toBe(true);
    // En retirer une seule, ou n'en avoir jamais eu, ne demande rien.
    expect(parseRuleEdit({ ...base(), exclusions: { ...previous, pregnancy: false } }, contextOf(THROAT, previous)).ok).toBe(true);
    expect(parseRuleEdit(none, contextOf(THROAT)).ok).toBe(true);
  });

  it("un âge minimum s'écrit en années entières", () => {
    expect(parseRuleEdit({ ...base(), exclusions: { ...NO_EXCLUSIONS, minAgeYears: "douze" } }, contextOf(THROAT))).toMatchObject({ ok: false, error: expect.stringMatching(/âge/) });
    const ok = parseRuleEdit({ ...base(), exclusions: { ...NO_EXCLUSIONS, minAgeYears: "12" } }, contextOf(THROAT));
    expect(ok.ok && ok.value.exclusions.minAgeYears).toBe(12);
  });
});

describe("une règle modifiée est appliquée par le moteur, dans toutes les pharmacies", () => {
  it("la phrase du pharmacien modifiée est celle de la carte du comptoir", () => {
    const before = analyse(RAYON).recommendations.find((r) => r.opportunityKey === THROAT.key);
    expect(before?.counterScript).not.toMatch(/phrase de Donna/);
    const rule = edited(THROAT, { counterScript: "Avec {drug}, la gorge sèche est fréquente : {product} l'adoucit (phrase de Donna).", patientReason: "Votre traitement assèche la gorge : ce produit l'adoucit (texte modifié)." });
    const after = analyse(RAYON, { custom: [rule] }).recommendations.find((r) => r.opportunityKey === THROAT.key);
    expect(after?.counterScript).toMatch(/phrase de Donna/);
    expect(after?.counterScript).toMatch(/COMPRIMES A SUCER GORGE/);
    expect(after?.patientReason).toMatch(/texte modifié/);
  });

  it("le besoin modifié est celui que le moteur cherche ; les exclusions du code de la règle restent (un lavage du nez n'est pas un produit pour la gorge)", () => {
    expect(cards(analyse(RAYON))[THROAT.key]).toBe("gorge");
    const rule = edited(THROAT, { matchingTags: ["eau de mer", "nez"] });
    const result = analyse(RAYON, { custom: [rule] });
    expect(result.opportunities.find((o) => o.ruleKey === THROAT.key)?.matchingTags).toEqual(["eau de mer", "nez"]);
    // Les motifs du code (« nasal » écarté pour la gorge) tiennent : rien n'est proposé à tort.
    expect(cards(result)[THROAT.key]).toBeUndefined();
  });

  it("la modification change le produit proposé (citron ↔ adoucissant au miel), pris dans le stock", () => {
    const honey = para("miel-gorge", "MIEL GORGE ADOUCISSANT COMPRIMES A SUCER X20");
    const lemon = para("citron-gorge", "COMPRIMES A SUCER GORGE CITRON X30");
    const preferLemon = edited(THROAT, { matchingTags: ["gorge"], preferWords: ["citron"] });
    expect(cards(analyse([lemon, honey], { custom: [preferLemon] }))[THROAT.key]).toBe("citron-gorge");
    const preferHoney = edited(THROAT, { matchingTags: ["gorge"], preferWords: ["adoucissant"] });
    expect(cards(analyse([lemon, honey], { custom: [preferHoney] }))[THROAT.key]).toBe("miel-gorge");
  });

  it("une règle modifiée REMPLACE la règle d'origine (une seule carte, jamais deux)", () => {
    const rule = edited(THROAT, { title: "Gorge sèche — version modifiée" });
    const result = analyse(RAYON, { custom: [rule] });
    expect(result.opportunities.filter((opportunity) => opportunity.ruleKey === THROAT.key)).toHaveLength(1);
    expect(result.opportunities.find((opportunity) => opportunity.ruleKey === THROAT.key)?.title).toBe("Gorge sèche — version modifiée");
  });

  it("garde-fou : un médicament sur ordonnance n'est JAMAIS proposé, même si la modification vise son besoin", () => {
    const listed = boite("rx", "CORTICOIDE GORGE, comprimé à sucer", ["BÉTAMÉTHASONE"], ["buccale"], ["Liste I"]);
    listed.matchingTags = [...listed.matchingTags, "gorge", "irritation", "miel"];
    listed.category = "SOINS";
    const rule = edited(THROAT, { matchingTags: ["gorge"] });
    expect(proposedEverywhere(analyse([listed, gorge], { custom: [rule] }))).not.toContain("presentation:rx");
    expect(proposedEverywhere(analyse([listed], { custom: [rule] }))).not.toContain("presentation:rx");
  });

  it("garde-fou : les exclusions de la console écartent le conseil (« pas avant 12 ans »), un âge inconnu n'écarte pas", () => {
    const rule = edited(THROAT, { exclusions: { minAgeYears: 12, pregnancy: false, breastfeeding: false, conditions: [] } });
    const child = analyse(RAYON, { custom: [rule], patient: patient({ ageYears: 8 }) });
    expect(child.opportunities.find((o) => o.ruleKey === THROAT.key)?.isBlocked).toBe(true);
    expect(cards(child)[THROAT.key]).toBeUndefined();
    expect(cards(analyse(RAYON, { custom: [rule], patient: patient({ ageYears: null }) }))[THROAT.key]).toBe("gorge");
    expect(exclusionReason({ minAgeYears: null, pregnancy: false, breastfeeding: false, conditions: ["asthme"] }, patient({ chronicConditions: ["Asthme sévère"] }))).toMatch(/asthme/);
  });

  it("garde-fou : les exclusions ÉCRITES DANS LE CODE restent, même si la console n'en pose aucune", () => {
    const magnesium = ADVICE_RULES.find((rule) => rule.key === "magnesium-fatigue")!;
    const rule = edited(magnesium, { exclusions: NO_EXCLUSIONS, title: "Magnésium — modifié" });
    expect(rule.blockedFor?.(patient({ renalImpairment: true }))).toMatch(/rénale/);
    expect(describeCodeExclusions(magnesium).join(" ")).toMatch(/Insuffisance rénale/);
  });
});

describe("toujours proposer quelque chose de similaire : un conseil décrit un besoin, pas une gamme", () => {
  it("une pharmacie SANS la marque préférée reçoit un produit équivalent de son stock ; avec, la marque passe devant", () => {
    const rule = edited(THROAT, { preferWords: ["Marquex"] });
    const marquex = para("marquex", "MARQUEX COMPRIMES A SUCER GORGE MIEL X24");
    expect(cards(analyse(RAYON, { custom: [rule] }))[THROAT.key]).toBe("gorge");
    expect(cards(analyse([...RAYON, marquex], { custom: [rule] }))[THROAT.key]).toBe("marquex");
  });

  it("une pharmacie qui n'a RIEN pour les besoins écrits : le médicament part au robot, qui choisira dans SON stock (jamais « rien » sans avoir cherché)", () => {
    const creme = para("creme-mains", "CREME MAINS NOURRISSANTE 50ML");
    const input = inputFor([creme]);
    const result = runAnalysisPipeline(input);
    expect(result.recommendations).toHaveLength(0);
    expect(uncoveredDrugs(input, result).map((drug) => drug.atcCode)).toEqual(["R06AE07"]);
    // Le stock complet couvre la cétirizine : le robot n'est pas sollicité.
    const full = inputFor(RAYON);
    expect(uncoveredDrugs(full, runAnalysisPipeline(full))).toEqual([]);
  });

  it("un mot préféré ne peut pas devenir un motif : tapé avec des symboles, il se lit tel quel", () => {
    const rule = edited(THROAT, { preferWords: ["mi(el|x)?.*"] });
    expect(rule.productPrefer?.[0]).toBe(String.raw`mi\(el\|x\)\?\.\*`);
  });
});

describe("ce que la base garde, et le retour à l'origine", () => {
  const edit = () => {
    const parsed = parseRuleEdit({ ...editValuesOf(THROAT), title: "Gorge sèche (modifié)" }, contextOf(THROAT));
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  };

  it("une surcharge en base donne la règle modifiée, avec sa propre version ; supprimée, elle ne parle pas", () => {
    const rows = [row({ ruleKey: THROAT.key, override: { edit: edit() }, overrideRevision: 2 })];
    const [rule] = overriddenRulesFrom(rows);
    expect(rule.title).toBe("Gorge sèche (modifié)");
    expect(rule.version).toBe(`${THROAT.version}-modif2`);
    expect(overriddenRulesFrom([row({ ruleKey: THROAT.key, status: "REMOVED", override: { edit: edit() }, overrideRevision: 1 })])).toEqual([]);
  });

  it("une surcharge abîmée est ignorée : la règle du code reprend", () => {
    const broken = row({ ruleKey: THROAT.key, override: { edit: { title: "" } }, overrideRevision: 1 });
    expect(readOverride(broken, THROAT)).toBeNull();
    expect(effectiveCodeRule(THROAT, broken)).toBe(THROAT);
    expect(overriddenRulesFrom([broken])).toEqual([]);
  });

  it("sans surcharge (retour à l'origine), c'est la règle du code ; une validation donnée avant la modification redevient « à relire »", () => {
    expect(effectiveCodeRule(THROAT, row({ ruleKey: THROAT.key }))).toBe(THROAT);
    const validatedBefore = row({ ruleKey: THROAT.key, status: "VALIDATED", ruleVersion: THROAT.version, override: { edit: edit() }, overrideRevision: 1 });
    const rule = effectiveCodeRule(THROAT, validatedBefore);
    expect(centralState(rule, rowsByKey([validatedBefore]))).toEqual({ status: "ACTIVE", outdated: true });
    const validatedAfter = { ...validatedBefore, ruleVersion: rule.version };
    expect(centralState(rule, rowsByKey([validatedAfter]))).toEqual({ status: "VALIDATED", outdated: false });
  });

  it("un conseil ajouté garde ses préférences, ses exclusions et sa priorité", () => {
    const parsed = parseCustomRuleDefinition({
      title: "Gorge sous antihistaminique",
      kind: "COMFORT",
      atcPrefixes: ["R06AE"],
      therapeuticClasses: [],
      category: "SOINS",
      matchingTags: ["gorge"],
      shortReason: "Antihistaminique ({drug}) : la gorge sèche est fréquente.",
      counterScript: "{drug} assèche la gorge : {product} l'adoucit.",
      safetyNotes: [],
      preferWords: ["miel"],
      exclusions: { minAgeYears: 6, pregnancy: false, breastfeeding: false, conditions: [] },
      priority: 40,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rule = buildCustomRule({ ruleKey: "custom-1", status: "ACTIVE", decidedAt: null, decidedByName: null }, parsed.value);
    expect(rule.basePriority).toBe(40);
    expect(rule.productPrefer).toEqual(["miel"]);
    expect(rule.blockedFor?.(patient({ ageYears: 4 }))).toMatch(/6 ans/);
    expect(customRulesFrom([row({ ruleKey: "custom-1", source: "CUSTOM", definition: parsed.value })])).toHaveLength(1);
  });
});
