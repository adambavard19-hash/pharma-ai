"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAdminNotificationsReadAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Marque toutes les notifications de l'équipe comme lues (geste réversible par nature : rien n'est effacé). */
export function MarkReadButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      leadingIcon={<CheckCheck className="size-4" />}
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await markAdminNotificationsReadAction();
          push(result.ok ? { tone: "success", title: result.message ?? "Notifications marquées comme lues." } : { tone: "error", title: result.error });
          router.refresh();
        })
      }
    >
      Tout marquer comme lu
    </Button>
  );
}
