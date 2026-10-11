import { Badge } from "@/components/ui/badge";
import { BILLING_STATUS_LABELS, CAMPAIGN_STATUS_LABELS, type BillingStatus, type CampaignStatus } from "@/core/sponsoring/campaign";

const CAMPAIGN_TONES: Record<CampaignStatus, "neutral" | "info" | "brand" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  IN_REVIEW: "info",
  APPROVED: "brand",
  ACTIVE: "success",
  PAUSED: "warning",
  ENDED: "neutral",
  REJECTED: "danger",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONES[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}

const BILLING_TONES: Record<BillingStatus, "neutral" | "info" | "warning" | "success"> = { QUOTE: "neutral", SIGNED: "info", INVOICED: "warning", PAID: "success" };

export function BillingBadge({ status }: { status: BillingStatus }) {
  return <Badge tone={BILLING_TONES[status]}>{BILLING_STATUS_LABELS[status]}</Badge>;
}

export function RegulatoryBadge({ validatedAt, validatedBy }: { validatedAt: Date | null; validatedBy: string | null }) {
  return validatedAt && validatedBy ? <Badge tone="success">Validée (réglementaire)</Badge> : <Badge tone="warning">Validation réglementaire à faire</Badge>;
}

const LAUNCH_TONES = { DRAFT: "neutral", IN_REVIEW: "info", APPROVED: "success", REJECTED: "danger", ARCHIVED: "neutral" } as const;
const LAUNCH_LABELS = { DRAFT: "Brouillon", IN_REVIEW: "En relecture", APPROVED: "Publiée", REJECTED: "Refusée", ARCHIVED: "Archivée" } as const;

export function LaunchStatusBadge({ status }: { status: keyof typeof LAUNCH_LABELS }) {
  return <Badge tone={LAUNCH_TONES[status]}>{LAUNCH_LABELS[status]}</Badge>;
}

export const LAUNCH_STATUS_LABELS = LAUNCH_LABELS;
