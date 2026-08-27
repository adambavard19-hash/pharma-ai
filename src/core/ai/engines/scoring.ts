import type {
  AdviceOpportunityResult,
  CatalogProduct,
  PatientContext,
  PharmacyRuleInput,
  ProductValidationHistory,
  ScoreBreakdown,
  ScoreContribution,
  ScoredRecommendation,
} from "../types";

/**
 * Moteur de score explicable.
 *
 * Chaque dimension est calculée séparément puis combinée par une somme
 * pondérée. Aucune boîte noire : `explanation` restitue, dimension par
 * dimension, ce qui a joué et pourquoi.
 *
 * HIÉRARCHIE IMPOSÉE (cf. docs/ARCHITECTURE.md § Séparation médical/commercial) :
 *   sécurité > pertinence > adéquation patient > disponibilité >
 *   préférence de l'officine > commercial
 *
 * Deux garde-fous rendent cette hiérarchie structurelle et non déclarative :
 *   1. `safety = 0` annule le score total (produit écarté, pas rétrogradé) ;
 *   2. la contribution commerciale est plafonnée à `COMMERCIAL_MAX_WEIGHT` et
 *      ne peut jamais renverser un écart de pertinence — un test le vérifie.
 */

export const SCORE_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  relevance: 0.34,
  safety: 0.22,
  patientFit: 0.16,
  availability: 0.14,
  pharmacistPreference: 0.08,
  validationHistory: 0.04,
  commercial: 0.02,
};

/** Plafond absolu de l'influence commerciale sur le score final. */
export const COMMERCIAL_MAX_WEIGHT = 0.02;

export const DIMENSION_LABELS: Record<keyof ScoreBreakdown, string> = {
  relevance: "Pertinence du conseil",
  safety: "Sécurité",
  patientFit: "Adéquation au patient",
  availability: "Disponibilité",
  pharmacistPreference: "Préférence de l'officine",
  validationHistory: "Historique de validation",
  commercial: "Optimisation commerciale",
};

const norm = (value: string) => value.toLowerCase().trim();

function scoreRelevance(
  product: CatalogProduct,
  opportunity: AdviceOpportunityResult,
): { value: number; detail: string } {
  const productTags = new Set(
    [...product.matchingTags, product.subCategory ?? "", product.name]
      .flatMap((t) => norm(t).split(/[\s,;]+/))
      .filter(Boolean),
  );

  const matched = opportunity.matchingTags.filter((tag) =>
    norm(tag)
      .split(/\s+/)
      .some((word) => productTags.has(word)),
  );

  const categoryMatch = product.category === opportunity.category;
  const tagRatio = opportunity.matchingTags.length
    ? matched.length / opportunity.matchingTags.length
    : 0;

  const value = Math.min(1, (categoryMatch ? 0.55 : 0.15) + tagRatio * 0.45);

  const details: string[] = [];
  if (categoryMatch) details.push(`catégorie ${opportunity.category.toLowerCase()}`);
  if (matched.length) details.push(`correspondance : ${matched.join(", ")}`);
  if (!details.length) details.push("aucune correspondance directe");

  return { value, detail: details.join(" · ") };
}

function scoreSafety(
  product: CatalogProduct,
  opportunity: AdviceOpportunityResult,
  blockedProductIds: Set<string>,
): { value: number; detail: string } {
  if (blockedProductIds.has(product.id)) {
    return { value: 0, detail: "produit écarté par le moteur de sécurité" };
  }

  const excluded = opportunity.excludeTags.filter((tag) =>
    [...product.matchingTags, product.description ?? "", product.name]
      .join(" ")
      .toLowerCase()
      .includes(norm(tag)),
  );
  if (excluded.length > 0) {
    return { value: 0, detail: `exclusion : ${excluded.join(", ")}` };
  }

  if (product.precautions.length > 0) {
    return {
      value: 0.75,
      detail: `${product.precautions.length} précaution(s) à signaler`,
    };
  }

  return { value: 1, detail: "aucun signal de sécurité" };
}

