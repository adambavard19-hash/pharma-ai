"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { setPartnerStatusAction } from "@/server/actions/platform-partners";
import { nextPublicationStatuses, PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { PublicationBadge, PUBLICATION_EFFECTS } from "../_components/publication-badge";

const MOVE_LABELS: Record<PublicationStatus, string> = {
  DRAFT: "Repasser en brouillon",
  TEST: "Passer en test",
  ACTIVE: "Activer",
  SUSPENDED: "Suspendre",
  ARCHIVED: "Archiver",
};

/**
 * Le statut de publication du partenaire. Chaque geste est confirmé avec son
 * effet côté officines : c'est ce statut qui ouvre ou ferme la diffusion de
 * toutes ses marques.
 */
export function PartnerStatusPanel({ id, status }: { id: string; status: PublicationStatus }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<PublicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = (to: PublicationStatus) =>
    start(async () => {
      setError(null);
      const result = await setPartnerStatusAction({ id, to });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTarget(null);
      push({ tone: "success", title: result.message ?? `Statut : ${PUBLICATION_STATUS_LABELS[to]}.` });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PublicationBadge status={status} />
      </div>
      <p className="text-[13px] leading-5 text-text-secondary">{PUBLICATION_EFFECTS[status]}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {target ? (
        <div className="space-y-2.5 rounded-lg border border-border-default bg-surface-sunken/60 p-3">
          <p className="text-[13px] font-medium text-text-primary">Passer en « {PUBLICATION_STATUS_LABELS[target]} » ?</p>
          <p className="text-[12.5px] leading-5 text-text-secondary">{PUBLICATION_EFFECTS[target]}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={target === "SUSPENDED" || target === "ARCHIVED" ? "danger" : "primary"} loading={pending} leadingIcon={<Check className="size-3.5" />} onClick={() => confirm(target)}>
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" leadingIcon={<X className="size-3.5" />} disabled={pending} onClick={() => setTarget(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {nextPublicationStatuses(status).map((to) => (
            <Button key={to} size="sm" variant={to === "ACTIVE" ? "primary" : "outline"} className={to === "SUSPENDED" || to === "ARCHIVED" ? "text-danger-700 dark:text-danger-500" : undefined} onClick={() => setTarget(to)}>
              {MOVE_LABELS[to]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
