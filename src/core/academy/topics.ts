/**
 * Les thèmes de l'Académie : les filtres du catalogue de l'onglet Formations. Un contenu « Médicaments » ne peut être
 * approuvé que par un relecteur pharmacien (voir `review.ts`).
 */
export const ACADEMY_TOPICS = ["MEDICINES", "PARAPHARMACY", "PRODUCT_NEWS", "LAB_NEWS", "NEW_STAFF"] as const;
export type AcademyTopicCode = (typeof ACADEMY_TOPICS)[number];

export const ACADEMY_TOPIC_LABELS: Record<AcademyTopicCode, string> = {
  MEDICINES: "Médicaments",
  PARAPHARMACY: "Parapharmacie",
  PRODUCT_NEWS: "Nouveautés produits",
  LAB_NEWS: "Nouveautés laboratoires",
  NEW_STAFF: "Nouveaux collaborateurs",
};

export function isAcademyTopic(value: unknown): value is AcademyTopicCode {
  return typeof value === "string" && (ACADEMY_TOPICS as readonly string[]).includes(value);
}

/** Un contenu sur le médicament : relecture par un pharmacien exigée. */
export function isMedicineTopic(topic: string | null | undefined): boolean {
  return topic === "MEDICINES";
}

export const AUDIENCES = ["ALL", "NEW_STAFF", "STUDENT", "TECHNICIAN", "PHARMACIST", "OWNER"] as const;
export type AudienceCode = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<AudienceCode, string> = {
  ALL: "Tout le monde",
  NEW_STAFF: "Nouveaux collaborateurs",
  STUDENT: "Étudiants",
  TECHNICIAN: "Préparateurs",
  PHARMACIST: "Pharmaciens",
  OWNER: "Titulaires",
};

export function isAudience(value: unknown): value is AudienceCode {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}
