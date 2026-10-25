import { describe, expect, it } from "vitest";
import { applyOverstockCampaigns, MAX_OVERSTOCK_ADVICE, type OverstockCampaignRule } from "../engines/overstock";
import { patient, product } from "./fixtures";
import type { ScoredRecommendation } from "../types";

/**
 * Les campagnes de surstock (fondateur, 25 oct. 2026) : le produit que l'officine veut écouler passe en premier, sur les
 * ordonnances choisies et à la place des conseils des familles choisies — jamais au prix de la sécurité du patient.
 */

const immunostim = product({ id: "immuno", name: "IMMUNOSTIM Défenses 30 gélules", category: "VITAMINES", stockQuantity: 36 });
const multivit = product({ id: "multivit", name: "Multivitamines adultes 30 cp", category: "VITAMINES", stockQuantity: 10 });
const levure = product({ id: "levure", name: "ULTRA-LEVURE 200 mg", category: "VITAMINES", stockQuantity: 12 });
const catalog = [immunostim, multivit, levure];

const rec = (productId: string, key: string): ScoredRecommendation => ({
  opportunityKey: key,
  productId,
  totalScore: 0.8,
  breakdown: { relevance: 1, safety: 1, availability: 1, patientFit: 1, pharmacistPreference: 0, validationHistory: 0, commercial: 0 },
  justification: "",
  shortReason: "Raison",
  patientReason: "",
  counterScript: "",
  precautions: [],
  explanation: [],
});

const campaign = (over: Partial<OverstockCampaignRule> = {}): OverstockCampaignRule => ({ id: "c1", productId: "immuno", triggerKeys: ["atc:J01"], replaceProductIds: new Set(["multivit"]), sentence: null, ...over });
const antibiotic = { lineIndex: 0, keys: ["atc:J01"], productId: null };

function run(over: { campaigns?: OverstockCampaignRule[]; lines?: { lineIndex: number; keys: string[]; productId: string | null }[]; recommendations?: ScoredRecommendation[]; blocked?: string[]; stock?: number } = {}) {
  const list = over.stock === undefined ? catalog : [{ ...immunostim, stockQuantity: over.stock }, multivit, levure];
  return applyOverstockCampaigns({
    overstock: { campaigns: over.campaigns ?? [campaign()], lines: over.lines ?? [antibiotic] },
    lines: [{ lineIndex: 0, drugName: "AMOXICILLINE 1 g" }],
    catalog: list,
    blockedProductIds: new Set(over.blocked ?? []),
    recommendations: over.recommendations ?? [rec("levure", "flore")],
    patient: patient(),
    triggeredBy: new Map([["vitamines", [{ lineIndex: 0, drugName: "AMOXICILLINE 1 g" }]]]),
  });
}

describe("une campagne de surstock", () => {
  it("met le produit EN PREMIER sur une ordonnance d'antibiotique, sans retirer les autres conseils", () => {
    const result = run();
    expect(result.recommendations.map((item) => item.productId)).toEqual(["immuno", "levure"]);
    expect(result.recommendations[0]).toMatchObject({ source: "OVERSTOCK", opportunityKey: "surstock:c1", shortReason: "Surstock à écouler en priorité, avec AMOXICILLINE 1 g" });
    expect(result.opportunities[0].triggeredBy).toEqual([{ lineIndex: 0, drugName: "AMOXICILLINE 1 g" }]);
  });

  it("garde le dosage entier dans la raison (« 62,5 mg » n'est pas coupé)", () => {
    const result = applyOverstockCampaigns({
      overstock: { campaigns: [campaign()], lines: [antibiotic] },
      lines: [{ lineIndex: 0, drugName: "AUGMENTIN 500 mg/62,5 mg, comprimé pelliculé" }],
      catalog,
      blockedProductIds: new Set(),
      recommendations: [],
      patient: patient(),
    });
    expect(result.recommendations[0].shortReason).toBe("Surstock à écouler en priorité, avec AUGMENTIN 500 mg/62,5 mg");
  });

  it("prend la place d'un conseil d'une famille choisie, qui reste proposé en repli", () => {
    const result = run({ lines: [], recommendations: [rec("multivit", "vitamines"), rec("levure", "flore")] });
    expect(result.recommendations.map((item) => item.productId)).toEqual(["immuno", "levure"]);
    expect(result.recommendations[0].alternatives?.map((item) => item.productId)).toEqual(["multivit"]);
    expect(result.recommendations[0].shortReason).toContain("à la place de « Multivitamines adultes 30 cp »");
    expect(result.opportunities[0].triggeredBy).toEqual([{ lineIndex: 0, drugName: "AMOXICILLINE 1 g" }]);
  });

  it("déjà conseillé par PharmaBoost : il remonte en tête, sans carte en double", () => {
    const result = run({ recommendations: [rec("levure", "flore"), rec("immuno", "immunite")] });
    expect(result.recommendations.map((item) => item.productId)).toEqual(["immuno", "levure"]);
    expect(result.opportunities).toHaveLength(0);
  });

  it("ne s'applique pas quand rien dans la vente ne l'appelle", () => {
    const result = run({ lines: [] });
    expect(result.recommendations.map((item) => item.productId)).toEqual(["levure"]);
    expect(result.notes).toEqual([]);
  });

  it("ne contourne jamais la sécurité du patient ni le stock : le conseil d'origine reste", () => {
    for (const over of [{ blocked: ["immuno"] }, { stock: 0 }]) {
      const result = run({ ...over, recommendations: [rec("multivit", "vitamines")] });
      expect(result.recommendations.map((item) => item.productId)).toEqual(["multivit"]);
      expect(result.notes[0]).toMatch(/non proposé/);
    }
  });

  it("jamais un produit soumis à prescription, jamais un produit déjà dans la vente", () => {
    const prescribed = applyOverstockCampaigns({
      overstock: { campaigns: [campaign()], lines: [antibiotic] },
      lines: [],
      catalog: [{ ...immunostim, prescriptionConditions: ["Liste I"] }],
      blockedProductIds: new Set(),
      recommendations: [],
      patient: patient(),
    });
    expect(prescribed.recommendations).toEqual([]);
    const inSale = run({ lines: [antibiotic, { lineIndex: 1, keys: [], productId: "immuno" }] });
    expect(inSale.recommendations.map((item) => item.productId)).toEqual(["levure"]);
  });

  it(`au plus ${MAX_OVERSTOCK_ADVICE} produits en surstock par vente`, () => {
    const extra = [product({ id: "p2", name: "Vitamine C 1000", stockQuantity: 20 }), product({ id: "p3", name: "Magnésium B6", stockQuantity: 20 })];
    const result = applyOverstockCampaigns({
      overstock: { campaigns: [campaign(), campaign({ id: "c2", productId: "p2" }), campaign({ id: "c3", productId: "p3" })], lines: [antibiotic] },
      lines: [{ lineIndex: 0, drugName: "AMOXICILLINE 1 g" }],
      catalog: [...catalog, ...extra],
      blockedProductIds: new Set(),
      recommendations: [],
      patient: patient(),
    });
    expect(result.recommendations.map((item) => item.productId)).toEqual(["immuno", "p2"]);
    expect(result.notes.some((note) => note.includes("limite"))).toBe(true);
  });
});
