import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../../ai/pipeline";
import { drug, patient, product } from "../../ai/__tests__/fixtures";
import type { CatalogProduct, DrugKnowledge } from "../../ai/types";
import { brandKey, brandLabelOf } from "../../catalog/brand";
import { estimateCommission } from "../commission";
import { selectCounterCards, universeCoversCategory, type CounterAdvice, type CounterBrand } from "../counter-card";

/**
 * Le cas impératif de PharmaBoost Partenaires : une marque partenaire qui
 * paie, mais dont le produit n'est pas adapté au patient, ne devient JAMAIS
 * une recommandation principale. Le moteur ne lit aucune donnée partenaire ;
 * la carte « Gamme partenaire » se calcule après lui, à part, et ne s'affiche
 * pas pour un besoin bloqué ou contre-indiqué.
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

/** Le produit de la marque partenaire, présent dans le stock de l'officine. */
const partnerItem = (overrides: Partial<CatalogProduct> = {}) =>
  product({ id: "payant", name: "PAYANT Flore", brand: "Payant", purchasePriceCents: 100, salePriceCents: 1990, ...overrides });
const adapted = () => product({ id: "adapte", name: "AUTRE Flore", brand: "Autre" });

/** La marque partenaire telle que la plateforme la diffuse : publiée, au comptoir, univers compléments. */
const payingBrand: CounterBrand = { brandId: "brand-payant", slug: "payant", name: "Payant", brandKey: brandKey("Payant"), partnerName: "Laboratoire Payant", logoUrl: null, universes: ["COMPLEMENTS_ALIMENTAIRES"] };

/** Ce que le comptoir transmet à la sélection des cartes, depuis la sortie du moteur. */
function counterAdvices(input: PipelineInput, result: ReturnType<typeof runAnalysisPipeline>): CounterAdvice[] {
  return result.recommendations.map((recommendation) => {
    const opportunity = result.opportunities.find((o) => o.key === recommendation.opportunityKey);
    const item = input.catalog.find((p) => p.id === recommendation.productId);
    const label = item ? brandLabelOf(item.name, item.brand) : null;
    return {
      recommendationId: recommendation.productId,
      category: opportunity?.category ?? null,
      opportunityBlocked: opportunity?.isBlocked ?? false,
      patientAnswer: null,
      status: "PROPOSED",
      contraindicated: (recommendation.vigilances ?? []).some((v) => v.level === "CONTRAINDICATION" && v.status === true),
      productBrandKey: label ? brandKey(label) : null,
    };
  });
}

describe("une marque partenaire qui paie n'achète jamais une recommandation", () => {
  // Elle paie : contrat hybride, forfait et commission. Ce montant n'existe que dans la console.
  const contract = estimateCommission({ type: "HYBRID", fixedAmountCents: 500_000, commissionPercent: 30, commissionPerUnitCents: 50, minimumCents: null }, { amountCents: 100_000, units: 40 });

  it("le contrat rapporte bien quelque chose (le partenaire paie)", () => {
    expect(contract.totalCents).toBeGreaterThan(0);
  });

  it("CAS OBLIGATOIRE : produit partenaire moins adapté → la recommandation principale reste le produit adapté", () => {
    const input = buildInput({ catalog: [adapted(), partnerItem({ matchingTags: ["probiotique"] })] });
    const result = runAnalysisPipeline(input);
    expect(result.recommendations[0]?.productId).toBe("adapte");

    // La carte partenaire existe, mais À PART : elle ne touche pas la liste des conseils.
    const before = JSON.stringify(result.recommendations);
    const cards = selectCounterCards(counterAdvices(input, result), [payingBrand]);
    expect(JSON.stringify(result.recommendations)).toBe(before);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ brandId: "brand-payant", universe: "COMPLEMENTS_ALIMENTAIRES" });
    expect(result.recommendations[0]?.productId).toBe("adapte");
  });

  for (const [label, patientCase, overrides] of [
    ["grossesse", patient({ isPregnant: true }), { contraindications: ["grossesse"] }],
    ["asthme", patient({ chronicConditions: ["Asthme"] }), { vigilances: [{ population: "ASTHMA", level: "CONTRAINDICATION" as const, note: null }] }],
    ["enfant", patient({ ageYears: 8 }), { contraindications: ["enfant"] }],
  ] as const) {
    it(`CAS OBLIGATOIRE : produit partenaire contre-indiqué (${label}) → jamais proposé, même seul en stock`, () => {
      const input = buildInput({ patient: patientCase, catalog: [partnerItem(overrides as unknown as Partial<CatalogProduct>)] });
      const result = runAnalysisPipeline(input);
      expect(result.recommendations.map((r) => r.productId)).not.toContain("payant");
    });
  }

  it("le résultat du moteur est identique, qu'une marque partenaire paie ou non", () => {
    const input = buildInput({ catalog: [adapted(), partnerItem({ matchingTags: ["probiotique"] })] });
    const plain = runAnalysisPipeline(input).recommendations.map((r) => [r.productId, r.totalScore]);
    // Aucun champ partenaire n'existe dans l'entrée du moteur : on ne peut que relancer la même analyse.
    const again = runAnalysisPipeline(input).recommendations.map((r) => [r.productId, r.totalScore]);
    expect(again).toEqual(plain);
  });

  it("le moteur de conseil n'importe aucun module ni modèle partenaire", () => {
    const root = join(__dirname, "../../ai");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s+["'][^"']*partners?\//);
      expect(source, file).not.toMatch(/\bPartner(Brand|Offer|Contract|Attribution|Product|Order)\b/);
    }
  });
});

