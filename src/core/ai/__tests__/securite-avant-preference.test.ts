import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { SHORT_DATE_MIN_DAYS } from "../engines/tiebreak";
import type { PreferredRangeInput } from "../../catalog/preferred-ranges";
import type { ShortDate } from "../../stock/expiry";
import type { DrugKnowledge } from "../types";
import { drug, patient, product, rule } from "./fixtures";

/**
 * Le cas impératif du lot « gammes, challenges, dates courtes » : une gamme
 * partenaire, une préférence, une date courte ou une marge ne fait JAMAIS
 * favoriser un produit moins adapté, plus signalé ou contre-indiqué. Elles ne
 * départagent que des références cliniquement équivalentes.
 */

function buildInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  const knowledge = new Map<string, DrugKnowledge | null>([["amoxicilline", drug()]]);
  return {
    lines: [{ lineIndex: 0, drugName: "Amoxicilline", posology: "1 comprimé matin et soir", durationDays: 6, confirmed: true }],
    knowledge,
    patient: patient(),
    catalog: [product()],
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
    ...overrides,
  };
}

const partner: PreferredRangeInput = { id: "range-partner", universe: "COMPLEMENTS_ALIMENTAIRES", brandKey: "partenaire", priority: 1, productIds: [] };
const short = (daysLeft: number): ShortDate => ({ expiresOn: "2026-12-01", daysLeft, level: daysLeft < 0 ? "EXPIRED" : daysLeft <= 30 ? "URGENT" : daysLeft <= 90 ? "SOON" : "OK" });

/** Une référence « partenaire » qui cumule tout ce qui est commercial : gamme, préférence, date courte, marge. */
function partnerProduct(overrides: Parameters<typeof product>[0] = {}) {
  return product({ id: "partenaire", name: "PARTENAIRE Flore", brand: "Partenaire", purchasePriceCents: 100, salePriceCents: 1490, shortDate: short(40), ...overrides });
}
const commercialRules = [rule({ id: "pref", type: "PREFER_PRODUCT", productId: "partenaire", weight: 1000 }), rule({ id: "brand", type: "PREFER_BRAND", productId: null, brand: "Partenaire", weight: 1000 })];

