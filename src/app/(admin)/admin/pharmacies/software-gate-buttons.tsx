"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Unlock } from "lucide-react";
import { sendWelcomeAfterDemoAction, unlockSoftwareAction } from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Le logiciel attend le paiement : le fondateur peut le donner tout de suite (fondateur, 5 nov. 2026). */
export function UnlockSoftwareButton({ pharmacyId }: { pharmacyId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      leadingIcon={<Unlock className="size-3.5" />}
      onClick={() => {
        if (!window.confirm("Donner le logiciel maintenant, sans attendre le paiement ?")) return;
        start(async () => {
          const result = await unlockSoftwareAction({ pharmacyId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Débloqué.") : result.error });
          router.refresh();
        });
      }}
    >
      Débloquer le logiciel maintenant
    </Button>
  );
}

/** Après la démo : ouvrir l'espace du titulaire avant le contrat (il y signera, puis paiera). */
export function WelcomeAfterDemoButton({ prospectId }: { prospectId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      variant="outline"
      loading={pending}
      leadingIcon={<Mail className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await sendWelcomeAfterDemoAction({ prospectId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé.") : result.error });
          router.refresh();
        })
      }
    >
      Envoyer le lien de bienvenue (après la démo)
    </Button>
  );
}
