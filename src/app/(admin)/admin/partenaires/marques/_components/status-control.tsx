"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { nextPublicationStatuses, PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";
import { setPartnerBrandStatusAction, setPartnerOfferStatusAction, setPartnerRangeStatusAction } from "@/server/actions/platform-partner-brands";
import { publicationEffect, type StatusTargetKind } from "./publication-badge";

/**
 * Les transitions de publication permises depuis le statut courant, chacune
 * avec son effet expliqué avant confirmation : publier, suspendre ou archiver
 * change immédiatement ce que voient les officines.
 */

export type StatusTarget = { kind: "brand"; id: string } | { kind: "range"; id: string; brandId: string } | { kind: "offer"; id: string };

const ACTION_LABELS: Record<StatusTargetKind, Record<PublicationStatus, string>> = {
  brand: { DRAFT: "Repasser en brouillon", TEST: "Passer en test", ACTIVE: "Publier", SUSPENDED: "Suspendre", ARCHIVED: "Archiver" },
  range: { DRAFT: "Repasser en brouillon", TEST: "Passer en test", ACTIVE: "Activer la gamme", SUSPENDED: "Suspendre", ARCHIVED: "Archiver" },
  offer: { DRAFT: "Repasser en brouillon", TEST: "Passer en test", ACTIVE: "Publier l'offre", SUSPENDED: "Suspendre", ARCHIVED: "Archiver" },
};

export function PublicationStatusControl({
  target,
  current,
  name,
  pilotCount = null,
  size = "sm",
}: {
  target: StatusTarget;
  current: PublicationStatus;
  name: string;
  pilotCount?: number | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const { push } = useToast();
  const [confirming, setConfirming] = useState<PublicationStatus | null>(null);
  const [pending, start] = useTransition();
  const next = nextPublicationStatuses(current);
  if (next.length === 0) return null;

  const run = (status: PublicationStatus) => {
    start(async () => {
      const result =
        target.kind === "brand"
          ? await setPartnerBrandStatusAction({ id: target.id, status })
          : target.kind === "range"
            ? await setPartnerRangeStatusAction({ id: target.id, brandId: target.brandId, status })
            : await setPartnerOfferStatusAction({ id: target.id, status });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Statut mis à jour.") : result.error });
      if (result.ok) {
        setConfirming(null);
        router.refresh();
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {next.map((status) => (
          <Button key={status} type="button" size={size} variant={status === "ACTIVE" ? "primary" : "outline"} onClick={() => setConfirming(status)}>
            {ACTION_LABELS[target.kind][status]}
          </Button>
        ))}
      </div>
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `${ACTION_LABELS[target.kind][confirming]} « ${name} » ?` : ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={() => confirming && run(confirming)}>
              Confirmer
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-2 text-[13.5px] leading-5 text-text-secondary">
            <p>
              {PUBLICATION_STATUS_LABELS[current]} → <span className="font-medium text-text-primary">{PUBLICATION_STATUS_LABELS[confirming]}</span>
            </p>
            <p>{publicationEffect(target.kind, confirming, pilotCount)}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
