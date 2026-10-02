import Link from "next/link";
import { Progress } from "@/components/ui/feedback";
import { universeLabel } from "@/config/universes";
import { brandDisplay, type TrainingKindCode } from "@/core/training/content";
import type { TrainingStatusCode } from "@/core/training/progress";
import { DurationBadge, KindBadge, StatusBadge } from "./badges";

export type TrainingCardData = {
  id: string;
  title: string;
  summary: string | null;
  kind: TrainingKindCode;
  laboratory: string | null;
  brandKey: string | null;
  universe: string | null;
  durationMinutes: number | null;
  isOwn: boolean;
  status: TrainingStatusCode;
  percent: number;
};

/** Une formation dans le catalogue : de quoi décider en un regard, un clic pour l'ouvrir. */
export function TrainingCard({ training }: { training: TrainingCardData }) {
  const origin = [training.laboratory ?? brandDisplay(training.brandKey), training.universe ? universeLabel(training.universe) : null].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/formation/${training.id}`}
      className="group flex h-full flex-col gap-2.5 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-xs transition-[border-color,box-shadow] hover:border-border-default hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={training.kind} />
        <DurationBadge minutes={training.durationMinutes} />
        {training.isOwn && <span className="text-[11.5px] font-medium text-text-tertiary">Votre officine</span>}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="line-clamp-2 text-[15px] leading-5 font-semibold tracking-[-0.01em] break-words text-text-primary group-hover:text-brand-700">{training.title}</h3>
        {origin && <p className="truncate text-[12.5px] text-text-tertiary">{origin}</p>}
      </div>
      {training.summary && <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{training.summary}</p>}
      <div className="mt-auto flex items-center gap-3 pt-1">
        {training.kind === "QUIZ" ? (
          <span className="text-[12.5px] text-text-tertiary">Bientôt disponible</span>
        ) : (
          <>
            <StatusBadge status={training.status} />
            {training.status === "IN_PROGRESS" && <Progress value={training.percent} max={100} className="flex-1" label={`Avancée : ${training.percent} %`} />}
          </>
        )}
      </div>
    </Link>
  );
}
