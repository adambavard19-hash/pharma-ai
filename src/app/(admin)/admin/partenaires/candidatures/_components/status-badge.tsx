import { Badge } from "@/components/ui/badge";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/core/partners/status";

const TONES: Record<ApplicationStatus, "info" | "neutral" | "brand" | "warning" | "success" | "danger"> = {
  NEW: "info",
  REVIEWING: "neutral",
  CONTACTED: "brand",
  NEGOTIATION: "warning",
  ACCEPTED: "success",
  REFUSED: "danger",
  ACTIVE_PARTNER: "success",
};

/** Le statut d'une candidature, avec sa couleur. */
export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={TONES[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}

/** En URL, le statut s'écrit en minuscules (`?statut=new`). */
export function statusParam(status: ApplicationStatus): string {
  return status.toLowerCase();
}
