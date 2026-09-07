"use client";

import { useTransition } from "react";
import { Check, Power } from "lucide-react";
import { setClientPharmacyStatusAction } from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function StatusToggle({
  pharmacyId,
  isActive,
  size = "sm",
}: {
  pharmacyId: string;
  isActive: boolean;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  return (
    <Button
      variant={isActive ? "ghost" : "outline"}
      size={size}
      loading={pending}
      leadingIcon={isActive ? <Power className="size-4" /> : <Check className="size-4" />}
      onClick={() =>
        startTransition(async () => {
          const result = await setClientPharmacyStatusAction({
            pharmacyId,
            isActive: !isActive,
          });
          push({
            tone: result.ok ? "success" : "error",
            title: result.ok ? (result.message ?? "Enregistré") : result.error,
          });
        })
      }
    >
      {isActive ? "Suspendre" : "Réactiver"}
    </Button>
  );
}
