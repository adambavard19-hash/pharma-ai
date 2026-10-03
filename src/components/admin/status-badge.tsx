import { Badge } from "@/components/ui/badge";
import type { StatusLabel } from "@/core/admin/statuses";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { CANCELLATION_STATUS_LABELS, dispatchStatusLabel, paymentStatusLabel, type CancellationStatusCode } from "@/core/admin/statuses";

/** Un statut, toujours avec sa couleur : identifiable d'un coup d'œil. */
export function StatusBadge({ status, className }: { status: StatusLabel; className?: string }) {
  return (
    <Badge tone={status.tone} className={className}>
      {status.label}
    </Badge>
  );
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  const label = SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatusCode] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge status={label} />;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={paymentStatusLabel(status)} />;
}

export function CancellationStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={CANCELLATION_STATUS_LABELS[status as CancellationStatusCode] ?? { label: status, tone: "neutral" }} />;
}

export function DispatchStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={dispatchStatusLabel(status)} />;
}