describe("sécurité et pertinence avant toute préférence commerciale", () => {
  it("entre deux références équivalentes, la gamme privilégiée départage", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [product({ id: "neutre", name: "AUTRE Flore", brand: "Autre" }), product({ id: "partenaire", name: "PARTENAIRE Flore", brand: "Partenaire" })],
        preferredRanges: [partner],
      }),
    );
    expect(result.recommendations[0]?.productId).toBe("partenaire");
    expect(result.recommendations[0]?.tiebreak).toBe("GAMME_PRIVILEGIEE");
  });

  it("une référence partenaire moins pertinente ne passe jamais devant (gamme, préférence, date courte et marge cumulées)", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [product({ id: "pertinent", name: "AUTRE Flore", brand: "Autre", purchasePriceCents: 1400 }), partnerProduct({ matchingTags: ["probiotique"] })],
        rules: commercialRules,
        preferredRanges: [partner],
      }),
    );
    expect(result.recommendations[0]?.productId).toBe("pertinent");
  });

  it("une référence partenaire plus signalée (précautions) ne passe jamais devant une référence sans précaution", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [product({ id: "propre", name: "AUTRE Flore", brand: "Autre", purchasePriceCents: 1400 }), partnerProduct({ precautions: ["Déconseillé chez l'insuffisant rénal"] })],
        rules: commercialRules,
        preferredRanges: [partner],
      }),
    );
    expect(result.recommendations[0]?.productId).toBe("propre");
  });

  for (const [label, patientCase, overrides] of [
    ["grossesse (contre-indication saisie)", patient({ isPregnant: true }), { contraindications: ["grossesse"] }],
    ["allaitement (contre-indication saisie)", patient({ isBreastfeeding: true }), { contraindications: ["allaitement"] }],
    ["enfant (contre-indication saisie)", patient({ ageYears: 8 }), { contraindications: ["enfant"] }],
    ["asthme (vigilance déclarée par l'officine)", patient({ chronicConditions: ["Asthme"] }), { vigilances: [{ population: "ASTHMA", level: "CONTRAINDICATION" as const, note: null }] }],
    ["allergie", patient({ allergies: ["lactose"] }), { matchingTags: ["probiotique", "flore", "intestinale", "tolérance", "digestive", "lactose"] }],
    ["rupture de stock", patient(), { stockQuantity: 0 }],
  ] as const) {
    it(`une référence partenaire inadaptée (${label}) n'est jamais proposée, même seule`, () => {
      const result = runAnalysisPipeline(
        buildInput({ patient: patientCase, catalog: [partnerProduct(overrides as Parameters<typeof product>[0])], rules: commercialRules, preferredRanges: [partner] }),
      );
      expect(result.recommendations.map((r) => r.productId), label).not.toContain("partenaire");
    });
  }

  it("un challenge laboratoire en cours départage des équivalents — après la date courte, jamais devant la clinique", () => {
    const base = [product({ id: "sans", name: "AUTRE Flore", brand: "Autre" })];
    const pick = (extra: Parameters<typeof product>[0], others = base) => runAnalysisPipeline(buildInput({ catalog: [...others, product(extra)] })).recommendations[0];
    const chosen = pick({ id: "challenge", name: "CHALL Flore", brand: "Chall", activeChallenge: "Challenge probiotiques" });
    expect(chosen?.productId).toBe("challenge");
    expect(chosen?.tiebreak).toBe("CHALLENGE");
    // La date courte passe avant le challenge.
    const both = runAnalysisPipeline(
      buildInput({ catalog: [product({ id: "challenge", name: "CHALL Flore", brand: "Chall", activeChallenge: "Challenge" }), product({ id: "court", name: "COURT Flore", brand: "Court", shortDate: short(40) })] }),
    ).recommendations[0];
    expect(both?.productId).toBe("court");
    // Une référence en rupture, ou qui impose une précaution, ne passe pas devant même avec un challenge.
    expect(pick({ id: "rupture", name: "RUPT Flore", brand: "Rupt", activeChallenge: "Challenge", stockQuantity: 0 })?.productId).toBe("sans");
    expect(pick({ id: "precaution", name: "PREC Flore", brand: "Prec", activeChallenge: "Challenge", precautions: ["Déconseillé chez l'insuffisant rénal"] })?.productId).toBe("sans");
  });

  it("une date courte départage des équivalents, jamais une boîte périmée ou qui périme pendant le traitement", () => {
    const base = [product({ id: "loin", name: "AUTRE Flore", brand: "Autre" })];
    const pick = (shortDate: ShortDate | null) =>
      runAnalysisPipeline(buildInput({ catalog: [...base, product({ id: "court", name: "COURT Flore", brand: "Court", shortDate })] })).recommendations[0];
    expect(pick(short(40))?.productId).toBe("court");
    expect(pick(short(40))?.tiebreak).toBe("DATE_COURTE");
    expect(pick(short(SHORT_DATE_MIN_DAYS - 1))?.tiebreak).not.toBe("DATE_COURTE");
    expect(pick(short(-2))?.tiebreak).not.toBe("DATE_COURTE");
  });

  it("une date courte ne fait pas proposer une référence moins pertinente", () => {
    const result = runAnalysisPipeline(
      buildInput({ catalog: [product({ id: "pertinent", name: "AUTRE Flore", brand: "Autre" }), product({ id: "court", name: "COURT Flore", brand: "Court", matchingTags: ["probiotique"], shortDate: short(20) })] }),
    );
    expect(result.recommendations[0]?.productId).toBe("pertinent");
  });

  it("une gamme privilégiée hors de son univers ne départage rien", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [product({ id: "a", name: "AUTRE Flore", brand: "Autre", purchasePriceCents: 600 }), product({ id: "partenaire", name: "PARTENAIRE Flore", brand: "Partenaire", purchasePriceCents: 1400 })],
        preferredRanges: [{ ...partner, universe: "NUTRITION" }],
      }),
    );
    expect(result.recommendations[0]?.tiebreak).not.toBe("GAMME_PRIVILEGIEE");
  });
});