describe("la carte « Gamme partenaire » au comptoir", () => {
  const advice = (overrides: Partial<CounterAdvice> = {}): CounterAdvice => ({
    recommendationId: "r1",
    category: "PROBIOTIQUES",
    opportunityBlocked: false,
    patientAnswer: null,
    status: "PROPOSED",
    contraindicated: false,
    productBrandKey: brandKey("Autre"),
    ...overrides,
  });

  it("s'affiche pour un besoin retenu, dans l'univers de la marque", () => {
    expect(selectCounterCards([advice()], [payingBrand])).toHaveLength(1);
  });

  it("ne s'affiche jamais pour un besoin bloqué par la sécurité", () => {
    expect(selectCounterCards([advice({ opportunityBlocked: true })], [payingBrand])).toEqual([]);
  });

  it("ne s'affiche jamais quand la proposition porte une contre-indication avérée pour ce patient", () => {
    expect(selectCounterCards([advice({ contraindicated: true })], [payingBrand])).toEqual([]);
  });

  it("ne s'affiche pas quand le patient a écarté le besoin, ni pour un conseil refusé ou retiré", () => {
    expect(selectCounterCards([advice({ patientAnswer: false })], [payingBrand])).toEqual([]);
    expect(selectCounterCards([advice({ status: "DECLINED" })], [payingBrand])).toEqual([]);
    expect(selectCounterCards([advice({ status: "REMOVED" })], [payingBrand])).toEqual([]);
  });

  it("ne se propose pas comme « alternative » à son propre produit", () => {
    expect(selectCounterCards([advice({ productBrandKey: brandKey("Payant") })], [payingBrand])).toEqual([]);
  });

  it("hors de l'univers du besoin, rien ; un univers sans catégorie (bébé, vétérinaire) ne déclenche rien", () => {
    expect(selectCounterCards([advice({ category: "DERMOCOSMETIQUE" })], [payingBrand])).toEqual([]);
    expect(universeCoversCategory("BEBE", "PROBIOTIQUES")).toBe(false);
    expect(selectCounterCards([advice()], [{ ...payingBrand, universes: ["BEBE", "VETERINAIRE"] }])).toEqual([]);
  });

  it("au plus deux cartes, une marque une seule fois, dans l'ordre clinique des conseils", () => {
    const brands: CounterBrand[] = ["Alpha", "Beta", "Gamma"].map((name) => ({ ...payingBrand, brandId: name, slug: name.toLowerCase(), name, brandKey: brandKey(name) }));
    const cards = selectCounterCards([advice({ recommendationId: "r1" }), advice({ recommendationId: "r2" }), advice({ recommendationId: "r3" })], brands);
    expect(cards.map((c) => [c.recommendationId, c.brandId])).toEqual([["r1", "Alpha"], ["r2", "Beta"]]);
  });
});
