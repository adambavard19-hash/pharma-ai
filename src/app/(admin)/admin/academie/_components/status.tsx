import { Badge } from "@/components/ui/badge";
import { REVIEW_STATUS_LABELS, onlineState, type ReviewStatusCode } from "@/core/academy/review";

/** L'état de relecture et l'état en ligne d'un contenu ou d'un parcours, en deux pastilles. */
export function ReviewBadge({ status }: { status: string }) {
  const tone = status === "APPROVED" ? "success" : status === "IN_REVIEW" ? "warning" : status === "REJECTED" ? "danger" : "neutral";
  return <Badge tone={tone}>{REVIEW_STATUS_LABELS[status as ReviewStatusCode] ?? status}</Badge>;
}

export function OnlineBadge({ item, now }: { item: { reviewStatus: string; publishedAt: Date | null; validUntil?: Date | null; isActive: boolean }; now: Date }) {
  const state = onlineState({ ...item, validUntil: item.validUntil ?? null }, now);
  if (state === "ONLINE") return <Badge tone="brand">En ligne</Badge>;
  if (state === "SCHEDULED") return <Badge tone="info">Programmé</Badge>;
  if (state === "EXPIRED") return <Badge tone="danger">Échu</Badge>;
  return null;
}
