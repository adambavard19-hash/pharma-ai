import { describe, expect, it } from "vitest";
import { ASSOCIATION_SKIP_LABELS, buildAssociationAdvice, MAX_ASSOCIATION_ADVICE, type ProductAssociationRule } from "../engines/associations";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { patient, product } from "./fixtures";
import type { CatalogProduct } from "../types";

/**
 * Le second axe du conseil : un produit conseil en appelle un autre, sans médicament. Ces tests fixent ce que
 * l'association peut faire — proposer, dans l'ordre du pharmacien, ses mots à lui — et surtout ce qu'elle ne peut
 * jamais contourner : le stock, la sécurité du patient, l'ordonnance, la vente déjà en cours.
 */

const spray = product({ id: "spray", name: "Spray nasal eau de mer", category: "AUTRE", stockQuantity: 12, precautions: [] });
const olioseptil = product({ id: "olio", name: "OLIOSEPTIL BRONCHE", category: "AUTRE", stockQuantity: 5, precautions: ["Ne pas utiliser chez l'enfant de moins de 6 ans."] });
const miel = product({ id: "miel", name: "Sirop au miel", category: "AUTRE", stockQuantity: 8 });
const pastilles = product({ id: "pastilles", name: "Pastilles gorge", category: "AUTRE", stockQuantity: 20 });

const rule = (id: string, trigger: string, advice: string, over: Partial<ProductAssociationRule> = {}): ProductAssociationRule => ({ id, triggerProductId: trigger, adviceProductId: advice, sentence: null, sortOrder: 0, ...over });

function build(over: { rules?: ProductAssociationRule[]; catalog?: CatalogProduct[]; lineProducts?: { lineIndex: number; productId: string }[]; blocked?: string[]; proposed?: string[]; max?: number; patientOver?: Parameters<typeof patient>[0] } = {}) {
  return buildAssociationAdvice({
    association: { rules: over.rules ?? [rule("r1", "spray", "olio")], lineProducts: over.lineProducts ?? [{ lineIndex: 0, productId: "spray" }] },
    lines: [{ lineIndex: 0, drugName: "Spray nasal eau de mer" }],
    catalog: over.catalog ?? [spray, olioseptil, miel, pastilles],
    blockedProductIds: new Set(over.blocked ?? []),
    alreadyProposedProductIds: new Set(over.proposed ?? []),
    patient: patient(over.patientOver),
    max: over.max,
  });
}

