/**
 * Import du stock — le domaine, testable sans fichier ni base.
 *
 * Lire les colonnes, normaliser les lignes, rattacher chaque ligne à ce qui
 * est connu, résumer. L'écriture en base vit dans le service serveur.
 */
export {
  FIELD_LABELS,
  REQUIRED_FIELDS,
  missingRequiredFields,
  normalizeHeader,
  suggestMapping,
  type ColumnMapping,
  type ImportField,
} from "./columns";
export {
  ISSUE_LABELS,
  mergeDuplicates,
  normalizeCode,
  parsePriceCents,
  parseQuantity,
  parseVatRate,
  readRows,
  type ImportIssue,
  type ImportRow,
} from "./rows";
export {
  classifyRows,
  expandCip,
  normalizeName,
  summarize,
  type ClassifiedRow,
  type ImportSummary,
  type Lookups,
  type RowCandidate,
  type RowDecision,
  type RowStatus,
} from "./classify";
export { tagsFromName } from "./tags";
