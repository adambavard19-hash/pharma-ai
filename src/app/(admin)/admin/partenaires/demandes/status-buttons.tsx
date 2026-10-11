"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInfoRequestStatusAction } from "@/server/actions/platform-sponsoring";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Marquer une demande transmise (à la main) ou traitée. */
export function InfoRequestButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const set = (to: string) =>
    start(async () => {
      const result = await setInfoRequestStatusAction({ id, status: to });
      if (!result.ok) push({ tone: "error", title: result.error });
      else {
        push({ tone: "success", title: result.message ?? "Mis à jour." });
        router.refresh();
      }
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "NEW" && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => set("TRANSMITTED")}>
          Transmise
        </Button>
      )}
      {status !== "HANDLED" && status !== "CANCELLED" && (
        <Button size="sm" variant="outline" loading={pending} onClick={() => set("HANDLED")}>
          Traitée
        </Button>
      )}
      {status !== "CANCELLED" && status !== "HANDLED" && (
        <Button size="sm" variant="ghost" loading={pending} onClick={() => set("CANCELLED")}>
          Annuler
        </Button>
      )}
    </div>
  );
}
