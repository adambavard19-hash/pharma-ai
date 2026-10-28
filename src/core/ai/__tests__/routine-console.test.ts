import { describe, expect, it } from "vitest";
import { buildCustomRule, parseCustomRuleDefinition } from "../central-advice";
import type { CatalogProduct } from "../types";
import { analyse } from "./scenarios-conseils";
import { product } from "./fixtures";

/**
 * Une routine composée dans la console (fondateur, 28 oct. 2026) : une gamme par étape (lavant CeraVe, crème Eucerin, soin
 * La Roche-Posay), et la gamme prioritaire du titulaire qui passe devant la gamme choisie.
 */

const CURACNE = { name: "Curacne 20", atc: "D10BA01", klass: "Rétinoïde oral" };

const definition = {
  title: "Routine acné sous isotrétinoïne",
  kind: "TOLERANCE",
  theme: "Acné",
  atcPrefixes: ["D10BA01"],
  therapeuticClasses: [],
  shortReason: "Isotrétinoïne ({drug}) : la peau devient sèche et fragile.",
  counterScript: "« Pendant {drug}, une routine douce : {product} pour cette étape. »",
  safetyNotes: [],
  routine: {
    steps: [
      { label: "Nettoyer", category: "DERMOCOSMETIQUE", tags: ["nettoyant"], brand: "CeraVe", ean: "3337875597197", productName: "CERAVE GEL MOUSSANT" },
      { label: "Hydrater", category: "DERMOCOSMETIQUE", tags: ["hydratation"], brand: "Eucerin", ean: null, productName: "EUCERIN CREME" },
    ],
  },
};

function shelf(): CatalogProduct[] {
  const item = (id: string, name: string, brand: string, tags: string[], ean: string | null = null) =>
    product({ id, name, brand, ean, category: "DERMOCOSMETIQUE", matchingTags: tags, commercialClaims: [], stockQuantity: 10, purchasePriceCents: 800, salePriceCents: 1500 });
  return [
    item("avene-gel", "AVENE CLEANANCE GEL NETTOYANT", "Avène", ["nettoyant"]),
    item("cerave-gel", "CERAVE GEL MOUSSANT", "CeraVe", ["nettoyant"], "3337875597197"),
    item("avene-creme", "AVENE HYDRANCE CREME", "Avène", ["hydratation"]),
    item("eucerin-creme", "EUCERIN CREME HYDRATANTE", "Eucerin", ["hydratation"]),
  ];
}

function routineRule() {
  const parsed = parseCustomRuleDefinition(definition);
  if (!parsed.ok) throw new Error(parsed.error);
  return buildCustomRule({ ruleKey: "custom-routine", status: "ACTIVE", decidedAt: null, decidedByName: null }, parsed.value);
}

const chosen = (result: ReturnType<typeof analyse>) =>
  result.recommendations.filter((item) => item.routine?.key === "custom-routine").map((item) => [item.routine?.stepLabel, item.productId]);

describe("routine de la console", () => {
  it("garde le thème et les étapes", () => {
    const parsed = parseCustomRuleDefinition(definition);
    expect(parsed.ok && parsed.value.theme).toBe("Acné");
    expect(parsed.ok && parsed.value.routine?.steps.map((step) => step.label)).toEqual(["Nettoyer", "Hydrater"]);
  });

  it("refuse une routine d'une seule étape", () => {
    expect(parseCustomRuleDefinition({ ...definition, routine: { steps: [definition.routine.steps[0]] } }).ok).toBe(false);
  });

  it("prend la gamme choisie à chaque étape, sans chercher une gamme commune", () => {
    const result = analyse([CURACNE], shelf(), { customRules: [routineRule()] });
    expect(chosen(result)).toEqual([
      ["Nettoyer", "cerave-gel"],
      ["Hydrater", "eucerin-creme"],
    ]);
  });

  it("la gamme prioritaire du titulaire passe devant la gamme choisie dans la console", () => {
    const result = analyse([CURACNE], shelf(), {
      customRules: [routineRule()],
      preferredRanges: [{ id: "r1", universe: "DERMOCOSMETIQUE", brandKey: "avene", priority: 1, productIds: [] }],
    });
    expect(chosen(result)).toEqual([
      ["Nettoyer", "avene-gel"],
      ["Hydrater", "avene-creme"],
    ]);
  });
});
