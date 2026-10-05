import { parseSuggestionVigilances } from "../../config/vigilances";
import type { ExpiryLevel } from "../stock/expiry";
import type { CompanionSuggestion, ScoreBreakdown, ScoreContribution, ScoredAlternative } from "./types";

/**
 * Les alternatives d'un conseil, telles qu'elles vivent en base.
 *
 * Elles sont écrites par l'analyse (`Recommendation.alternatives`, un Json) et
 * relues à l'écran puis par l'action « Proposer celle-ci » : la seule règle qui
 * tient ici est de ne jamais faire confiance à ce qui revient de la base. Une
 * entrée incomplète est ignorée, jamais réparée — une alternative inventée
 * serait pire qu'une alternative absente.
 */

const DIMENSIONS: (keyof ScoreBreakdown)[] = [
  "relevance",
  "safety",
  "availability",
  "patientFit",
  "pharmacistPreference",
  "validationHistory",
  "commercial",
];
const ROLES: ScoreContribution["role"][] = ["SCORE", "FILTRE"];
const EXPIRY_LEVELS: ExpiryLevel[] = ["EXPIRED", "URGENT", "SOON", "OK"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string";
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isText) : []);

function readBreakdown(value: unknown): ScoreBreakdown | null {
  if (!isRecord(value) || !DIMENSIONS.every((dimension) => isNumber(value[dimension]))) return null;
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, value[dimension]])) as ScoreBreakdown;
}

function readExplanation(value: unknown): ScoreContribution[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ScoreContribution =>
      isRecord(item) &&
      DIMENSIONS.includes(item.dimension as keyof ScoreBreakdown) &&
      isText(item.label) &&
      isNumber(item.value) &&
      isNumber(item.weight) &&
      isText(item.detail) &&
      ROLES.includes(item.role as ScoreContribution["role"]),
  );
}

function readCompanion(value: unknown): CompanionSuggestion | null {
  if (!isRecord(value) || !isText(value.productId) || !isText(value.name) || !isNumber(value.salePriceCents) || !isNumber(value.stockQuantity)) return null;
  if (!isText(value.label) || !isText(value.reason)) return null;
  return { productId: value.productId, name: value.name, salePriceCents: value.salePriceCents, stockQuantity: value.stockQuantity, label: value.label, reason: value.reason };
}

function readAlternative(value: unknown): ScoredAlternative | null {
  if (!isRecord(value) || !isText(value.productId) || value.productId === "" || !isNumber(value.totalScore)) return null;
  const breakdown = readBreakdown(value.breakdown);
  if (!breakdown) return null;
  if (!isText(value.justification) || !isText(value.shortReason) || !isText(value.patientReason) || !isText(value.counterScript)) return null;

  const shortDate = value.shortDate;
  const companion = readCompanion(value.companion);
  return {
    productId: value.productId,
    totalScore: value.totalScore,
    breakdown,
    justification: value.justification,
    shortReason: value.shortReason,
    patientReason: value.patientReason,
    counterScript: value.counterScript,
    precautions: texts(value.precautions),
    explanation: readExplanation(value.explanation),
    vigilances: parseSuggestionVigilances(value.vigilances),
    shortDate:
      isRecord(shortDate) && isText(shortDate.expiresOn) && isNumber(shortDate.daysLeft) && EXPIRY_LEVELS.includes(shortDate.level as ExpiryLevel)
        ? { expiresOn: shortDate.expiresOn, daysLeft: shortDate.daysLeft, level: shortDate.level as ExpiryLevel }
        : null,
    ...(companion ? { companion } : {}),
  };
}

/** Relit les alternatives persistées (Json) : au plus une entrée par produit, dans l'ordre enregistré. */
export function parseStoredAlternatives(value: unknown): ScoredAlternative[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const alternative = readAlternative(item);
    if (!alternative || seen.has(alternative.productId)) return [];
    seen.add(alternative.productId);
    return [alternative];
  });
}

/**
 * Le conseil retenu, relu comme une alternative : c'est ce qui lui permet de
 * revenir quand le pharmacien lui en préfère une autre. `null` quand la ligne
 * ne porte pas de quoi la reconstituer (un conseil ajouté à la main, des
 * données incomplètes) : on ne fabrique pas une alternative à moitié.
 */
export function alternativeFromRecommendation(row: {
  productId: string | null;
  totalScore: number;
  scoreBreakdown: unknown;
  justification: string;
  shortReason: string | null;
  patientReason: string | null;
  counterScript: string | null;
  precautions: string[];
  vigilances: unknown;
  companion: unknown;
}): ScoredAlternative | null {
  if (!row.productId) return null;
  const stored: Record<string, unknown> = isRecord(row.scoreBreakdown) ? row.scoreBreakdown : {};
  const { explanation, ...breakdown } = stored;
  return readAlternative({
    productId: row.productId,
    totalScore: row.totalScore,
    breakdown,
    justification: row.justification,
    shortReason: row.shortReason ?? "",
    patientReason: row.patientReason ?? "",
    counterScript: row.counterScript ?? "",
    precautions: row.precautions,
    explanation,
    vigilances: row.vigilances,
    companion: row.companion,
  });
}
