import type { Audience, PublicationStatus } from "./status";

/**
 * Une marque partenaire est-elle visible pour cette officine ?
 *
 * Les données sont centrales (une seule fiche, jamais copiée par officine) :
 * c'est cette règle, et elle seule, qui décide de la diffusion. Elle combine
 * le statut du partenaire, celui de la marque, l'audience choisie par
 * PharmaBoost et le choix de l'officine (masquer, refuser).
 *
 *  - partenaire ou marque en brouillon, suspendu ou archivé : invisible ;
 *  - l'un des deux en TEST : groupe pilote seulement ;
 *  - audience « sélection » : les officines retenues ; « groupe pilote » : le pilote ;
 *  - refusée par l'officine : invisible partout ;
 *  - masquée : visible au catalogue, jamais au comptoir.
 */

export type VisibilityInput = {
  partnerStatus: PublicationStatus;
  brandStatus: PublicationStatus;
  audience: Audience;
  /** L'officine figure dans la sélection de la marque. */
  selected: boolean;
  /** L'officine appartient au groupe pilote. */
  pilot: boolean;
  /** Le choix de l'officine sur cette marque, s'il existe. */
  preference: "HIDDEN" | "REFUSED" | null;
};

export type VisibilityReason =
  | "VISIBLE"
  | "PARTNER_NOT_PUBLISHED"
  | "BRAND_NOT_PUBLISHED"
  | "TEST_PILOT_ONLY"
  | "NOT_SELECTED"
  | "PILOT_ONLY"
  | "REFUSED_BY_PHARMACY";

export type Visibility = {
  /** Consultable au catalogue de l'officine. */
  catalog: boolean;
  /** Peut apparaître en carte « À découvrir » au comptoir. */
  counter: boolean;
  reason: VisibilityReason;
};

const LIVE: PublicationStatus[] = ["TEST", "ACTIVE"];
const HIDDEN: Visibility = { catalog: false, counter: false, reason: "VISIBLE" };

export function brandVisibility(input: VisibilityInput): Visibility {
  if (!LIVE.includes(input.partnerStatus)) return { ...HIDDEN, reason: "PARTNER_NOT_PUBLISHED" };
  if (!LIVE.includes(input.brandStatus)) return { ...HIDDEN, reason: "BRAND_NOT_PUBLISHED" };
  if ((input.partnerStatus === "TEST" || input.brandStatus === "TEST") && !input.pilot) return { ...HIDDEN, reason: "TEST_PILOT_ONLY" };
  if (input.audience === "SELECTED_PHARMACIES" && !input.selected) return { ...HIDDEN, reason: "NOT_SELECTED" };
  if (input.audience === "PILOT_GROUP" && !input.pilot) return { ...HIDDEN, reason: "PILOT_ONLY" };
  if (input.preference === "REFUSED") return { ...HIDDEN, reason: "REFUSED_BY_PHARMACY" };
  return { catalog: true, counter: input.preference !== "HIDDEN", reason: "VISIBLE" };
}

/** Une gamme ou une offre suit le même cycle : publiée (TEST ou ACTIVE), et TEST réservé au pilote. */
export function itemVisible(status: PublicationStatus, pilot: boolean): boolean {
  if (status === "ACTIVE") return true;
  return status === "TEST" && pilot;
}
