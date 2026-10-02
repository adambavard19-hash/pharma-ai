import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";

/** Couleur d'un statut de publication : seul « Actif » est vert, « Test » est une diffusion restreinte. */
export const PUBLICATION_TONES: Record<PublicationStatus, "neutral" | "info" | "success" | "warning"> = {
  DRAFT: "neutral",
  TEST: "info",
  ACTIVE: "success",
  SUSPENDED: "warning",
  ARCHIVED: "neutral",
};

export function PublicationBadge({ status }: { status: PublicationStatus }) {
  return <Badge tone={PUBLICATION_TONES[status]}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

/** Le partenaire et la marque doivent être publiés (Test ou Actif) pour qu'une officine voie quoi que ce soit. */
export function isLive(status: PublicationStatus): boolean {
  return status === "TEST" || status === "ACTIVE";
}

export type StatusTargetKind = "brand" | "range" | "offer";

/** Ce que voient les officines une fois l'objet passé dans ce statut. */
export function publicationEffect(kind: StatusTargetKind, status: PublicationStatus, pilotCount: number | null): string {
  const pilot = pilotCount === null ? "le groupe pilote" : `le groupe pilote (${pilotCount} officine${pilotCount > 1 ? "s" : ""})`;
  const subject = kind === "brand" ? "La marque" : kind === "range" ? "La gamme" : "L'offre";
  const scope = kind === "brand" ? "les officines de l'audience choisie, au catalogue et au comptoir" : "les officines qui voient la marque";
  switch (status) {
    case "DRAFT":
      return `${subject} est retirée des officines et reste modifiable sans être vue.`;
    case "TEST":
      return `${subject} n'est visible que par ${pilot}, quelle que soit l'audience.`;
    case "ACTIVE":
      return `${subject} est visible par ${scope}, si le partenaire est lui-même publié.`;
    case "SUSPENDED":
      return `${subject} disparaît immédiatement de toutes les officines. L'historique (commandes, leads) est conservé.`;
    case "ARCHIVED":
      return `${subject} est retirée et rangée. Pour revenir, elle repasse par Brouillon : jamais directement en ligne.`;
  }
}