describe("huiles essentielles : une gamme privilégiée ne lève aucune contre-indication", () => {
  const classify = (substance: string, atc: string, cls: string): DrugClassification => ({ lineIndex: 0, substance, atcCode: atc, therapeuticClass: cls, commonSideEffects: [], confidence: 0.95, source: "MODEL" });
  const toplexil = classify("OXOMEMAZINE", "R06AD08", "Antitussif antihistaminique");
  const oils = product({ id: "oils", name: "OLIOSEPTIL BRONCHE GELU 15", brand: "Olioseptil", category: "PHYTOTHERAPIE", subCategory: null, matchingTags: ["huiles essentielles", "bronches"], commercialClaims: [], stockQuantity: 12, salePriceCents: 990, shortDate: short(40) });
  const base = (p: ReturnType<typeof patient>): PipelineInput => ({
    lines: [{ lineIndex: 0, drugName: "OXOMEMAZINE", posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([["oxomemazine", drug({ name: "OXOMEMAZINE", inn: "OXOMEMAZINE", atcCode: "R06AD08", therapeuticClass: "Antitussif", commonSideEffects: [] })]]),
    patient: p,
    catalog: [oils],
    rules: [rule({ id: "pref", type: "PREFER_PRODUCT", productId: "oils", weight: 1000 })],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding: deriveUnderstanding({ drugs: [toplexil], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" }),
    usedSimulatedProviders: false,
    preferredRanges: [{ id: "r", universe: "COMPLEMENTS_ALIMENTAIRES", brandKey: "olioseptil", priority: 1, productIds: [] }],
  });

  it("jamais proposées à un asthmatique, un épileptique, une femme enceinte ou allaitante, un enfant", () => {
    for (const p of [patient({ chronicConditions: ["Asthme"] }), patient({ chronicConditions: ["Épilepsie"] }), patient({ isPregnant: true }), patient({ isBreastfeeding: true }), patient({ ageYears: 8 })]) {
      expect(runAnalysisPipeline(base(p)).recommendations.map((r) => r.productId)).not.toContain("oils");
    }
  });

  it("sans patient connu : proposées avec une validation pharmacien sur chaque population à vérifier", () => {
    const unknown = patient({ patientId: null, ageYears: null, isPregnant: null, isBreastfeeding: null });
    const recommendation = runAnalysisPipeline(base(unknown)).recommendations.find((r) => r.productId === "oils");
    expect(recommendation).toBeDefined();
    const populations = (recommendation?.vigilances ?? []).map((v) => `${v.population}:${v.level}`);
    expect(populations.sort()).toEqual(["ASTHMA:PHARMACIST_VALIDATION", "BREASTFEEDING:PHARMACIST_VALIDATION", "CHILD:PHARMACIST_VALIDATION", "EPILEPSY:PHARMACIST_VALIDATION", "PREGNANCY:PHARMACIST_VALIDATION"]);
  });

  it("un adulte connu, sans asthme ni épilepsie déclarés : asthme et épilepsie restent à vérifier, grossesse, allaitement et âge ne s'affichent plus", () => {
    const known = patient({ ageYears: 40, isPregnant: false, isBreastfeeding: false });
    const recommendation = runAnalysisPipeline(base(known)).recommendations.find((r) => r.productId === "oils");
    expect((recommendation?.vigilances ?? []).map((v) => v.population).sort()).toEqual(["ASTHMA", "EPILEPSY"]);
  });
});

describe("isolation : les réglages commerciaux d'une officine n'apparaissent pas dans l'analyse d'une autre", () => {
  it("une analyse sans gamme ne porte aucune trace des gammes d'une autre officine", () => {
    const other = runAnalysisPipeline(buildInput({ catalog: [product({ id: "x" })] }));
    expect(JSON.stringify(other)).not.toContain("range-partner");
  });
});
