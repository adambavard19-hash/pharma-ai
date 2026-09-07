/**
 * Compréhension du traitement — le domaine.
 *
 * Tout ce qui décide de ce qu'une compréhension peut affirmer vit ici,
 * testable sans réseau. L'adaptateur (`src/core/ai/providers/anthropic-ai.ts`)
 * ne fait que transporter une classification ; le contexte et les besoins
 * sont dérivés ici, par des règles écrites.
 */
export {
  NEED_DEFINITIONS,
  NEED_KEYS,
  isNeedKey,
  type NeedDefinition,
  type NeedKey,
} from "./needs";
export {
  UNDERSTANDING_SCHEMA,
  UNDERSTANDING_SYSTEM_PROMPT,
  UNDERSTANDING_TOOL_NAME,
  buildUnderstandingUserPrompt,
} from "./schema";
export { CLASSIFICATION_MIN_CONFIDENCE, validateClassification } from "./validate";
export { CONTEXT_RULES, deriveUnderstanding, needLabel } from "./context";
export type {
  ClaimedClassification,
  ClassificationRequest,
  ClassificationResult,
  DrugClassification,
  IdentifiedNeed,
  RejectedUnderstanding,
  TreatmentUnderstanding,
  UnderstandingLine,
  UnderstandingPatient,
} from "./types";
