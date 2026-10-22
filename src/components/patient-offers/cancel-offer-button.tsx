"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelLabOfferAction, cancelPharmacyOfferAction } from "@/server/actions/patient-offers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Arrêter une offre : les codes déjà donnés ne passent plus au comptoir. */
export function CancelOfferButton({ offerId, kind }: { offerId: string; kind: "pharmacy" | "lab" }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => start(async () => {
        if (!window.confirm("Arrêter cette offre ? Les codes déjà obtenus ne passeront plus au comptoir.")) return;
        const result = kind === "lab" ? await cancelLabOfferAction(offerId) : await cancelPharmacyOfferAction(offerId);
        push(result.ok ? { tone: "success", title: result.message ?? "Offre arrêtée." } : { tone: "error", title: result.error });
        router.refresh();
      })}
    >
      Arrêter
    </Button>
  );
}
