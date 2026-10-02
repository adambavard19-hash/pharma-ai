import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";

const TONES: Record<PublicationStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  TEST: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
};

/** Le statut de publication d'un partenaire, avec sa couleur. */
export function PublicationBadge({ status }: { status: PublicationStatus }) {
  return <Badge tone={TONES[status]}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

/** Ce que chaque statut produit côté officines, en une ligne. */
export const PUBLICATION_EFFECTS: Record<PublicationStatus, string> = {
  DRAFT: "Brouillon : en préparation, visible d'aucune officine, ses marques comprises.",
  TEST: "Test : seules les officines du groupe pilote voient ses marques publiées.",
  ACTIVE: "Actif : ses marques actives sont diffusées selon leur audience ; une marque en test reste réservée au groupe pilote.",
  SUSPENDED: "Suspendu : plus visible d'aucune officine, ses marques comprises.",
  ARCHIVED: "Archivé : plus visible d'aucune officine, ses marques comprises. Pour revenir, il repasse en brouillon.",
};
