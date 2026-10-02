import { CircleCheck, CirclePlay, Clock, ExternalLink, FileDown, FileText, ListChecks, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDuration, TRAINING_KIND_LABELS, type TrainingKindCode } from "@/core/training/content";
import { TRAINING_STATUS_LABELS, type TrainingStatusCode } from "@/core/training/progress";

/** Pastilles partagées par le catalogue, le détail et les écrans de gestion. */

export const KIND_ICONS: Record<TrainingKindCode, LucideIcon> = {
  VIDEO: CirclePlay,
  SHEET: FileText,
  DOCUMENT: FileDown,
  EXTERNAL_LINK: ExternalLink,
  QUIZ: ListChecks,
};

export function KindBadge({ kind }: { kind: TrainingKindCode }) {
  const Icon = KIND_ICONS[kind];
  return (
    <Badge tone={kind === "QUIZ" ? "neutral" : "brand"} icon={<Icon className="size-3" aria-hidden="true" />}>
      {TRAINING_KIND_LABELS[kind]}
      {kind === "QUIZ" && " · bientôt"}
    </Badge>
  );
}

export function DurationBadge({ minutes }: { minutes: number | null }) {
  const label = formatDuration(minutes);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-text-tertiary tabular">
      <Clock className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

const STATUS_TONES = { TODO: "neutral", IN_PROGRESS: "info", DONE: "success" } as const;

export function StatusBadge({ status }: { status: TrainingStatusCode }) {
  return (
    <Badge tone={STATUS_TONES[status]} icon={status === "DONE" ? <CircleCheck className="size-3" aria-hidden="true" /> : undefined}>
      {TRAINING_STATUS_LABELS[status]}
    </Badge>
  );
}
