/**
 * Le parcours d'un dossier, de la prospection au client actif, déduit des
 * faits enregistrés (statut du dossier, statut du contrat tel que le
 * prestataire de signature l'a notifié, archivage du PDF signé). Rien ici ne
 * se déclare à la main : une étape s'affiche parce qu'elle s'est produite.
 */
export type JourneyStage =
  | "PROSPECT"
  | "CONTRACT_PREPARED"
  | "CONTRACT_SENT"
  | "CONTRACT_VIEWED"
  | "SIGNING"
  | "SIGNED"
  | "SUBSCRIPTION_PENDING"
  | "CLIENT_ACTIVE"
  | "REFUSED"
  | "EXPIRED"
  | "LOST";

export const JOURNEY_LABELS: Record<JourneyStage, string> = {
  PROSPECT: "Prospect",
  CONTRACT_PREPARED: "Contrat préparé",
  CONTRACT_SENT: "Contrat envoyé",
  CONTRACT_VIEWED: "Contrat consulté",
  SIGNING: "Signature en cours",
  SIGNED: "Contrat finalisé",
  SUBSCRIPTION_PENDING: "Abonnement à activer",
  CLIENT_ACTIVE: "Client actif",
  REFUSED: "Contrat refusé",
  EXPIRED: "Contrat expiré",
  LOST: "Perdu",
};

/** L'ordre affiché dans la frise (les issues négatives n'y figurent pas). */
export const JOURNEY_STEPS: JourneyStage[] = ["PROSPECT", "CONTRACT_PREPARED", "CONTRACT_SENT", "CONTRACT_VIEWED", "SIGNING", "SIGNED", "SUBSCRIPTION_PENDING", "CLIENT_ACTIVE"];

export type JourneyInput = {
  prospectStatus: string;
  contract?: { status: string; signedArchivedAt?: Date | string | null } | null;
};

export function journeyStage(input: JourneyInput): JourneyStage {
  if (input.prospectStatus === "ACTIVATED") return "CLIENT_ACTIVE";
  const c = input.contract;
  if (c) {
    switch (c.status) {
      case "DRAFT":
        return "CONTRACT_PREPARED";
      case "SENT":
        return "CONTRACT_SENT";
      case "OPENED":
        return "CONTRACT_VIEWED";
      case "SIGNED_PHARMACY":
      case "SIGNED_COMPANY":
        return "SIGNING";
      case "FINALIZED":
        return c.signedArchivedAt ? "SUBSCRIPTION_PENDING" : "SIGNED";
      case "REFUSED":
        return "REFUSED";
      case "EXPIRED":
        return "EXPIRED";
    }
  }
  if (input.prospectStatus === "LOST") return "LOST";
  return "PROSPECT";
}

/** Une étape négative ou finale n'avance plus dans la frise. */
export function journeyStepIndex(stage: JourneyStage): number {
  return JOURNEY_STEPS.indexOf(stage);
}

export const ORIGIN_LABELS: Record<string, string> = {
  SELF_SERVICE_SITE: "Site PharmaBoost",
  SUPER_ADMIN: "Console PharmaBoost",
  COMMERCIAL: "Commercial",
};
