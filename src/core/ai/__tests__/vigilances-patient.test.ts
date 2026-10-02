import { describe, expect, it } from "vitest";
import { patientStatus, productPopulationRules, requiresPharmacistValidation, suggestionVigilances, type PopulationVigilanceRule } from "../engines/population-vigilance";
import { CLINICAL_EQUIVALENCE, chooseAmongEquivalents, clinicalScore, shortDateKey } from "../engines/tiebreak";
import { SCORE_WEIGHTS } from "../engines/scoring";
import { VIGILANCE_LEVEL_LABELS, VIGILANCE_POPULATIONS } from "../../../config/vigilances";
import type { ScoredRecommendation } from "../types";
import { patient, product } from "./fixtures";

/**
 * Vigilances patient : la population ne fixe jamais le niveau, le niveau vient
 * de la source ; un patient non concerné ne voit rien ; un patient inconnu ne
 * voit que ce qui demande au moins une validation pharmacien.
 */

const unknown = patient({ patientId: null, ageYears: null, isPregnant: null, isBreastfeeding: null });
const ci = (population: PopulationVigilanceRule["population"], maxAgeYears?: number): PopulationVigilanceRule => ({ population, level: "CONTRAINDICATION", text: `CI ${population}`, sources: ["Source test"], maxAgeYears });

describe("patientStatus", () => {
  it("grossesse, allaitement : la déclaration telle quelle, inconnue si non renseignée", () => {
    expect(patientStatus("PREGNANCY", patient({ isPregnant: true }))).toBe(true);
    expect(patientStatus("PREGNANCY", patient({ isPregnant: false }))).toBe(false);
    expect(patientStatus("PREGNANCY", unknown)).toBeNull();
    expect(patientStatus("BREASTFEEDING", patient({ isBreastfeeding: true }))).toBe(true);
  });
  it("enfant : selon le seuil d'âge de la source (12 ans par défaut), inconnu sans âge", () => {
    expect(patientStatus("CHILD", patient({ ageYears: 8 }))).toBe(true);
    expect(patientStatus("CHILD", patient({ ageYears: 8 }), 6)).toBe(false);
    expect(patientStatus("CHILD", patient({ ageYears: 40 }))).toBe(false);
    expect(patientStatus("CHILD", unknown)).toBeNull();
  });
  it("asthme, épilepsie : vrais s'ils sont déclarés, sinon inconnus (une liste vide n'écarte rien)", () => {
    expect(patientStatus("ASTHMA", patient({ chronicConditions: ["Asthme allergique"] }))).toBe(true);
    expect(patientStatus("EPILEPSY", patient({ chronicConditions: ["antécédent de convulsions"] }))).toBe(true);
    expect(patientStatus("ASTHMA", patient({ chronicConditions: [] }))).toBeNull();
  });
});

