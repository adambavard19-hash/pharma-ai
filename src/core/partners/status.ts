/**
 * PharmaBoost Partenaires : statuts, libellés et transitions permises.
 *
 * Pur, sans base : la console et les services s'y réfèrent pour refuser une
 * transition qui n'a pas de sens (passer une candidature refusée en
 * « partenaire actif », publier une marque archivée sans la repasser en
 * brouillon…). Les valeurs reprennent les énumérations Prisma.
 */

export const APPLICATION_STATUSES = ["NEW", "REVIEWING", "CONTACTED", "NEGOTIATION", "ACCEPTED", "REFUSED", "ACTIVE_PARTNER"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  NEW: "Nouveau",
  REVIEWING: "En étude",
  CONTACTED: "Contacté",
  NEGOTIATION: "Négociation",
  ACCEPTED: "Accepté",
  REFUSED: "Refusé",
  ACTIVE_PARTNER: "Partenaire actif",
};

/**
 * Le chemin d'une candidature. On peut revenir d'un cran (une négociation qui
 * repart en simple contact) et rouvrir un refus ; « partenaire actif » ne
 * s'atteint que depuis « accepté », une fois la fiche partenaire créée.
 */
const APPLICATION_NEXT: Record<ApplicationStatus, ApplicationStatus[]> = {
  NEW: ["REVIEWING", "CONTACTED", "REFUSED"],
  REVIEWING: ["CONTACTED", "NEGOTIATION", "REFUSED"],
  CONTACTED: ["REVIEWING", "NEGOTIATION", "REFUSED"],
  NEGOTIATION: ["CONTACTED", "ACCEPTED", "REFUSED"],
  ACCEPTED: ["NEGOTIATION", "ACTIVE_PARTNER"],
  REFUSED: ["REVIEWING"],
  ACTIVE_PARTNER: [],
};

export function nextApplicationStatuses(from: ApplicationStatus): ApplicationStatus[] {
  return APPLICATION_NEXT[from];
}

export function canMoveApplication(from: ApplicationStatus, to: ApplicationStatus, hasPartner: boolean): boolean {
  if (!APPLICATION_NEXT[from].includes(to)) return false;
  // Une candidature ne devient « partenaire actif » qu'adossée à une vraie fiche partenaire.
  if (to === "ACTIVE_PARTNER" && !hasPartner) return false;
  return true;
}

export const PUBLICATION_STATUSES = ["DRAFT", "TEST", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  DRAFT: "Brouillon",
  TEST: "Test",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  ARCHIVED: "Archivé",
};

const PUBLICATION_NEXT: Record<PublicationStatus, PublicationStatus[]> = {
  DRAFT: ["TEST", "ACTIVE", "ARCHIVED"],
  TEST: ["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["TEST", "ACTIVE", "ARCHIVED"],
  // Une archive repart en brouillon : jamais directement en ligne.
  ARCHIVED: ["DRAFT"],
};

export function nextPublicationStatuses(from: PublicationStatus): PublicationStatus[] {
  return PUBLICATION_NEXT[from];
}

export function canMovePublication(from: PublicationStatus, to: PublicationStatus): boolean {
  return PUBLICATION_NEXT[from].includes(to);
}

export const AUDIENCES = ["ALL_PHARMACIES", "SELECTED_PHARMACIES", "PILOT_GROUP"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  ALL_PHARMACIES: "Toutes les officines",
  SELECTED_PHARMACIES: "Officines sélectionnées",
  PILOT_GROUP: "Groupe pilote",
};

export const INTEGRATION_MODES = ["API", "B2B_LINK", "FORM", "EMAIL", "IMPORT_EXPORT", "MANUAL"] as const;
export type IntegrationMode = (typeof INTEGRATION_MODES)[number];

export const INTEGRATION_MODE_LABELS: Record<IntegrationMode, string> = {
  API: "API",
  B2B_LINK: "Lien B2B attribué",
  FORM: "Formulaire",
  EMAIL: "E-mail",
  IMPORT_EXPORT: "Import / export",
  MANUAL: "Manuel",
};

export const CONTRACT_TYPES = ["FLAT_FEE", "COMMISSION", "HYBRID", "PILOT", "FREE"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  FLAT_FEE: "Forfait",
  COMMISSION: "Commission",
  HYBRID: "Hybride",
  PILOT: "Pilote",
  FREE: "Gratuit",
};

export const ORDER_STATUS_LABELS = {
  SUBMITTED: "Enregistrée",
  TRANSMITTED: "Transmise",
  CONFIRMED: "Confirmée",
  FAILED: "Échec de transmission",
  CANCELLED: "Annulée",
} as const;

export const LEAD_KIND_LABELS = {
  CONTACT_REQUEST: "Demande de contact",
  B2B_LINK_OPENED: "Portail B2B ouvert",
  FORM_OPENED: "Formulaire partenaire ouvert",
} as const;

export const PREFERENCE_CHOICE_LABELS = {
  HIDDEN: "Masquée au comptoir",
  REFUSED: "Refusée",
} as const;

/** Un slug d'URL lisible et stable : « Laboratoire Exemple & Cie » → « laboratoire-exemple-cie ». */
export function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
