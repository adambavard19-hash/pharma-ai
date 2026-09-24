"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { resetCounterAction } from "@/server/actions/counter-scan";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * « Nouveau patient » : ferme la vente de la douchette en cours (ou toutes
 * celles de l'officine depuis l'accueil) et ramène à l'écran vierge. Le bip
 * suivant ouvre une nouvelle vente.
 */
export function CounterResetButton({ prescriptionId, size = "sm", label = "Nouveau patient" }: { prescriptionId?: string | null; size?: "sm" | "md"; label?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      size={size}
      variant="outline"
      loading={pending}
      leadingIcon={<UserRoundPlus className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await resetCounterAction({ prescriptionId: prescriptionId ?? null });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
          if (result.ok) router.push("/vente/nouvelle");
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