describe("suggestionVigilances", () => {
  it("patient concerné : la vigilance s'affiche à son niveau", () => {
    const out = suggestionVigilances([{ population: "CHILD", level: "CAUTION", text: "Pastilles à éviter avant 6 ans.", sources: [], maxAgeYears: 6 }], product(), patient({ ageYears: 4 }));
    expect(out).toEqual([expect.objectContaining({ population: "CHILD", level: "CAUTION", status: true })]);
  });
  it("patient non concerné : rien ne s'affiche", () => {
    expect(suggestionVigilances([ci("PREGNANCY")], product(), patient({ isPregnant: false }))).toEqual([]);
  });
  it("patient inconnu : une contre-indication devient « validation pharmacien », une prudence ne s'affiche pas", () => {
    const out = suggestionVigilances([ci("PREGNANCY"), { population: "CHILD", level: "CAUTION", text: "x", sources: [], maxAgeYears: 6 }], product(), unknown);
    expect(out.map((v) => `${v.population}:${v.level}:${v.status}`)).toEqual(["PREGNANCY:PHARMACIST_VALIDATION:null"]);
  });
  it("garde le niveau le plus fort d'une même population et cumule les sources", () => {
    const out = suggestionVigilances(
      [{ population: "PREGNANCY", level: "CAUTION", text: "prudence", sources: ["A"] }],
      product({ vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION", note: "Contre-indiqué" }] }),
      patient({ isPregnant: true }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ level: "CONTRAINDICATION", origin: "PRODUCT" });
    expect(out[0]?.sources.sort()).toEqual(["A", "Déclaré par la pharmacie"]);
  });
  it("lit les contre-indications saisies sur la fiche produit", () => {
    const rules = productPopulationRules(product({ contraindications: ["Grossesse", "enfant de moins de 6 ans"] }));
    expect(rules.map((r) => `${r.population}:${r.level}`).sort()).toEqual(["CHILD:CONTRAINDICATION", "PREGNANCY:CONTRAINDICATION"]);
  });
  it("une validation pharmacien ou une contre-indication rend la validation obligatoire", () => {
    expect(requiresPharmacistValidation([{ population: "ASTHMA", level: "PHARMACIST_VALIDATION", status: null, text: "", origin: "RULE", sources: [] }])).toBe(true);
    expect(requiresPharmacistValidation([{ population: "CHILD", level: "CAUTION", status: true, text: "", origin: "RULE", sources: [] }])).toBe(false);
    expect(requiresPharmacistValidation(null)).toBe(false);
  });
  it("chaque population et chaque niveau ont un libellé", () => {
    expect(VIGILANCE_POPULATIONS.map((p) => p.label).every(Boolean)).toBe(true);
    expect(Object.values(VIGILANCE_LEVEL_LABELS).every(Boolean)).toBe(true);
  });
});

describe("départage", () => {
  const scored = (id: string, over: Partial<ScoredRecommendation["breakdown"]> = {}, extra: Partial<ScoredRecommendation> = {}): ScoredRecommendation => ({
    opportunityKey: "k",
    productId: id,
    totalScore: 0.8,
    breakdown: { relevance: 0.9, safety: 1, availability: 1, patientFit: 0.85, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.5, ...over },
    justification: "",
    shortReason: "",
    patientReason: "",
    counterScript: "",
    precautions: [],
    explanation: [],
    ...extra,
  });
  const ctx = { formulaRank: () => 0, rangeRank: () => null, shortDate: () => null };

  it("le score clinique ne contient aucune dimension commerciale", () => {
    expect(clinicalScore({ relevance: 1, safety: 1, patientFit: 1, availability: 0, pharmacistPreference: 1, validationHistory: 1, commercial: 1 })).toBeCloseTo(SCORE_WEIGHTS.relevance + SCORE_WEIGHTS.safety + SCORE_WEIGHTS.patientFit);
  });
  it("la meilleure référence clinique gagne même si l'autre a toutes les préférences", () => {
    const decision = chooseAmongEquivalents([scored("prefere", { relevance: 0.8, pharmacistPreference: 1, commercial: 1 }, { totalScore: 0.95 }), scored("clinique")], { ...ctx, rangeRank: (i) => (i.productId === "prefere" ? 1 : null) });
    expect(decision.chosen.productId).toBe("clinique");
    expect(decision.criterion).toBeNull();
  });
  it("une vigilance de plus rend deux références non équivalentes", () => {
    const decision = chooseAmongEquivalents(
      [scored("signale", {}, { vigilances: [{ population: "ASTHMA", level: "PHARMACIST_VALIDATION", status: null, text: "", origin: "RULE", sources: [] }] }), scored("propre")],
      { ...ctx, rangeRank: (i) => (i.productId === "signale" ? 1 : null) },
    );
    expect(decision.chosen.productId).toBe("propre");
  });
  it("l'équivalence est stricte (écart clinique < 2 %)", () => {
    const delta = (CLINICAL_EQUIVALENCE + 0.001) / SCORE_WEIGHTS.relevance;
    const decision = chooseAmongEquivalents([scored("a", { relevance: 0.9 - delta }), scored("b")], { ...ctx, rangeRank: (i) => (i.productId === "a" ? 1 : null) });
    expect(decision.chosen.productId).toBe("b");
  });
  it("une date courte lointaine, trop courte ou périmée ne départage pas", () => {
    expect(shortDateKey({ expiresOn: "2027-06-01", daysLeft: 200, level: "OK" })).toBe(Number.POSITIVE_INFINITY);
    expect(shortDateKey({ expiresOn: "2026-10-05", daysLeft: 3, level: "URGENT" })).toBe(Number.POSITIVE_INFINITY);
    expect(shortDateKey({ expiresOn: "2026-09-01", daysLeft: -30, level: "EXPIRED" })).toBe(Number.POSITIVE_INFINITY);
    expect(shortDateKey({ expiresOn: "2026-11-20", daysLeft: 50, level: "SOON" })).toBe(50);
  });
});
