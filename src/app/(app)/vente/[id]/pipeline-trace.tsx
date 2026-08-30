import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PipelineStageTrace } from "@/core/ai/types";

const STATUS_TONES: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  OK: "success",
  PARTIAL: "warning",
  BLOCKED: "danger",
  SKIPPED: "neutral",
};

/**
 * Trace du pipeline.
 *
 * Rend visible l'ordre d'exécution réel : sécurité d'abord, optimisation
 * commerciale en dernier. C'est l'élément qui permet à un pharmacien — ou à un
 * auditeur — de comprendre a posteriori comment une proposition a été produite.
 */
export function PipelineTrace({
  trace,
  engineVersion,
  durationMs,
  providers,
}: {
  trace: PipelineStageTrace[];
  engineVersion: string;
  durationMs: number | null;
  providers: Record<string, unknown>;
}) {
  const simulated = providers.simulated === true;

  // Niveau 3 : la traçabilité se consulte, elle ne se lit pas au comptoir.
  // Repliée par défaut, elle reste à un clic pour le pharmacien qui veut
  // comprendre — ou pour un auditeur, des mois plus tard.
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
          Comment l&apos;analyse s&apos;est déroulée
          <span className="tabular">
            — moteur v{engineVersion}
            {durationMs ? ` · ${durationMs} ms` : ""}
          </span>
        </summary>
      <CardContent className="space-y-3 pt-0">
        {simulated && (
          <Badge tone="accent">Fournisseurs simulés — extraction et explications fictives</Badge>
        )}

        <ol className="space-y-2.5">
          {trace.map((stage, index) => (
            <li key={`${stage.stage}-${index}`} className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[10.5px] font-semibold text-text-tertiary tabular">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12.5px] font-medium text-text-primary">{stage.label}</p>
                  <Badge tone={STATUS_TONES[stage.status] ?? "neutral"}>{stage.status}</Badge>
                </div>
                <p className="text-[11.5px] text-text-tertiary tabular">
                  {stage.inputCount} entrée(s) → {stage.outputCount} sortie(s) ·{" "}
                  {stage.durationMs} ms
                </p>
                {stage.notes.map((note) => (
                  <p key={note} className="text-[11.5px] leading-4 text-text-secondary">
                    {note}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <p className="border-t border-border-subtle pt-2.5 text-[11px] leading-4 text-text-tertiary">
          Les étapes s&apos;enchaînent dans cet ordre : chacune ne reçoit que la sortie de la
          précédente. Une considération commerciale ne peut donc pas influencer la sécurité ni
          la pertinence.
        </p>
      </CardContent>
      </details>
    </Card>
  );
}
