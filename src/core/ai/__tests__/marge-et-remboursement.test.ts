import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { chooseAmongEquivalents, marginKey } from "../engines/tiebreak";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { patient, product, rule } from "./fixtures";
import type { CatalogProduct, PatientContext, PharmacyRuleInput, ScoredRecommendation } from "../types";

/**
 * La marge et le remboursement au départage (retour du fondateur, 13 oct. 2026) : après une CÉTIRIZINE 10 mg, la
 * troisième proposition était AEQUASYAL spray buccal 40 ml — inscrit à la LPP (code 1100034, prestation AAD), marge
 * quasi nulle — alors qu'une référence non remboursée, plus rentable, répond au même conseil.
 *
 * Ce que ces tests tiennent :
 *   • entre références ÉQUIVALENTES d'un même conseil, une référence remboursée ne passe jamais devant une non
 *     remboursée, et la meilleure marge HT (en euros) l'emporte ;
 *   • une marge inconnue n'est ni favorisée ni pénalisée ;
 *   • la sécurité et la pertinence passent avant : une référence plus signalée ne gagne jamais par sa marge ;
 *   • un conseil dont la seule référence est remboursée reste proposé, en dernier ;
 *   • rien de commercial n'atteint le patient ;
 *   • chaque officine est jugée sur SON stock et SES prix.
 */

const CETIRIZINE: DrugClassification = { lineIndex: 0, substance: "cétirizine", atcCode: "R06AE07", therapeuticClass: "Antihistaminique H1", commonSideEffects: ["somnolence", "sécheresse buccale"], confidence: 0.95, source: "MODEL" };
const DRUG_NAME = "CETIRIZINE BIOGARAN 10 mg";

/** Ce que le rayon bucco-dentaire a en commun : le classement « bouche sèche » du dictionnaire d'usage. */
const dryMouth = { category: "HYGIENE" as const, subCategory: null, matchingTags: ["bouche sèche", "salive", "hygiène bucco-dentaire"], commercialClaims: [], description: null };

/** Les prix lus dans l'export réel de l'officine de test (PA HT 6,40 €, PV TTC 7,97 €, TVA 20 %) : 0,24 € HT de marge. */
const aequasyal = (overrides: Partial<CatalogProduct> = {}) =>
  product({ id: "aequasyal", name: "AEQUASYAL SPRAY BUC FL 40ML T", ean: "3401044533429", ...dryMouth, purchasePriceCents: 640, salePriceCents: 797, vatRate: 20, stockQuantity: 1, reimbursed: true, reimbursementSource: "export : prestation AAD (LPP)", ...overrides });
/** Un substitut salivaire de parapharmacie, non remboursé : 11,90 € TTC pour 6,80 € HT d'achat, soit 3,12 € HT de marge. */
const sprayNonRembourse = (overrides: Partial<CatalogProduct> = {}) =>
  product({ id: "spray-nr", name: "SPRAY BOUCHE SECHE 15ML", ean: "3401578000123", ...dryMouth, purchasePriceCents: 680, salePriceCents: 1190, vatRate: 20, stockQuantity: 2, ...overrides });
const larmes = () => product({ id: "larmes", name: "LARMES ARTIFICIELLES UNIDOSES X30", category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], commercialClaims: [], stockQuantity: 5 });
const sprayNasal = (overrides: Partial<CatalogProduct> = {}) => product({ id: "nasal", name: "PHYSIOMER SPRAY NASAL 135ML", category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "spray nasal", "orl"], commercialClaims: [], stockQuantity: 5, ...overrides });

function analyse(catalog: CatalogProduct[], options: { patient?: PatientContext; rules?: PharmacyRuleInput[] } = {}) {
  const who = options.patient ?? patient();
  const understanding = deriveUnderstanding({ drugs: [CETIRIZINE], patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding }, providerId: "anthropic:test", model: "test" });
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: DRUG_NAME, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[DRUG_NAME.toLowerCase(), classifiedDrugKnowledge({ key: DRUG_NAME.toLowerCase(), drugName: DRUG_NAME, form: null, classification: CETIRIZINE, publishedSubstance: "cétirizine", model: "test" })]]),
    patient: who,
    catalog,
    rules: options.rules ?? [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}

