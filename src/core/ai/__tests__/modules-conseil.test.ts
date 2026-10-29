import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { productModule, readModules } from "../advice-modules";
import type { DrugKnowledge } from "../types";
import { drug, patient, product } from "./fixtures";

/**
 * Les modules de conseil (fondateur, 29 oct. 2026) : une pharmacie orientée plantes, huiles essentielles ou médicaments
 * conseil voit d'abord, pour chaque conseil, une référence de ses modules — seulement parmi celles déjà admises.
 */

function buildInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  const knowledge = new Map<string, DrugKnowledge | null>([["amoxicilline", drug()]]);
  return {
    lines: [{ lineIndex: 0, drugName: "Amoxicilline", posology: "1 comprimé matin et soir", durationDays: 6, confirmed: true }],
    knowledge,
    patient: patient(),
    catalog: [],
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
    ...overrides,
  };
}

// Deux probiotiques : un complément (code de parapharmacie) un peu plus rentable, et un médicament (code CIP 34009…).
const para = product({ id: "para", name: "FLORE Équilibre gélules", brand: "Vitalys", ean: "3401560000017", purchasePriceCents: 300 });
const medicine = product({ id: "medicament", name: "PROBIOMED gélules", brand: "Labo", ean: "3400936000012", purchasePriceCents: 900 });

describe("modules de conseil", () => {
  it("reconnaît le module d'un produit : huiles essentielles, plantes, médicament conseil, et rien pour le reste", () => {
    expect(productModule({ name: "PRANAROM Aromaforce spray gorge", brand: null, category: "SAISONNIER", ean: "5420008500000" })).toBe("AROMATHERAPIE");
    expect(productModule({ name: "Huile essentielle Ravintsara 10 ml", brand: null, category: "AUTRE", ean: null })).toBe("AROMATHERAPIE");
    expect(productModule({ name: "ARKOGELULES Passiflore", brand: "Arkopharma", category: "PHYTOTHERAPIE", ean: "3578830000000" })).toBe("PHYTOTHERAPIE");
    expect(productModule({ name: "HUMEX toux sèche sirop", brand: null, category: "SAISONNIER", ean: "3400930000000" })).toBe("MEDICAMENT_CONSEIL");
    expect(productModule({ name: "BOIRON Arnica montana 9 CH granules", brand: "Boiron", category: "AUTRE", ean: "3400930000001" })).toBeNull();
    expect(productModule({ name: "CeraVe crème hydratante", brand: "CeraVe", category: "DERMOCOSMETIQUE", ean: "3337875597180" })).toBeNull();
  });

  it("ne garde que les modules connus, sans doublon", () => {
    expect(readModules(["MEDICAMENT_CONSEIL", "PHYTOTHERAPIE", "PHYTOTHERAPIE", "INCONNU", 3])).toEqual(["PHYTOTHERAPIE", "MEDICAMENT_CONSEIL"]);
    expect(readModules("PHYTOTHERAPIE")).toEqual([]);
  });

  it("sans module, le départage habituel (la marge) choisit le complément", () => {
    const result = runAnalysisPipeline(buildInput({ catalog: [medicine, para] }));
    expect(result.recommendations[0]?.productId).toBe("para");
  });

  it("une pharmacie « médicaments conseil » voit d'abord le médicament", () => {
    const result = runAnalysisPipeline(buildInput({ catalog: [medicine, para], adviceModules: ["MEDICAMENT_CONSEIL"] }));
    expect(result.recommendations[0]?.productId).toBe("medicament");
    expect(result.recommendations[0]?.tiebreak).toBe("MODULE");
  });

  it("un module sans produit adapté ne retire pas le conseil", () => {
    const result = runAnalysisPipeline(buildInput({ catalog: [para], adviceModules: ["AROMATHERAPIE"] }));
    expect(result.recommendations[0]?.productId).toBe("para");
  });

  it("le module ne fait jamais entrer un produit hors sujet", () => {
    const offTopic = product({ id: "he", name: "Huile essentielle Lavande 10 ml", brand: "Pranarom", category: "AUTRE", matchingTags: ["sommeil", "relaxation"], ean: "5420008500001" });
    const result = runAnalysisPipeline(buildInput({ catalog: [para, offTopic], adviceModules: ["AROMATHERAPIE"] }));
    expect(result.recommendations.map((item) => item.productId)).not.toContain("he");
  });
});
