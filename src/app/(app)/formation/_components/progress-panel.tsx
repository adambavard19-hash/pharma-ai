"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, Play, RotateCcw } from "lucide-react";
import { setTrainingProgressAction } from "@/server/actions/training";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDateLong } from "@/lib/format";
import type { TrainingStatusCode } from "@/core/training/progress";
import { StatusBadge } from "./badges";

type ProgressChange = { status: TrainingStatusCode };

function useProgress(contentId: string) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const update = (change: ProgressChange, quiet = false) =>
    start(async () => {
      const result = await setTrainingProgressAction({ contentId, ...change });
      if (!result.ok) push({ tone: "error", title: result.error });
      else if (!quiet) push({ tone: "success", title: result.message ?? "Progression enregistrée." });
      router.refresh();
    });
  return { pending, update };
}

/** Où j'en suis sur ce contenu, et les deux gestes utiles : « Commencer », « Terminé ». */
export function ProgressPanel({ contentId, status, percent, completedAt }: { contentId: string; status: TrainingStatusCode; percent: number; completedAt: string | null }) {
  const { pending, update } = useProgress(contentId);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={status} />
        <span className="text-[12.5px] text-text-tertiary tabular">{percent} %</span>
      </div>
      <Progress value={percent} max={100} tone={status === "DONE" ? "success" : "brand"} label={`Avancée : ${percent} %`} />
      {status === "DONE" ? (
        <div className="space-y-2">
          <p className="text-[13px] text-text-secondary">{completedAt ? `Terminé le ${formatDateLong(completedAt)}.` : "Terminé."}</p>
          <Button variant="ghost" size="sm" loading={pending} leadingIcon={<RotateCcw className="size-3.5" />} onClick={() => update({ status: "IN_PROGRESS" })}>
            Reprendre
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "TODO" && (
            <Button loading={pending} leadingIcon={<Play className="size-4" />} onClick={() => update({ status: "IN_PROGRESS" })}>
              Commencer
            </Button>
          )}
          <Button variant={status === "TODO" ? "outline" : "success"} loading={pending} leadingIcon={<CircleCheck className="size-4" />} onClick={() => update({ status: "DONE" })}>
            Terminé
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Le bouton qui ouvre le contenu chez sa source, dans un nouvel onglet. Ouvrir
 * un contenu « à faire » le passe « en cours », sans clic de plus — sauf quand
 * la progression ne se suit pas (contenu désactivé, relu par le titulaire).
 */
export function OpenContentButton({ contentId, url, label, status, track = true }: { contentId: string; url: string; label: string; status: TrainingStatusCode; track?: boolean }) {
  const { update } = useProgress(contentId);
  return (
    <Button asChild size="lg" trailingIcon={<ExternalLink className="size-4" />}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (track && status === "TODO") update({ status: "IN_PROGRESS" }, true);
        }}
      >
        {label}
      </a>
    </Button>
  );
}