const dryMouthAdvice = (result: ReturnType<typeof analyse>) => result.recommendations.find((r) => r.opportunityKey === "dry-mouth-hygiene");
const notes = (result: ReturnType<typeof analyse>) => result.trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes.join(" ") ?? "";
/** Les montants sont écrits à la française, avec une espace insécable avant « € ». */
const plain = (text: string | undefined) => (text ?? "").replace(/[  ]/g, " ");

describe("le cas réel : CÉTIRIZINE 10 mg, bouche sèche", () => {
  it("le substitut salivaire non remboursé passe devant AEQUASYAL, remboursé", () => {
    const advice = dryMouthAdvice(analyse([aequasyal(), sprayNonRembourse(), larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("spray-nr");
    expect(advice?.tiebreak).toBe("NON_REMBOURSE");
    expect(advice?.marginCents).toBe(312);
    expect(plain(advice?.justification)).toContain("Préférée à 1 référence équivalente remboursée ; marge 3,12 € HT par unité.");
    // AEQUASYAL reste visible, en alternative, pour le pharmacien qui la voudrait.
    expect(advice?.alternatives?.map((a) => a.productId)).toEqual(["aequasyal"]);
  });

  it("sans information de remboursement, la meilleure marge HT l'emporte (3,12 € contre 0,24 €)", () => {
    const advice = dryMouthAdvice(analyse([aequasyal({ reimbursed: null, reimbursementSource: null }), sprayNonRembourse(), larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("spray-nr");
    expect(advice?.tiebreak).toBe("COMMERCIAL");
    expect(plain(advice?.justification)).toContain("Meilleure marge parmi les 2 références équivalentes en stock : 3,12 € HT par unité.");
  });

  it("la marge passe avant la disponibilité : 1 boîte très rentable contre 30 boîtes peu rentables", () => {
    const advice = dryMouthAdvice(analyse([aequasyal({ reimbursed: null, stockQuantity: 30 }), sprayNonRembourse({ stockQuantity: 1 }), larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("spray-nr");
    expect(advice?.tiebreak).toBe("COMMERCIAL");
  });

  it("la marge se calcule hors taxe : un écart de TVA ne fabrique pas de marge", () => {
    // Même prix TTC, même prix d'achat HT : à 5,5 % de TVA la marge HT est plus forte qu'à 20 %.
    const advice = dryMouthAdvice(analyse([aequasyal({ id: "tva20", reimbursed: null, purchasePriceCents: 500, salePriceCents: 1000, vatRate: 20 }), sprayNonRembourse({ id: "tva55", purchasePriceCents: 500, salePriceCents: 1000, vatRate: 5.5 }), larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("tva55");
    expect(advice?.marginCents).toBe(448);
    expect(advice?.alternatives?.[0]).toMatchObject({ productId: "tva20" });
  });

  it("rien de commercial n'atteint le patient : ni marge ni remboursement dans sa fiche ni dans la phrase de comptoir", () => {
    const advice = dryMouthAdvice(analyse([aequasyal(), sprayNonRembourse(), larmes(), sprayNasal()]));
    for (const text of [advice?.patientReason, advice?.counterScript, advice?.shortReason]) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/marge|rembours|€/i);
    }
  });
});

describe("toutes les équivalentes passent au départage, quel que soit leur stock", () => {
  // Autrefois, les candidates d'un conseil étaient triées par stock et coupées à 20 AVANT le score : une équivalente plus
  // rentable, ou non remboursée, mais avec peu de boîtes, n'atteignait jamais le départage (vrai stock local,
  // amoxicilline : LACTIBIANE DLR, 10,43 € HT, 7 boîtes, coupée au profit de LACTIBIANE TOLERANCE, 9,75 € HT, 14 boîtes).
  const rayon = (count: number, overrides: Partial<CatalogProduct> = {}) =>
    Array.from({ length: count }, (_, i) => sprayNonRembourse({ id: `spray-${i + 1}`, ean: `340157800${String(i + 1).padStart(4, "0")}`, stockQuantity: 30, ...overrides }));

  it("24 équivalentes : la plus rentable, avec le stock le plus faible (sous le seuil d'alerte), l'emporte — et la justification compte les 24", () => {
    const rentable = sprayNonRembourse({ id: "spray-rentable", ean: "3401578009999", purchasePriceCents: 500, salePriceCents: 1500, stockQuantity: 2 });
    const advice = dryMouthAdvice(analyse([...rayon(23), rentable, larmes(), sprayNasal()]));
    expect(advice).toMatchObject({ productId: "spray-rentable", tiebreak: "COMMERCIAL", marginCents: 750 });
    expect(plain(advice?.justification)).toContain("Meilleure marge parmi les 24 références équivalentes en stock : 7,50 € HT par unité.");
  });

  it("22 équivalentes remboursées bien fournies et une non remboursée à 1 boîte : la non remboursée l'emporte", () => {
    const remboursees = rayon(22, { reimbursed: true, reimbursementSource: "export : prestation AAD (LPP)" });
    const advice = dryMouthAdvice(analyse([...remboursees, sprayNonRembourse({ id: "spray-nr", stockQuantity: 1 }), larmes(), sprayNasal()]));
    expect(advice).toMatchObject({ productId: "spray-nr", tiebreak: "NON_REMBOURSE" });
    expect(plain(advice?.justification)).toContain("Préférée à 22 références équivalentes remboursées");
  });
});

describe("les autres choix : la clinique d'abord, le remboursement seulement entre équivalentes", () => {
  // Trois non remboursées moins sûres (une précaution) et moins pertinentes (une étiquette de moins) que la remboursée.
  const signalees = [1, 2, 3].map((n) =>
    sprayNonRembourse({ id: `nr-signale-${n}`, name: `BAIN DE BOUCHE ${n}`, ean: `340157800100${n}`, matchingTags: ["bouche sèche", "hygiène bucco-dentaire"], precautions: ["Ne pas avaler. Déconseillé chez l'enfant de moins de 6 ans."], purchasePriceCents: 300, salePriceCents: 600, stockQuantity: 5 }),
  );

  it("AEQUASYAL, remboursé mais plus sûr et plus pertinent, reste le premier autre choix devant des non remboursées signalées", () => {
    const advice = dryMouthAdvice(analyse([sprayNonRembourse({ stockQuantity: 5 }), aequasyal({ stockQuantity: 5 }), ...signalees, larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("spray-nr");
    expect(advice?.alternatives?.map((a) => a.productId)).toEqual(["aequasyal", "nr-signale-1", "nr-signale-2"]);
    expect(advice?.alternatives?.[0]?.breakdown.safety).toBe(1);
  });

  it("entre autres choix cliniquement équivalents, la remboursée passe après la non remboursée, même bien plus fournie", () => {
    const autre = sprayNonRembourse({ id: "spray-nr-2", ean: "3401578000124", purchasePriceCents: 900, stockQuantity: 1 });
    const advice = dryMouthAdvice(analyse([sprayNonRembourse(), aequasyal({ stockQuantity: 40 }), autre, ...signalees, larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("spray-nr");
    expect(advice?.alternatives?.map((a) => a.productId)).toEqual(["spray-nr-2", "aequasyal", "nr-signale-1"]);
  });
});

describe("la sécurité et la pertinence avant la marge", () => {
  it("une référence plus rentable mais plus signalée (une précaution) ne passe pas devant", () => {
    const advice = dryMouthAdvice(analyse([aequasyal(), sprayNonRembourse({ precautions: ["Ne pas utiliser chez l'enfant de moins de 6 ans."] }), larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("aequasyal");
    expect(advice?.tiebreak).toBeNull();
    expect(plain(advice?.justification)).toContain("Référence remboursée : aucune référence équivalente non remboursée en stock pour ce conseil.");
  });

  it("une référence plus rentable mais contre-indiquée chez ce patient est écartée, pas départagée", () => {
    const result = analyse([aequasyal(), sprayNonRembourse({ contraindications: ["grossesse"] }), larmes(), sprayNasal()], { patient: patient({ isPregnant: true }) });
    const advice = dryMouthAdvice(result);
    expect(advice?.productId).toBe("aequasyal");
    expect(result.recommendations.flatMap((r) => [r.productId, ...(r.alternatives ?? []).map((a) => a.productId)])).not.toContain("spray-nr");
  });

  it("une référence moins pertinente (une étiquette de moins) ne gagne pas par sa marge ni parce qu'elle n'est pas remboursée", () => {
    const brosse = product({ id: "brosse", name: "BROSSE A DENTS SOUPLE", category: "HYGIENE", subCategory: null, matchingTags: ["hygiène bucco-dentaire"], commercialClaims: [], description: null, purchasePriceCents: 100, salePriceCents: 900, vatRate: 20, stockQuantity: 30 });
    const advice = dryMouthAdvice(analyse([aequasyal(), brosse, larmes(), sprayNasal()]));
    expect(advice?.productId).toBe("aequasyal");
  });
});

describe("un conseil dont la seule référence est remboursée", () => {
  it("reste proposé, mais passe après les conseils non remboursés (premier retiré par le plafond)", () => {
    // Sans remboursement connu, l'hygiène nasale (priorité 62) passe en tête.
    const before = analyse([sprayNasal(), larmes(), sprayNonRembourse()]);
    expect(before.recommendations[0]?.opportunityKey).toBe("nasal-hygiene-orl");
    const after = analyse([sprayNasal({ reimbursed: true, reimbursementSource: "export : prestation PH7" }), larmes(), sprayNonRembourse()]);
    expect(after.recommendations.map((r) => r.opportunityKey)).toEqual(["eye-irritation-allergy", "dry-mouth-hygiene", "nasal-hygiene-orl"]);
    expect(notes(after)).toContain("« nasal-hygiene-orl » : seule une référence remboursée répond à ce conseil");
  });

  it("une remboursée retenue pour sa formule (préférée par la règle) devant une non remboursée garde sa place, et le pharmacien lit pourquoi", () => {
    // Le cas du comptoir réel : GEL LARMES (remboursé, BDPM) devant un lavage oculaire non remboursé — « larmes » est le
    // premier motif préféré par la règle des yeux irrités, un critère clinique qui passe avant le remboursement.
    const gelLarmes = product({ id: "gel-larmes", name: "GEL LARMES, gel ophtalmique en récipient unidose", category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], commercialClaims: [], stockQuantity: 5, reimbursed: true, reimbursementSource: "BDPM : remboursé à 65 %" });
    const lavage = product({ id: "lavage", name: "SOLUTION LAVAGE OCULAIRE UNIDOSE", category: "SOINS", subCategory: null, matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], commercialClaims: [], stockQuantity: 5 });
    const result = analyse([gelLarmes, lavage, sprayNasal(), sprayNonRembourse()]);
    const eyes = result.recommendations.find((r) => r.opportunityKey === "eye-irritation-allergy");
    expect(eyes).toMatchObject({ productId: "gel-larmes", tiebreak: "FORMULE" });
    expect(eyes?.justification).toContain("Référence remboursée, retenue pour sa formule, préférée par la règle.");
    expect(result.recommendations.map((r) => r.opportunityKey)).toEqual(["nasal-hygiene-orl", "eye-irritation-allergy", "dry-mouth-hygiene"]);
  });

  it("le choix explicite de l'officine (référence privilégiée) l'emporte sur le remboursement, et le pharmacien le lit", () => {
    const advice = dryMouthAdvice(analyse([aequasyal(), sprayNonRembourse(), larmes(), sprayNasal()], { rules: [rule({ id: "pref", type: "PREFER_PRODUCT", productId: "aequasyal", weight: 1 })] }));
    expect(advice?.productId).toBe("aequasyal");
    expect(advice?.tiebreak).toBe("PREFERENCE_OFFICINE");
    expect(advice?.justification).toContain("Référence remboursée, retenue par le choix de l'officine.");
  });
});

describe("marge inconnue : rang neutre", () => {
  const item = (productId: string, marginCents: number | null): ScoredRecommendation => ({
    opportunityKey: "k",
    productId,
    totalScore: 0.9,
    breakdown: { relevance: 0.9, safety: 1, patientFit: 0.85, availability: 1, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.5 },
    justification: "",
    shortReason: "",
    patientReason: "",
    counterScript: "",
    precautions: [],
    explanation: [],
    marginCents,
  });
  const context = { formulaRank: () => 0, rangeRank: () => null, shortDate: () => null };

  it("prend la médiane des marges connues : ni devant la meilleure, ni derrière la plus faible", () => {
    const pool = [item("haute", 300), item("inconnue", null), item("basse", 100)];
    expect(marginKey(pool[1], pool)).toBe(200);
    expect(chooseAmongEquivalents(pool, context)).toMatchObject({ chosen: { productId: "haute" }, criterion: "COMMERCIAL" });
  });

  it("à marge connue égale à la médiane, la marge ne tranche pas", () => {
    const result = chooseAmongEquivalents([item("connue", 24), item("inconnue", null)], context);
    expect(result.criterion).toBeNull();
  });

  it("aucune marge connue : aucun départage commercial, sans rien inventer", () => {
    const result = chooseAmongEquivalents([item("a", null), item("b", null)], context);
    expect(result.criterion).toBeNull();
    expect(result.chosen.productId).toBe("a");
  });

  it("une boîte sans prix de vente garde une marge inconnue (pas de marge négative fabriquée)", () => {
    const advice = dryMouthAdvice(analyse([sprayNonRembourse({ salePriceCents: 0 }), larmes(), sprayNasal()]));
    expect(advice?.marginCents).toBeNull();
    expect(advice?.explanation.find((c) => c.dimension === "commercial")?.detail).toBe("prix de vente non renseigné");
  });
});

describe("isolation : chaque officine sur son stock et ses prix", () => {
  it("deux officines, même ordonnance, analyses entrelacées : chacune garde son choix", () => {
    // A a le substitut non remboursé ; B n'a qu'AEQUASYAL. Les mêmes identifiants n'échangent rien.
    const stockA = [aequasyal(), sprayNonRembourse(), larmes(), sprayNasal()];
    const stockB = [aequasyal(), larmes(), sprayNasal()];
    const a1 = dryMouthAdvice(analyse(stockA));
    const b1 = dryMouthAdvice(analyse(stockB));
    const a2 = dryMouthAdvice(analyse(stockA));
    expect(a1?.productId).toBe("spray-nr");
    expect(b1?.productId).toBe("aequasyal");
    expect(b1?.alternatives ?? []).toEqual([]);
    expect(a2).toEqual(a1);
  });

  it("le même produit, des prix différents d'une officine à l'autre : la marge de chacune décide pour elle", () => {
    const pharmacyA = [aequasyal({ reimbursed: null }), sprayNonRembourse(), larmes(), sprayNasal()];
    // Chez B, le spray est acheté plus cher : sa marge HT (1,22 €) passe sous celle d'AEQUASYAL, négociée (1,64 €).
    const pharmacyB = [aequasyal({ reimbursed: null, purchasePriceCents: 500 }), sprayNonRembourse({ purchasePriceCents: 870 }), larmes(), sprayNasal()];
    expect(dryMouthAdvice(analyse(pharmacyA))?.productId).toBe("spray-nr");
    expect(dryMouthAdvice(analyse(pharmacyB))?.productId).toBe("aequasyal");
  });
});
