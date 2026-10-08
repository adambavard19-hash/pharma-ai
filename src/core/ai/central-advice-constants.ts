/**
 * Les constantes du centre de contrôle des conseils, sans aucune dépendance : l'écran de la console les lit côté navigateur
 * sans embarquer le moteur de règles.
 */

export type CentralStatus = "ACTIVE" | "VALIDATED" | "REMOVED";

export const CENTRAL_STATUS_LABELS: Record<CentralStatus, string> = {
  ACTIVE: "En ligne · à relire",
  VALIDATED: "Validé",
  REMOVED: "Supprimé",
};

/** Un conseil ajouté ne peut être que de tolérance ou de confort : jamais de sécurité, qui reste écrite dans le code. */
export const CUSTOM_KINDS = ["TOLERANCE", "COMFORT"] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];

export const CUSTOM_KIND_LABELS: Record<CustomKind, string> = {
  TOLERANCE: "Tolérance — un effet attendu du traitement",
  COMFORT: "Confort — un inconfort possible",
};

export const CUSTOM_LIMITS = { title: 80, reason: 160, script: 420, question: 200, source: 200, note: 200, notes: 5, tags: 6, atc: 8, classes: 5 } as const;

export const CENTRAL_SENTENCE_MAX = 280;
