/**
 * Le pipeline commercial : les étapes d'un dossier, dans l'ordre, et ce
 * qu'un commercial a le droit de faire lui-même.
 *
 * Les passages liés au contrat et à l'officine ne se décident pas à la main :
 * ils découlent d'un fait (contrat envoyé, contrat finalisé, officine créée,
 * officine active). Un commercial peut faire avancer la prospection et
 * déclarer un dossier perdu ; il ne peut pas déclarer un contrat signé.
 */
export const PROSPECT_STATUSES = [
  "PROSPECT",
  "CONTACTED",
  "INTERESTED",
  "PROPOSAL_SENT",
  "CONTRACT_SENT",
  "CONTRACT_SIGNED",
  "PHARMACY_CREATED",
  "ACTIVATED",
  "LOST",
] as const;

export type ProspectStatusCode = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatusCode, string> = {
  PROSPECT: "Prospect",
  CONTACTED: "Contacté",
  INTERESTED: "Intéressé",
  PROPOSAL_SENT: "Proposition envoyée",
  CONTRACT_SENT: "Contrat envoyé",
  CONTRACT_SIGNED: "Contrat signé",
  PHARMACY_CREATED: "Compte pharmacie créé",
  ACTIVATED: "Activé",
  LOST: "Perdu",
};

export const PROSPECT_STATUS_TONES: Record<ProspectStatusCode, "neutral" | "info" | "brand" | "warning" | "success" | "danger"> = {
  PROSPECT: "neutral",
  CONTACTED: "info",
  INTERESTED: "info",
  PROPOSAL_SENT: "brand",
  CONTRACT_SENT: "warning",
  CONTRACT_SIGNED: "success",
  PHARMACY_CREATED: "success",
  ACTIVATED: "success",
  LOST: "danger",
};

/** Étapes qu'un commercial choisit à la main. Les autres découlent d'un fait. */
export const MANUAL_STATUSES: ProspectStatusCode[] = ["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "LOST"];

/** Étapes portées par un contrat ou une officine : jamais saisies à la main. */
export const SYSTEM_STATUSES: ProspectStatusCode[] = ["CONTRACT_SENT", "CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"];

export function canSalesRepSetStatus(from: ProspectStatusCode, to: ProspectStatusCode): boolean {
  if (!MANUAL_STATUSES.includes(to)) return false;
  // Une fois le contrat parti, le dossier ne revient pas en prospection : il
  // se finalise, se refuse ou se perd.
  if (SYSTEM_STATUSES.includes(from) && to !== "LOST") return false;
  return from !== to;
}

/** Les statuts « en cours » : ni activés, ni perdus. */
export function isOpenStatus(status: ProspectStatusCode): boolean {
  return status !== "ACTIVATED" && status !== "LOST";
}

export const CONTRACT_STATUS_LABELS = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  OPENED: "Ouvert",
  SIGNED_PHARMACY: "Signé pharmacie",
  SIGNED_COMPANY: "Signé société",
  FINALIZED: "Finalisé",
  REFUSED: "Refusé",
  EXPIRED: "Expiré",
} as const;

export type ContractStatusCode = keyof typeof CONTRACT_STATUS_LABELS;

export const COMMISSION_STATUS_LABELS = {
  FORECAST: "Prévisionnelle",
  EARNED: "Acquise",
  PAYABLE: "À payer",
  PAID: "Payée",
  CANCELLED: "Annulée",
} as const;

export type CommissionStatusCode = keyof typeof COMMISSION_STATUS_LABELS;

/** Le statut de dossier qu'impose un statut de contrat, ou `null` s'il n'en impose aucun. */
export function prospectStatusForContract(status: ContractStatusCode): ProspectStatusCode | null {
  switch (status) {
    case "SENT":
    case "OPENED":
    case "SIGNED_PHARMACY":
    case "SIGNED_COMPANY":
      return "CONTRACT_SENT";
    case "FINALIZED":
      return "CONTRACT_SIGNED";
    default:
      return null;
  }
}
