import { brandVisibility } from "@/core/partners/visibility";
import type { Audience, PublicationStatus } from "@/core/partners/status";

/**
 * Découvertes (PharmaBoost Mobile) : qui voit quoi. Pur, sans base.
 *
 * Deux publics :
 *  - le compte GRATUIT (Communauté, aucune officine) ne voit que les marques ACTIVES, d'un partenaire ACTIF, diffusées
 *    à toutes les officines. Un essai (TEST), une sélection d'officines ou un groupe pilote ne le concernent pas ;
 *  - le collaborateur d'une officine CLIENTE voit ce que la règle centrale `brandVisibility` laisse passer pour SON
 *    officine (statuts, audience, pilote), ET rien de ce que son officine a masqué ou refusé : dans l'application, une
 *    marque masquée au comptoir ne revient pas par la porte des Découvertes.
 *
 * Une nouveauté (PartnerLaunch) s'affiche relue (APPROVED), publiée, non échue et VALIDÉE sur le plan réglementaire
 * (nom du validateur ET date). Un médicament exige en plus ses mentions obligatoires.
 */

export type DiscoverViewer =
  | { kind: "community" }
  | {
      kind: "staff";
      pharmacyId: string;
      pilot: boolean;
      /** Marques dont la sélection contient l'officine active. */
      selectedBrandIds: ReadonlySet<string>;
      /** Choix de l'officine active, par marque. */
      preferences: ReadonlyMap<string, "HIDDEN" | "REFUSED">;
    };

export type BrandFacts = {
  id: string;
  status: PublicationStatus;
  audience: Audience;
  partnerStatus: PublicationStatus;
  /** Le partenaire est dans sa période (startsAt ≤ maintenant < endsAt, bornes facultatives). */
  partnerInPeriod?: boolean;
};

export function brandVisibleTo(brand: BrandFacts, viewer: DiscoverViewer): boolean {
  if (brand.partnerInPeriod === false) return false;
  if (viewer.kind === "community") {
    return brand.partnerStatus === "ACTIVE" && brand.status === "ACTIVE" && brand.audience === "ALL_PHARMACIES";
  }
  const visibility = brandVisibility({
    partnerStatus: brand.partnerStatus,
    brandStatus: brand.status,
    audience: brand.audience,
    selected: viewer.selectedBrandIds.has(brand.id),
    pilot: viewer.pilot,
    preference: viewer.preferences.get(brand.id) ?? null,
  });
  // `counter` = au catalogue ET non masquée : ni refusée, ni masquée par l'officine.
  return visibility.counter;
}

export function partnerInPeriod(partner: { startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (partner.startsAt && partner.startsAt > now) return false;
  if (partner.endsAt && partner.endsAt <= now) return false;
  return true;
}

/** Une gamme publiée pour ce public : ACTIVE, ou TEST pour le seul groupe pilote d'une officine cliente. */
export function rangeVisibleTo(status: PublicationStatus, viewer: DiscoverViewer): boolean {
  if (status === "ACTIVE") return true;
  return status === "TEST" && viewer.kind === "staff" && viewer.pilot;
}

export const REGULATORY_CATEGORIES = ["MEDICINE", "MEDICAL_DEVICE", "PARAPHARMACY", "COSMETIC", "FOOD_SUPPLEMENT", "OTHER"] as const;
export type RegulatoryCategory = (typeof REGULATORY_CATEGORIES)[number];

export const REGULATORY_CATEGORY_LABELS: Record<RegulatoryCategory, string> = {
  MEDICINE: "Médicament",
  MEDICAL_DEVICE: "Dispositif médical",
  PARAPHARMACY: "Parapharmacie",
  COSMETIC: "Cosmétique",
  FOOD_SUPPLEMENT: "Complément alimentaire",
  OTHER: "Autre",
};

export type RegulatoryFacts = {
  regulatoryCategory: RegulatoryCategory | null;
  validatedBy: string | null;
  validatedAt: Date | null;
  mentions?: string | null;
};

export type RegulatoryProblem = "NOT_VALIDATED" | "MEDICINE_MENTIONS_MISSING";

/**
 * La validation réglementaire suffit-elle à diffuser ? Un nom ET une date, toujours. Un médicament doit en plus
 * porter ses mentions obligatoires (reproduites à l'écran).
 */
export function regulatoryProblem(facts: RegulatoryFacts): RegulatoryProblem | null {
  if (!facts.validatedAt || !facts.validatedBy?.trim()) return "NOT_VALIDATED";
  if (facts.regulatoryCategory === "MEDICINE" && facts.mentions !== undefined && !facts.mentions?.trim()) return "MEDICINE_MENTIONS_MISSING";
  return null;
}

export type LaunchFacts = RegulatoryFacts & {
  reviewStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
  publishedAt: Date | null;
  endsAt: Date | null;
};

/** Une nouveauté est-elle en ligne à cet instant (indépendamment du public) ? */
export function launchIsLive(launch: LaunchFacts, now: Date): boolean {
  if (launch.reviewStatus !== "APPROVED") return false;
  if (!launch.publishedAt || launch.publishedAt > now) return false;
  if (launch.endsAt && launch.endsAt <= now) return false;
  return regulatoryProblem(launch) === null;
}