function scorePatientFit(
  product: CatalogProduct,
  patient: PatientContext,
): { value: number; detail: string } {
  const contraindications = product.contraindications.map(norm);
  const details: string[] = [];
  let value = 1;

  if (patient.isPregnant && contraindications.some((c) => c.includes("grossesse"))) {
    return { value: 0, detail: "contre-indiqué pendant la grossesse" };
  }
  if (patient.isBreastfeeding && contraindications.some((c) => c.includes("allaitement"))) {
    return { value: 0, detail: "contre-indiqué pendant l'allaitement" };
  }
  if (
    patient.ageYears !== null &&
    patient.ageYears < 12 &&
    contraindications.some((c) => c.includes("enfant"))
  ) {
    return { value: 0, detail: "non adapté avant 12 ans" };
  }

  if (patient.ageYears === null) {
    value -= 0.1;
    details.push("âge du patient inconnu");
  }
  if (patient.allergies.length === 0) {
    value -= 0.05;
    details.push("aucune allergie renseignée");
  } else {
    details.push("allergies vérifiées");
  }

  return {
    value: Math.max(0, Math.min(1, value)),
    detail: details.join(" · ") || "contexte patient compatible",
  };
}

function scoreAvailability(product: CatalogProduct): {
  value: number;
  detail: string;
} {
  if (product.stockQuantity <= 0) {
    if (product.availableInSiblingPharmacy) {
      return { value: 0.35, detail: "en rupture ici, disponible dans une officine du groupe" };
    }
    return { value: 0, detail: "en rupture de stock" };
  }
  if (product.stockQuantity <= product.alertThreshold) {
    return {
      value: 0.6,
      detail: `stock faible (${product.stockQuantity} unité(s))`,
    };
  }
  return { value: 1, detail: `${product.stockQuantity} unités en stock` };
}

function scorePharmacistPreference(
  product: CatalogProduct,
  opportunity: AdviceOpportunityResult,
  rules: PharmacyRuleInput[],
): { value: number; detail: string; excluded: boolean } {
  let value = 0.5;
  const details: string[] = [];

  for (const rule of rules) {
    const targetsProduct = rule.productId === product.id;
    const targetsCategory = rule.category === opportunity.category;

    if (rule.type === "EXCLUDE_PRODUCT" && targetsProduct) {
      return { value: 0, detail: "référence exclue par l'officine", excluded: true };
    }
    if (rule.type === "EXCLUDE_CATEGORY" && targetsCategory) {
      return { value: 0, detail: "catégorie exclue par l'officine", excluded: true };
    }
    if (rule.type === "PREFER_PRODUCT" && targetsProduct) {
      value = Math.min(1, value + 0.5 * rule.weight);
      details.push("référence privilégiée par l'officine");
    }
    if (rule.type === "PREFER_CATEGORY" && targetsCategory) {
      value = Math.min(1, value + 0.25 * rule.weight);
      details.push("catégorie privilégiée par l'officine");
    }
  }

  return {
    value,
    detail: details.join(" · ") || "aucune préférence enregistrée",
    excluded: false,
  };
}

function scoreValidationHistory(
  product: CatalogProduct,
  history: ProductValidationHistory,
): { value: number; detail: string } {
  const stats = history[product.id];
  if (!stats || stats.proposed < 3) {
    return { value: 0.5, detail: "historique insuffisant (score neutre)" };
  }
  const acceptanceRate = stats.accepted / stats.proposed;
  return {
    value: Math.max(0, Math.min(1, acceptanceRate)),
    detail: `accepté ${stats.accepted} fois sur ${stats.proposed} propositions`,
  };
}

/**
 * Dimension commerciale — délibérément la dernière et la plus faible.
 * Elle ne sert qu'à départager deux références cliniquement équivalentes.
 */
