"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, CheckCheck, RotateCcw } from "lucide-react";
import { decideDepositAction, retryDepositAction } from "@/server/actions/admin-stock-deposits";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { SEND_FAILED_MESSAGE } from "./status";

/**
 * Un fichier resté en attente (HELD) : il est bien plus petit que le stock
 * connu, donc le stock n'a pas bougé. Exactement trois gestes, chacun confirmé
 * avec sa conséquence écrite en clair (« Appliquer » modifie le stock de
 * l'officine).
 */
export function HeldActions({ id, fileName, pharmacyName }: { id: string; fileName: string; pharmacyName?: string }) {
  const where = pharmacyName ? `${fileName} · ${pharmacyName}` : fileName;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          label="Appliquer (stock complet)"
          icon={<CheckCheck className="size-3.5" />}
          variant="primary"
          title="Appliquer ce fichier comme stock complet ?"
          description={where}
          consequences={["Les produits du fichier sont mis à jour.", "Les produits absents du fichier passent à 0 en stock.", "Le stock de l'officine change tout de suite."]}
          confirmLabel="Appliquer le stock complet"
          successMessage="Stock appliqué."
          onConfirm={() => decideDepositAction({ id, decision: "APPLY_FULL" })}
        />
        <ConfirmAction
          label="Appliquer sans remettre à zéro"
          icon={<CheckCircle2 className="size-3.5" />}
          variant="outline"
          title="Appliquer sans remettre à zéro ?"
          description={where}
          consequences={["Les produits du fichier sont mis à jour.", "Les autres produits gardent leur quantité actuelle.", "Le stock de l'officine change tout de suite."]}
          confirmLabel="Appliquer sans remettre à zéro"
          successMessage="Stock appliqué, sans remise à zéro."
          onConfirm={() => decideDepositAction({ id, decision: "APPLY_PARTIAL" })}
        />
        <ConfirmAction
          label="Écarter"
          icon={<Ban className="size-3.5" />}
          variant="ghost"
          tone="danger"
          title="Écarter ce fichier ?"
          description={where}
          consequences={["Le stock de l'officine ne change pas.", "Le fichier n'est pas appliqué."]}
          confirmLabel="Écarter le fichier"
          successMessage="Fichier écarté."
          onConfirm={() => decideDepositAction({ id, decision: "REJECT" })}
        />
      </div>
      <p className="text-[12px] leading-5 text-text-tertiary">
        « Appliquer sans remettre à zéro » : à choisir si le fichier ne contient que les nouveautés.
      </p>
    </div>
  );
}

/**
 * Un fichier qui n'a pas pu être lu (FAILED), ou dont la lecture s'est arrêtée
 * en route (« en cours » depuis trop longtemps) : « Relancer » le relit depuis
 * le fichier gardé, sans rien redemander au titulaire. Une coupure pendant la
 * relance s'affiche sous le bouton : la page reste.
 */
export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const retry = () => {
    setError(null);
    start(async () => {
      let result: Awaited<ReturnType<typeof retryDepositAction>>;
      try {
        result = await retryDepositAction({ id });
      } catch {
        // Coupure réseau, délai dépassé : sans cela l'exception remonterait jusqu'à la frontière d'erreur et la page entière tomberait.
        setError(SEND_FAILED_MESSAGE);
        push({ tone: "error", title: SEND_FAILED_MESSAGE });
        return;
      }
      if (!result.ok) {
        setError(result.error);
        push({ tone: "error", title: result.error });
        return;
      }
      const deposit = result.data;
      // Le message vient de l'action : il dit si le stock est à jour ou si le fichier attend l'équipe.
      if (deposit.status === "FAILED") push({ tone: "error", title: result.message ?? "Le fichier ne passe toujours pas.", description: deposit.message ?? undefined });
      else push({ tone: deposit.status === "HELD" ? "warning" : "success", title: result.message ?? (deposit.status === "HELD" ? "Fichier relu, mais pas appliqué" : "Fichier relu, stock à jour") });
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="outline" leadingIcon={<RotateCcw className="size-3.5" />} loading={pending} onClick={retry}>
        Relancer
      </Button>
      {error && (
        <p className="text-[12.5px] text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
