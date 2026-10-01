"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendInstallationGuideAction } from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Renvoie au titulaire les cinq étapes de mise en service, par e-mail. */
export function InstallGuideButton({ pharmacyId }: { pharmacyId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      leadingIcon={<Send className="size-3.5" />}
      onClick={() =>
        start(async () => {
          const result = await sendInstallationGuideAction({ pharmacyId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé.") : result.error });
          router.refresh();
        })
      }
    >
      Envoyer le guide d&apos;installation
    </Button>
  );
}
