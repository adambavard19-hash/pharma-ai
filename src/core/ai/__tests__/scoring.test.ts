import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_MAX_WEIGHT,
  SCORE_WEIGHTS,
  computeTotalScore,
  scoreProductForOpportunity,
} from "../engines/scoring";
import {
  ADVICE_RULES,
  PRIORITY_CEILING,
  PRIORITY_FLOOR,
  detectAdviceOpportunities,
} from "../engines/advice";
import { drug, patient, product, rule } from "./fixtures";
import type { AdviceOpportunityResult, ScoreBreakdown } from "../types";

function opportunity(
  overrides: Partial<AdviceOpportunityResult> = {},
): AdviceOpportunityResult {
  return {
    key: "digestive-tolerance-antibiotics",
    kind: "TOLERANCE",
    category: "PROBIOTIQUES",
    title: "Tolérance digestive pendant l'antibiothérapie",
    rationale: "…",
    clinicalContext: null,
    safetyNotes: [],
    priority: 72,
    isBlocked: false,
    blockReason: null,
    matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"],
    excludeTags: [],
    triggeredBy: [{ lineIndex: 0, drugName: "Amoxicilline" }],
    ...overrides,
  };
}

const baseArgs = {
  opportunity: opportunity(),
  patient: patient(),
  rules: [],
  history: {},
  blockedProductIds: new Set<string>(),
};