describe("une association propose le produit conseillé", () => {
  it("quand son déclencheur est dans la vente, sans aucun médicament", () => {
    const { recommendations, opportunities, skipped } = build();
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({ productId: "olio", source: "ASSOCIATION" });
    expect(opportunities[0]).toMatchObject({ kind: "COMFORT", isBlocked: false, coverage: "COVERED", ruleKey: "association:r1" });
    expect(opportunities[0].triggeredBy).toEqual([{ lineIndex: 0, drugName: "Spray nasal eau de mer" }]);
    expect(recommendations[0].opportunityKey).toBe(opportunities[0].key);
    expect(skipped).toEqual([]);
  });

  it("ne dit rien quand le déclencheur n'est pas dans la vente", () => {
    const { recommendations, skipped, notes } = build({ lineProducts: [] });
    expect(recommendations).toEqual([]);
    expect(skipped).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("n'est pas réciproque : le produit conseillé dans la vente ne rappelle pas le déclencheur", () => {
    const { recommendations } = build({ lineProducts: [{ lineIndex: 0, productId: "olio" }] });
    expect(recommendations).toEqual([]);
  });

  it("dit ce que le pharmacien a écrit, mot pour mot — sans rien ajouter", () => {
    const sentence = "Pour calmer la toux grasse, en complément du lavage du nez.";
    const { recommendations } = build({ rules: [rule("r1", "spray", "olio", { sentence })] });
    expect(recommendations[0].counterScript).toBe(sentence);
    // Aucune allégation produite par PharmaBoost : sans phrase, une formule neutre qui ne dit rien de médical.
    const neutral = build().recommendations[0].counterScript;
    expect(neutral).toBe("Avec « Spray nasal eau de mer », je peux aussi vous proposer « OLIOSEPTIL BRONCHE ».");
    expect(neutral).not.toMatch(/soulage|traite|guérit|efficace|soigne/i);
  });

  it("garde les précautions de la fiche produit et ne les efface jamais", () => {
    expect(build().recommendations[0].precautions).toEqual(["Ne pas utiliser chez l'enfant de moins de 6 ans."]);
  });
});

describe("une association ne contourne aucun garde-fou", () => {
  const cases: [string, Parameters<typeof build>[0], keyof typeof ASSOCIATION_SKIP_LABELS][] = [
    ["la rupture de stock", { catalog: [spray, { ...olioseptil, stockQuantity: 0 }] }, "OUT_OF_STOCK"],
    ["un produit écarté par la sécurité pour ce patient", { blocked: ["olio"] }, "SAFETY"],
    ["un produit absent du catalogue", { catalog: [spray] }, "NOT_IN_CATALOG"],
    ["un produit désactivé", { catalog: [spray, { ...olioseptil, isActive: false }] }, "NOT_IN_CATALOG"],
    ["un médicament à prescription obligatoire", { catalog: [spray, { ...olioseptil, prescriptionConditions: ["liste I"] }] }, "PRESCRIPTION_ONLY"],
    ["un produit du catalogue national (jamais une vente additionnelle d'office)", { catalog: [spray, { ...olioseptil, origin: "NATIONAL_DRUG" }] }, "NOT_IN_CATALOG"],
    ["un produit déjà dans la vente", { lineProducts: [{ lineIndex: 0, productId: "spray" }, { lineIndex: 1, productId: "olio" }] }, "ALREADY_IN_SALE"],
    ["un produit que le moteur propose déjà", { proposed: ["olio"] }, "ALREADY_PROPOSED"],
  ];
  for (const [label, over, reason] of cases) {
    it(`respecte ${label} : rien n'est proposé, la raison est tracée`, () => {
      const { recommendations, skipped, notes } = build(over);
      expect(recommendations).toEqual([]);
      expect(skipped).toEqual([{ ruleId: "r1", reason }]);
      expect(notes.join(" ")).toContain(ASSOCIATION_SKIP_LABELS[reason]);
    });
  }

  it("respecte une contre-indication déclarée sur la fiche produit pour une patiente enceinte (via le moteur de sécurité)", () => {
    // Le moteur de sécurité place le produit dans `blockedProductIds` ; l'association ne peut pas le ressortir.
    const { recommendations } = build({ blocked: ["olio"], patientOver: { isPregnant: true } });
    expect(recommendations).toEqual([]);
  });
});

describe("plusieurs associations", () => {
  it("ne propose qu'une carte par produit conseillé, avec tous ses déclencheurs", () => {
    const { recommendations, opportunities } = build({
      rules: [rule("r1", "spray", "olio"), rule("r2", "miel", "olio")],
      lineProducts: [{ lineIndex: 0, productId: "spray" }, { lineIndex: 1, productId: "miel" }],
      catalog: [spray, olioseptil, miel],
    });
    expect(recommendations).toHaveLength(1);
    expect(opportunities[0].triggeredBy.map((trigger) => trigger.lineIndex)).toEqual([0, 1]);
    expect(recommendations[0].shortReason).toContain("et");
  });

  it("respecte l'ordre choisi par le pharmacien, puis la limite par vente", () => {
    const rules = [rule("r3", "spray", "pastilles", { sortOrder: 3 }), rule("r1", "spray", "olio", { sortOrder: 1 }), rule("r2", "spray", "miel", { sortOrder: 2 })];
    const full = build({ rules });
    expect(full.recommendations.map((r) => r.productId)).toEqual(["olio", "miel", "pastilles"]);
    const limited = build({ rules, max: 2 });
    expect(limited.recommendations.map((r) => r.productId)).toEqual(["olio", "miel"]);
    expect(limited.skipped).toEqual([{ ruleId: "r3", reason: "LIMIT" }]);
    expect(MAX_ASSOCIATION_ADVICE).toBe(3);
  });

  it("classe les cartes dans l'ordre : la première association garde le meilleur score", () => {
    const { recommendations } = build({ rules: [rule("r1", "spray", "olio", { sortOrder: 1 }), rule("r2", "spray", "miel", { sortOrder: 2 })] });
    expect(recommendations[0].totalScore).toBeGreaterThan(recommendations[1].totalScore);
  });
});

describe("dans la pipeline complète", () => {
  function input(over: Partial<PipelineInput> = {}): PipelineInput {
    return {
      lines: [{ lineIndex: 0, drugName: "Spray nasal eau de mer", posology: null, durationDays: null, confirmed: true }],
      knowledge: new Map(),
      patient: patient({ patientId: null }),
      catalog: [spray, olioseptil],
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      usedSimulatedProviders: false,
      ...over,
    };
  }

  it("une vente spontanée d'un produit conseil propose le suivant : la vente est un conseil, l'issue le dit", () => {
    const result = runAnalysisPipeline(input({ associations: { rules: [rule("r1", "spray", "olio")], lineProducts: [{ lineIndex: 0, productId: "spray" }] } }));
    expect(result.recommendations.map((r) => [r.productId, r.source])).toEqual([["olio", "ASSOCIATION"]]);
    expect(result.outcome).toBe("PROPOSALS");
    expect(result.opportunities.some((o) => o.ruleKey === "association:r1")).toBe(true);
    const stages = result.trace.map((stage) => stage.stage);
    expect(stages[stages.length - 1]).toBe("PRODUCT_ASSOCIATIONS");
    expect(stages[stages.length - 2]).toBe("COMMERCIAL_OPTIMIZATION");
  });

  it("sans association, la trace et le résultat sont inchangés", () => {
    const without = runAnalysisPipeline(input());
    expect(without.recommendations).toEqual([]);
    expect(without.trace.map((stage) => stage.stage)).not.toContain("PRODUCT_ASSOCIATIONS");
    expect(without.outcome).toBe("NO_RELEVANT_NEED");
    const empty = runAnalysisPipeline(input({ associations: { rules: [], lineProducts: [] } }));
    expect(empty.trace.map((stage) => stage.stage)).not.toContain("PRODUCT_ASSOCIATIONS");
  });

  it("le moteur de sécurité du patient écarte le produit conseillé : l'association ne le ressort pas", () => {
    // Fiche produit : contre-indiqué à la femme enceinte (vigilance déclarée par l'officine).
    const risky = { ...olioseptil, vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION" as const, note: null }] };
    const result = runAnalysisPipeline(
      input({ catalog: [spray, risky], patient: patient({ patientId: "p1", isPregnant: true }), associations: { rules: [rule("r1", "spray", "olio")], lineProducts: [{ lineIndex: 0, productId: "spray" }] } }),
    );
    expect(result.recommendations).toEqual([]);
    const stage = result.trace.find((entry) => entry.stage === "PRODUCT_ASSOCIATIONS");
    expect(stage?.notes.join(" ")).toContain("écarté par la sécurité");
  });

  it("le même produit n'est pas proposé deux fois : ni par le moteur, ni par une association", () => {
    const base = input({ associations: { rules: [rule("r1", "spray", "olio")], lineProducts: [{ lineIndex: 0, productId: "spray" }] } });
    const once = runAnalysisPipeline(base);
    expect(once.recommendations.filter((r) => r.productId === "olio")).toHaveLength(1);
  });
});
