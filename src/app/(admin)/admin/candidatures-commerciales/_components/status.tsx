import { Badge } from "@/components/ui/badge";
import { SALES_APPLICATION_STATUSES, SALES_APPLICATION_STATUS_LABELS, SALES_APPLICATION_STATUS_TONES, type SalesApplicationStatusKey } from "@/core/sales-applications/status";

/** Le statut d'une candidature, avec sa couleur. */
export function SalesApplicationStatusBadge({ status }: { status: SalesApplicationStatusKey }) {
  return <Badge tone={SALES_APPLICATION_STATUS_TONES[status]}>{SALES_APPLICATION_STATUS_LABELS[status]}</Badge>;
}

/** En adresse, le statut s'écrit en français (`?statut=a-contacter`). */
const PARAMS: Record<SalesApplicationStatusKey, string> = {
  NEW: "nouvelle",
  TO_CONTACT: "a-contacter",
  INTERVIEW: "entretien",
  ACCEPTED: "acceptee",
  REFUSED: "refusee",
};

export function statusParam(status: SalesApplicationStatusKey): string {
  return PARAMS[status];
}

/** Le statut désigné par l'adresse ; une valeur inconnue ne filtre rien. */
export function statusFromParam(value: string | null | undefined): SalesApplicationStatusKey | null {
  return SALES_APPLICATION_STATUSES.find((status) => PARAMS[status] === value) ?? null;
}
