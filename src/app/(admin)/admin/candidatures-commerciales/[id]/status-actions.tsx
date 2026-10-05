"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { moveSalesApplicationAction } from "@/server/actions/admin-sales-applications";
import { SALES_APPLICATION_STATUSES, SALES_APPLICATION_STATUS_LABELS, type SalesApplicationStatusKey } from "@/core/sales-applications/status";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

/** Le libellé du geste, selon le statut visé. */
function moveLabel(to: SalesApplicationStatusKey): string {
  switch (to) {
    case "NEW":
      return "Remettre en « Nouvelle »";
    case "TO_CONTACT":
      return "À contacter";
    case "INTERVIEW":
      return "Entretien";
    case "ACCEPTED":
      return "Accepter";
    case "REFUSED":
      return "Refuser";
  }
}

/**
 * Le statut d'une candidature : un bouton par statut possible. Le refus se
 * confirme (il se rouvre ensuite d'un clic). Une candidature déjà devenue
 * commercial ne change plus de statut.
 */
export function StatusActions({ id, status, locked }: { id: string; status: SalesApplicationStatusKey; locked: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<SalesApplicationStatusKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (locked) {
    return <p className="text-[13px] text-text-secondary">Cette candidature est devenue un commercial : son statut ne change plus.</p>;
  }

  const move = (to: SalesApplicationStatusKey) => {
    setBusy(to);
    setError(null);
    start(async () => {
      const result = await moveSalesApplicationAction({ id, to });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Statut mis à jour." });
      router.refresh();
    });
  };

  const targets = SALES_APPLICATION_STATUSES.filter((value) => value !== status);

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {targets.map((to) =>
          to === "REFUSED" ? (
            <ConfirmAction
              key={to}
              label={moveLabel(to)}
              icon={<Ban className="size-3.5" />}
              variant="outline"
              title="Refuser cette candidature ?"
              description="Le candidat n'est pas prévenu automatiquement. La candidature pourra être rouverte plus tard."
              confirmLabel="Refuser la candidature"
              tone="danger"
              disabled={pending}
              onConfirm={() => moveSalesApplicationAction({ id, to })}
            />
          ) : (
            <Button key={to} size="sm" variant={to === "ACCEPTED" ? "success" : "outline"} loading={pending && busy === to} disabled={pending} onClick={() => move(to)}>
              {moveLabel(to)}
            </Button>
          ),
        )}
      </div>
      <p className="text-[12.5px] text-text-tertiary">Statut actuel : {SALES_APPLICATION_STATUS_LABELS[status]}. Chaque changement est inscrit dans l&apos;historique.</p>
    </div>
  );
}