describe("hiérarchie des dimensions du score", () => {
  it("place la pertinence et la sécurité au-dessus de tout le reste", () => {
    expect(SCORE_WEIGHTS.relevance).toBeGreaterThan(SCORE_WEIGHTS.patientFit);
    expect(SCORE_WEIGHTS.safety).toBeGreaterThan(SCORE_WEIGHTS.availability);
    expect(SCORE_WEIGHTS.patientFit).toBeGreaterThan(SCORE_WEIGHTS.availability);
    expect(SCORE_WEIGHTS.availability).toBeGreaterThan(SCORE_WEIGHTS.pharmacistPreference);
    expect(SCORE_WEIGHTS.pharmacistPreference).toBeGreaterThan(
      SCORE_WEIGHTS.validationHistory,
    );
    expect(SCORE_WEIGHTS.validationHistory).toBeGreaterThan(SCORE_WEIGHTS.commercial);
  });

  it("plafonne strictement l'influence commerciale", () => {
    expect(SCORE_WEIGHTS.commercial).toBeLessThanOrEqual(COMMERCIAL_MAX_WEIGHT);
  });

  it("somme les poids à 1", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("annulation par la sécurité", () => {
  it("annule le score total lorsque la sécurité est nulle", () => {
    const breakdown: ScoreBreakdown = {
      relevance: 1,
      safety: 0,
      patientFit: 1,
      availability: 1,
      pharmacistPreference: 1,
      validationHistory: 1,
      commercial: 1,
    };
    expect(computeTotalScore(breakdown)).toBe(0);
  });

  it("annule le score total lorsque l'adéquation patient est nulle", () => {
    const breakdown: ScoreBreakdown = {
      relevance: 1,
      safety: 1,
      patientFit: 0,
      availability: 1,
      pharmacistPreference: 1,
      validationHistory: 1,
      commercial: 1,
    };
    expect(computeTotalScore(breakdown)).toBe(0);
  });

  it("écarte totalement un produit bloqué par le moteur de sécurité", () => {
    const result = scoreProductForOpportunity({
      ...baseArgs,
      product: product({ id: "blocked" }),
      blockedProductIds: new Set(["blocked"]),
    });
    expect(result).toBeNull();
  });

  it("écarte un produit exclu par une règle de l'officine", () => {
    const result = scoreProductForOpportunity({
      ...baseArgs,
      product: product({ id: "excluded" }),
      rules: [rule({ type: "EXCLUDE_PRODUCT", productId: "excluded" })],
    });
    expect(result).toBeNull();
  });
});

describe("séparation médical / commercial", () => {
  /**
   * Garde-fou central du produit : une marge très supérieure ne doit jamais
   * suffire à faire passer devant une référence moins pertinente.
   */
  it("ne laisse pas une marge élevée renverser un écart de pertinence", () => {
    const relevant = scoreProductForOpportunity({
      ...baseArgs,
      // Produit très pertinent, marge quasi nulle.
      product: product({
        id: "relevant",
        matchingTags: ["probiotique", "flore", "intestinale", "tolérance", "digestive"],
        purchasePriceCents: 1400,
        salePriceCents: 1490,
      }),
    });

    const profitable = scoreProductForOpportunity({
      ...baseArgs,
      // Produit peu pertinent, marge maximale.
      product: product({
        id: "profitable",
        category: "AUTRE",
        matchingTags: ["autre"],
        purchasePriceCents: 100,
        salePriceCents: 4900,
      }),
    });

    expect(relevant).not.toBeNull();
    expect(profitable).not.toBeNull();
    expect(relevant!.totalScore).toBeGreaterThan(profitable!.totalScore);
  });

  it("ne laisse pas la marge compenser une rupture de stock", () => {
    const inStock = scoreProductForOpportunity({
      ...baseArgs,
      product: product({ id: "in-stock", stockQuantity: 30, salePriceCents: 1000, purchasePriceCents: 900 }),
    });

    const outOfStockButProfitable = scoreProductForOpportunity({
      ...baseArgs,
      product: product({
        id: "out",
        stockQuantity: 0,
        availableInSiblingPharmacy: false,
        salePriceCents: 4900,
        purchasePriceCents: 100,
      }),
    });

    expect(inStock!.totalScore).toBeGreaterThan(outOfStockButProfitable!.totalScore);
  });

  it("expose chaque contribution, sans boîte noire", () => {
    const result = scoreProductForOpportunity({ ...baseArgs, product: product() });

    expect(result).not.toBeNull();
    expect(result!.explanation).toHaveLength(Object.keys(SCORE_WEIGHTS).length);
    for (const contribution of result!.explanation) {
      expect(contribution.detail.length).toBeGreaterThan(0);
      expect(contribution.label.length).toBeGreaterThan(0);
    }
  });

  it("fait remonter une référence privilégiée par l'officine, à pertinence égale", () => {
    const neutral = scoreProductForOpportunity({
      ...baseArgs,
      product: product({ id: "neutral" }),
    });
    const preferred = scoreProductForOpportunity({
      ...baseArgs,
      product: product({ id: "preferred" }),
      rules: [rule({ type: "PREFER_PRODUCT", productId: "preferred" })],
    });

    expect(preferred!.totalScore).toBeGreaterThan(neutral!.totalScore);
  });
});

describe("moteur d'opportunités", () => {
  it("n'applique pas mécaniquement « antibiotique = probiotique »", () => {
    // Un antalgique seul ne déclenche aucune opportunité de tolérance digestive.
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Paracétamol",
          knowledge: drug({
            name: "Paracétamol",
            atcCode: "N02BE01",
            therapeuticClass: "Antalgique et antipyrétique",
            commonSideEffects: [],
          }),
        },
      ],
      patient: patient(),
    });

    expect(
      opportunities.some((o) => o.key === "digestive-tolerance-antibiotics"),
    ).toBe(false);
  });

  it("ne déclenche rien pour un médicament absent du référentiel", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "Inconnu", knowledge: null }],
      patient: patient(),
    });
    expect(opportunities).toHaveLength(0);
  });

  it("priorise un conseil de sécurité au-dessus d'un conseil de confort", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Doxycycline",
          knowledge: drug({
            name: "Doxycycline",
            atcCode: "J01AA02",
            therapeuticClass: "Antibiotique de la famille des cyclines",
            commonSideEffects: ["photosensibilisation", "troubles digestifs"],
          }),
        },
      ],
      patient: patient(),
    });

    const photo = opportunities.find((o) => o.key === "sun-photosensitivity");
    const digestive = opportunities.find((o) => o.key === "digestive-tolerance-antibiotics");

    expect(photo).toBeDefined();
    expect(digestive).toBeDefined();
    expect(photo!.kind).toBe("SAFETY");
    expect(photo!.priority).toBeGreaterThan(digestive!.priority);
    // La garantie est structurelle : elle vaut pour TOUTE règle, pas seulement
    // pour ce couple-ci.
    expect(opportunities[0].key).toBe("sun-photosensitivity");
  });

  it("garantit qu'aucun conseil de confort ne peut dépasser un conseil de sécurité", () => {
    const safetyRules = ADVICE_RULES.filter((r) => r.kind === "SAFETY");
    const otherRules = ADVICE_RULES.filter((r) => r.kind !== "SAFETY");

    for (const safetyRule of safetyRules) {
      expect(PRIORITY_FLOOR[safetyRule.kind]).toBeGreaterThan(
        Math.max(...otherRules.map((r) => PRIORITY_CEILING[r.kind])),
      );
    }
  });

  it("ne déclenche pas une règle de classe sur un simple effet indésirable partagé", () => {
    // Régression : « troubles digestifs » est un effet fréquent de nombreux
    // médicaments. Il ne doit jamais suffire à déclencher une règle qui affirme
    // quelque chose sur la classe — sinon le moteur produit une justification
    // fausse (« Amoxicilline est une supplémentation martiale »).
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Amoxicilline",
          knowledge: drug({ commonSideEffects: ["troubles digestifs", "constipation"] }),
        },
      ],
      patient: patient(),
    });

    const iron = opportunities.find((o) => o.key === "iron-absorption-support");
    expect(iron).toBeUndefined();

    for (const item of opportunities) {
      const rule = ADVICE_RULES.find((r) => r.key === item.key)!;
      expect(rule.triggerMode).toBe("CLASS_ONLY");
    }
  });

  it("laisse un effet indésirable déclencher une règle qui porte sur cet effet", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Molécule X",
          knowledge: drug({
            name: "Molécule X",
            atcCode: "X99ZZ99",
            therapeuticClass: "Classe non couverte",
            commonSideEffects: ["sécheresse buccale"],
          }),
        },
      ],
      patient: patient(),
    });

    const dryMouth = opportunities.find((o) => o.key === "dry-mouth-hygiene");
    expect(dryMouth).toBeDefined();
    expect(
      ADVICE_RULES.find((r) => r.key === "dry-mouth-hygiene")!.triggerMode,
    ).toBe("CLASS_OR_SIDE_EFFECT");
  });

  it("n'affirme jamais une classe thérapeutique sur la foi d'un effet indésirable", () => {
    // Garde-fou général : toute règle dont la justification affirme une classe
    // doit être déclarée CLASS_ONLY.
    const CLASS_ASSERTIONS = [
      "est un anti-inflammatoire",
      "Une antibiothérapie",
      "Une supplémentation martiale",
      "Un traitement dermatologique",
      "s'inscrit dans un contexte osseux",
    ];

    for (const rule of ADVICE_RULES) {
      const assertsClass = CLASS_ASSERTIONS.some((phrase) =>
        rule.rationaleTemplate.includes(phrase),
      );
      if (assertsClass) expect(rule.triggerMode).toBe("CLASS_ONLY");
    }
  });

  it("expose toujours une raison lisible par un pharmacien", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "Amoxicilline", knowledge: drug() }],
      patient: patient(),
    });

    expect(opportunities.length).toBeGreaterThan(0);
    for (const item of opportunities) {
      expect(item.rationale.length).toBeGreaterThan(20);
      expect(item.rationale).toContain("Amoxicilline");
    }
  });
});
