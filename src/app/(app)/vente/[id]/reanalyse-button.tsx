"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { reanalysePrescriptionAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Relance l'analyse avec les données à jour (stock, règles, profil patient).
 * Le résultat précédent est conservé : chaque exécution crée un nouvel
 * `AnalysisRun`, ce qui préserve l'historique.
 */
export function ReanalyseButton({ prescriptionId }: { prescriptionId: string }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  return (
    <Button
      variant="outline"
      loading={pending}
      leadingIcon={<RefreshCw className="size-[18px]" />}
      onClick={() =>
        startTransition(async () => {
          const result = await reanalysePrescriptionAction(prescriptionId);
          push({
            tone: result.ok ? "success" : "error",
            title: result.ok
              ? (result.message ?? "Analyse relancée")
              : result.error,
            description: result.ok
              ? `${result.data.recommendationCount} conseil(s) proposé(s).`
              : undefined,
          });
        })
      }
    >
      Relancer l&apos;analyse
    </Button>
  );
}
