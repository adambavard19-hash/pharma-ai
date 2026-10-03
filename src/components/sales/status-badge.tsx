import { Badge } from "@/components/ui/badge";
import { COMMISSION_STATUS_LABELS, CONTRACT_STATUS_LABELS, PROSPECT_STATUS_LABELS, PROSPECT_STATUS_TONES, type CommissionStatusCode, type ContractStatusCode, type ProspectStatusCode } from "@/core/sales/pipeline";
import { ORIGIN_LABELS } from "@/core/contracts/journey";
import { formatDate } from "@/lib/format";

export function ProspectStatusBadge({ status }: { status: string }) {
  const code = status as ProspectStatusCode;
  return <Badge tone={PROSPECT_STATUS_TONES[code] ?? "neutral"}>{PROSPECT_STATUS_LABELS[code] ?? status}</Badge>;
}

export function ContractStatusBadge({ status }: { status: string }) {
  const code = status as ContractStatusCode;
  const tone = code === "FINALIZED" ? "success" : code === "REFUSED" || code === "EXPIRED" ? "danger" : code === "DRAFT" ? "neutral" : "warning";
  return <Badge tone={tone}>{CONTRACT_STATUS_LABELS[code] ?? status}</Badge>;
}

export function CommissionStatusBadge({ status }: { status: string }) {
  const code = status as CommissionStatusCode;
  const tone = code === "PAID" ? "success" : code === "EARNED" || code === "PAYABLE" ? "brand" : code === "CANCELLED" ? "danger" : "neutral";
  return <Badge tone={tone}>{COMMISSION_STATUS_LABELS[code] ?? status}</Badge>;
}

/** La démonstration d'un dossier : réalisée, ou programmée à une date. Rien si aucune. */
export function DemoBadge({ demoAt, demoDoneAt }: { demoAt: Date | string | null | undefined; demoDoneAt: Date | string | null | undefined }) {
  if (demoDoneAt) return <Badge tone="success">Démo réalisée</Badge>;
  if (demoAt) return <Badge tone="brand">Démo le {formatDate(demoAt)}</Badge>;
  return null;
}

/** L'officine liée est en essai : jours restants, en orange à 7 jours ou moins. */
export function TrialBadge({ daysLeft }: { daysLeft: number | null | undefined }) {
  if (daysLeft === null || daysLeft === undefined) return null;
  return <Badge tone={daysLeft <= 7 ? "warning" : "info"}>Essai J-{daysLeft}</Badge>;
}

/** D'où vient le dossier : le site, la console ou un commercial. */
export function OriginBadge({ origin }: { origin: string }) {
  const tone = origin === "SELF_SERVICE_SITE" ? "info" : origin === "SUPER_ADMIN" ? "neutral" : "brand";
  return <Badge tone={tone}>{ORIGIN_LABELS[origin] ?? origin}</Badge>;
}
