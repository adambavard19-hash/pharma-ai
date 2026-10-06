"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RECEIVE_POLL_MAX_MS, RECEIVE_POLL_MS, receiveState, receiveText, shouldPoll, type LatestDeposit } from "./view";
import { StepCard } from "./step-card";
import { cn } from "@/lib/utils";

/**
 * L'étape 3, et le statut en direct de l'envoi attendu.
 *
 * La page se rafraîchit seule toutes les dix secondes tant que le stock n'est
 * pas « à jour » : un fichier attendu, en cours de lecture, mais aussi un
 * fichier en vérification, illisible ou écarté — c'est justement après ceux-là
 * que le titulaire renvoie un fichier corrigé, ou que l'équipe l'applique, et
 * il doit le voir sans recharger. Elle s'arrête à « à jour », ou après trente
 * minutes. Pas de route à part : `router.refresh()` relit la page serveur, et
 * ce composant compare le dernier dépôt à celui qu'il connaissait à l'ouverture
 * (le dépôt ET son statut : un même fichier appliqué ensuite par l'équipe est
 * une nouveauté).
 */
export function ReceiveStep({ latest, folderReady }: { latest: LatestDeposit | null; folderReady: boolean }) {
  const router = useRouter();
  // Le dernier dépôt connu à l'ouverture : seul ce qui arrive après compte comme « l'envoi attendu ».
  const [baseline] = useState(latest);
  const [gaveUp, setGaveUp] = useState(false);
  const state = receiveState(baseline, latest);
  const polling = shouldPoll(state, { folderReady, gaveUp });

  useEffect(() => {
    if (!polling) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > RECEIVE_POLL_MAX_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      // Un onglet caché n'interroge pas : il se remet à jour au prochain tour visible.
      if (document.visibilityState === "visible") router.refresh();
    }, RECEIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [polling, router]);

  const text = receiveText(state, latest, { folderReady, gaveUp });
  const tone =
    state === "done"
      ? "text-success-700 dark:text-success-400"
      : state === "held" || state === "interrupted"
        ? "text-warning-800 dark:text-warning-400"
        : state === "failed"
          ? "text-danger-700 dark:text-danger-500"
          : "text-text-secondary";
  // La roue tourne tant qu'on attend vraiment quelque chose : plus quand la page a abandonné.
  const spinning = !gaveUp && (state === "reading" || (state === "waiting" && polling));

  return (
    <StepCard number={3} title="C'est tout : PharmaBoost lit le fichier dans la minute" done={state === "done"}>
      <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-[14.5px] leading-6 font-medium", tone)}>
        {spinning && <Loader2 className="size-4 shrink-0 animate-spin text-text-tertiary" aria-hidden="true" />}
        {text}
      </p>
    </StepCard>
  );
}