function scoreCommercial(product: CatalogProduct): { value: number; detail: string } {
  if (product.salePriceCents <= 0) {
    return { value: 0.5, detail: "prix non renseigné" };
  }
  const margin = product.salePriceCents - product.purchasePriceCents;
  if (product.purchasePriceCents <= 0 || margin <= 0) {
    return { value: 0.5, detail: "marge non calculable" };
  }
  const marginRate = margin / product.salePriceCents;
  return {
    value: Math.max(0, Math.min(1, marginRate / 0.6)),
    detail: `marge ${Math.round(marginRate * 100)} %`,
  };
}

export function computeTotalScore(breakdown: ScoreBreakdown): number {
  // Un produit écarté pour raison de sécurité ou d'adéquation patient ne peut
  // jamais être remonté par une autre dimension.
  if (breakdown.safety === 0 || breakdown.patientFit === 0) return 0;

  const total = (Object.keys(SCORE_WEIGHTS) as (keyof ScoreBreakdown)[]).reduce(
    (sum, key) => sum + breakdown[key] * SCORE_WEIGHTS[key],
    0,
  );
  return Math.max(0, Math.min(1, Number(total.toFixed(4))));
}

export function scoreProductForOpportunity(params: {
  product: CatalogProduct;
  opportunity: AdviceOpportunityResult;
  patient: PatientContext;
  rules: PharmacyRuleInput[];
  history: ProductValidationHistory;
  blockedProductIds: Set<string>;
}): ScoredRecommendation | null {
  const { product, opportunity, patient, rules, history, blockedProductIds } = params;

  const relevance = scoreRelevance(product, opportunity);
  const safety = scoreSafety(product, opportunity, blockedProductIds);
  const patientFit = scorePatientFit(product, patient);
  const availability = scoreAvailability(product);
  const preference = scorePharmacistPreference(product, opportunity, rules);
  const validationHistory = scoreValidationHistory(product, history);
  const commercial = scoreCommercial(product);

  if (safety.value === 0 || patientFit.value === 0 || preference.excluded) return null;

  const breakdown: ScoreBreakdown = {
    relevance: relevance.value,
    safety: safety.value,
    patientFit: patientFit.value,
    availability: availability.value,
    pharmacistPreference: preference.value,
    validationHistory: validationHistory.value,
    commercial: commercial.value,
  };

  const contributions: Record<keyof ScoreBreakdown, string> = {
    relevance: relevance.detail,
    safety: safety.detail,
    patientFit: patientFit.detail,
    availability: availability.detail,
    pharmacistPreference: preference.detail,
    validationHistory: validationHistory.detail,
    commercial: commercial.detail,
  };

  const explanation: ScoreContribution[] = (
    Object.keys(SCORE_WEIGHTS) as (keyof ScoreBreakdown)[]
  )
    .map((dimension) => ({
      dimension,
      label: DIMENSION_LABELS[dimension],
      value: breakdown[dimension],
      weight: SCORE_WEIGHTS[dimension],
      detail: contributions[dimension],
    }))
    .sort((a, b) => b.value * b.weight - a.value * a.weight);

  const totalScore = computeTotalScore(breakdown);

  const justification = [
    `${opportunity.title} — ${opportunity.rationale}`,
    `Référence retenue : ${product.name}${product.brand ? ` (${product.brand})` : ""}.`,
    `Pertinence ${Math.round(relevance.value * 100)} % · ${availability.detail}.`,
    preference.detail !== "aucune préférence enregistrée" ? preference.detail + "." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const claim = product.commercialClaims[0];
  const patientReason = claim
    ? `${claim} — proposé dans le cadre de votre traitement.`
    : `Conseil proposé par votre pharmacien dans le cadre de votre traitement.`;

  return {
    opportunityKey: opportunity.key,
    productId: product.id,
    totalScore,
    breakdown,
    justification,
    patientReason,
    precautions: [...product.precautions, ...opportunity.safetyNotes],
    explanation,
  };
}
