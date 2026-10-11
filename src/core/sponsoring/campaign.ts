import { regulatoryProblem, type RegulatoryCategory } from "@/core/discover/visibility";

/**
 * Les campagnes sponsorisées : formats, emplacements, cycle de vie. Pur, sans base.
 *
 * Une campagne n'est diffusée que :
 *  - ACTIVE, dans sa période (startsAt ≤ maintenant < endsAt) ;
 *  - validée sur le plan réglementaire (nom + date ; un médicament ne s'active pas sans) ;
 *  - pour un public qui voit la marque (règle de `core/discover/visibility`).
 * Elle est TOUJOURS signalée « Sponsorisé » à l'écran, et ne touche jamais au moteur de conseil.
 */

export const SPONSORED_FORMATS = ["FICHE_PARTENAIRE", "MISE_EN_AVANT", "LANCEMENT", "PROGRAMME_FORMATION"] as const;
export type SponsoredFormat = (typeof SPONSORED_FORMATS)[number];

export const SPONSORED_FORMAT_LABELS: Record<SponsoredFormat, string> = {
  FICHE_PARTENAIRE: "Fiche partenaire",
  MISE_EN_AVANT: "Mise en avant",
  LANCEMENT: "Lancement",
  PROGRAMME_FORMATION: "Programme de formation",
};

export const SPONSORED_PLACEMENTS = ["HOME_HERO", "HOME_FEED", "DISCOVER_TOP", "DISCOVER_CATEGORY", "TRAINING_FEED", "TRAINING_MODULE"] as const;
export type SponsoredPlacement = (typeof SPONSORED_PLACEMENTS)[number];

export const SPONSORED_PLACEMENT_LABELS: Record<SponsoredPlacement, string> = {
  HOME_HERO: "Accueil — première carte",
  HOME_FEED: "Accueil — nouveautés partenaires",
  DISCOVER_TOP: "Découvertes — à la une",
  DISCOVER_CATEGORY: "Découvertes — dans un univers",
  TRAINING_FEED: "Formations — fil",
  TRAINING_MODULE: "Formations — parcours",
};

export function isPlacement(value: unknown): value is SponsoredPlacement {
  return typeof value === "string" && (SPONSORED_PLACEMENTS as readonly string[]).includes(value);
}

export const CAMPAIGN_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "ENDED", "REJECTED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En relecture",
  APPROVED: "Approuvée",
  ACTIVE: "Active",
  PAUSED: "En pause",
  ENDED: "Terminée",
  REJECTED: "Refusée",
};

export const BILLING_STATUSES = ["QUOTE", "SIGNED", "INVOICED", "PAID"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  QUOTE: "Devis",
  SIGNED: "Signé",
  INVOICED: "Facturé",
  PAID: "Payé",
};

/** Le chemin d'une campagne. Une campagne terminée ne se rouvre pas (on en crée une autre). */
const NEXT: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["ACTIVE", "DRAFT"],
  ACTIVE: ["PAUSED", "ENDED"],
  PAUSED: ["ACTIVE", "ENDED"],
  ENDED: [],
  REJECTED: ["DRAFT"],
};

export function nextCampaignStatuses(from: CampaignStatus): CampaignStatus[] {
  return NEXT[from];
}

export type CampaignFacts = {
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  placements: SponsoredPlacement[];
  regulatoryCategory: RegulatoryCategory | null;
  regulatoryReviewedBy: string | null;
  regulatoryReviewedAt: Date | null;
};

export type TransitionRefusal =
  | "NOT_ALLOWED"
  | "REGULATORY_VALIDATION_REQUIRED"
  | "NO_PLACEMENT"
  | "PERIOD_INVALID"
  | "PERIOD_OVER";

export const TRANSITION_REFUSAL_MESSAGES: Record<TransitionRefusal, string> = {
  NOT_ALLOWED: "Ce changement d'étape n'est pas possible depuis l'étape actuelle.",
  REGULATORY_VALIDATION_REQUIRED: "La validation réglementaire (nom du validateur et date) est obligatoire avant d'approuver ou d'activer.",
  NO_PLACEMENT: "Choisissez au moins un emplacement.",
  PERIOD_INVALID: "La date de fin doit suivre la date de début.",
  PERIOD_OVER: "La période de la campagne est déjà passée.",
};

/** Un changement d'étape est-il permis ? Approuver et activer exigent la validation réglementaire. */
export function checkCampaignTransition(campaign: CampaignFacts, to: CampaignStatus, now: Date): TransitionRefusal | null {
  if (!NEXT[campaign.status].includes(to)) return "NOT_ALLOWED";
  if (to === "IN_REVIEW" || to === "APPROVED" || to === "ACTIVE") {
    if (campaign.placements.length === 0) return "NO_PLACEMENT";
    if (campaign.endsAt <= campaign.startsAt) return "PERIOD_INVALID";
  }
  if (to === "APPROVED" || to === "ACTIVE") {
    if (regulatoryProblem({ regulatoryCategory: campaign.regulatoryCategory, validatedBy: campaign.regulatoryReviewedBy, validatedAt: campaign.regulatoryReviewedAt })) {
      return "REGULATORY_VALIDATION_REQUIRED";
    }
  }
  if (to === "ACTIVE" && campaign.endsAt <= now) return "PERIOD_OVER";
  return null;
}

/** Diffusée à cet instant (le public est jugé à part) ? */
export function campaignIsLive(campaign: CampaignFacts, now: Date): boolean {
  if (campaign.status !== "ACTIVE") return false;
  if (campaign.startsAt > now || campaign.endsAt <= now) return false;
  return regulatoryProblem({ regulatoryCategory: campaign.regulatoryCategory, validatedBy: campaign.regulatoryReviewedBy, validatedAt: campaign.regulatoryReviewedAt }) === null;
}

/**
 * Publics d'une campagne (`audiences`, vide = tous) : les valeurs de TrainingAudience. On les compare au métier
 * déclaré de la personne ; « ALL » ou aucune valeur : tout le monde.
 */
export function audienceMatches(audiences: string[], profession: string | null, role: string | null): boolean {
  if (audiences.length === 0 || audiences.includes("ALL")) return true;
  const mine = new Set<string>();
  if (profession === "PHARMACY_STUDENT" || role === "STUDENT") mine.add("STUDENT");
  if (profession === "TECHNICIAN" || role === "TECHNICIAN") mine.add("TECHNICIAN");
  if (profession === "ASSISTANT_PHARMACIST" || profession === "OWNER_PHARMACIST" || role === "PHARMACIST" || role === "OWNER") mine.add("PHARMACIST");
  if (profession === "OWNER_PHARMACIST" || role === "OWNER") mine.add("OWNER");
  return audiences.some((audience) => mine.has(audience));
}
