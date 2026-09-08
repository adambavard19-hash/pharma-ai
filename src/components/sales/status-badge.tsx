import { Badge } from "@/components/ui/badge";
import { COMMISSION_STATUS_LABELS, CONTRACT_STATUS_LABELS, PROSPECT_STATUS_LABELS, PROSPECT_STATUS_TONES, type CommissionStatusCode, type ContractStatusCode, type ProspectStatusCode } from "@/core/sales/pipeline";

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
