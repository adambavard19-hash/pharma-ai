import { Badge } from "@/components/ui/badge";
import { EXPIRY_LEVEL_LABELS, type ExpiryLevel } from "@/core/stock/expiry";

const TONES: Record<ExpiryLevel, "danger" | "warning" | "info" | "neutral"> = {
  EXPIRED: "danger",
  URGENT: "warning",
  SOON: "info",
  OK: "neutral",
};

/** La pastille de niveau d'un lot : expiré, urgent, bientôt, lointain. */
export function ExpiryLevelBadge({ level }: { level: ExpiryLevel }) {
  return <Badge tone={TONES[level]}>{EXPIRY_LEVEL_LABELS[level]}</Badge>;
}
