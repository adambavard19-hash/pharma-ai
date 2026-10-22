"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markClaimedPharmacyAction } from "@/server/actions/patient-offers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** « Contactée » : la suite donnée par le commercial (appel, rendez-vous…), notée en une phrase. */
export function MarkClaimedButton({ claimKey }: { claimKey: string }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const note = window.prompt("Quelle suite ? (ex. « Appelée, rendez-vous le 30 »)", "Contactée");
        if (note === null) return;
        start(async () => {
          const result = await markClaimedPharmacyAction(claimKey, note);
          push(result.ok ? { tone: "success", title: result.message ?? "Suite notée." } : { tone: "error", title: result.error });
          router.refresh();
        });
      }}
    >
      Noter la suite
    </Button>
  );
}
