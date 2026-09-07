"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { STAGE_LABELS, streamAnalysis } from "./analysis-stream";
import type { AnalysisStage } from "@/server/services/analysis";

/**
 * Relance l'analyse avec les données à jour (stock, règles, profil patient).
 * Le résultat précédent est conservé : chaque exécution crée un nouvel
 * `AnalysisRun`, ce qui préserve l'historique.
 */
export function ReanalyseButton({ prescriptionId }: { prescriptionId: string }) {
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const router = useRouter();
  const { push } = useToast();

  return (
    <Button
      variant="outline"
      loading={pending}
      leadingIcon={<RefreshCw className="size-[18px]" />}
      onClick={() =>
        startTransition(async () => {
          const result = await streamAnalysis(prescriptionId, setStage);
          setStage(null);
          push({
            tone: result.ok ? "success" : "error",
            title: result.ok ? "Analyse relancée" : result.error,
            description: result.ok
              ? `${result.recommendationCount} proposition(s) · ${(result.durationMs / 1000).toFixed(1)} s`
              : undefined,
          });
          router.refresh();
        })
      }
    >
      {pending && stage ? STAGE_LABELS[stage] : "Relancer l'analyse"}
    </Button>
  );
}
