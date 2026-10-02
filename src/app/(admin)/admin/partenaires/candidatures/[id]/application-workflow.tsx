"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, X } from "lucide-react";
import { createPartnerFromApplicationAction, moveApplicationAction } from "@/server/actions/platform-partners";
import { APPLICATION_STATUS_LABELS, canMoveApplication, nextApplicationStatuses, type ApplicationStatus } from "@/core/partners/status";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

/** Le libellé du geste, selon d'où l'on part. */
function moveLabel(from: ApplicationStatus, to: ApplicationStatus): string {
  switch (to) {
    case "REVIEWING":
      return from === "REFUSED" ? "Rouvrir (en étude)" : from === "NEW" ? "Passer en étude" : "Repasser en étude";
    case "CONTACTED":
      return from === "NEGOTIATION" ? "Revenir à « Contacté »" : "Marquer contacté";
    case "NEGOTIATION":
      return from === "ACCEPTED" ? "Revenir en négociation" : "Passer en négociation";
    case "ACCEPTED":
      return "Accepter";
    case "REFUSED":
      return "Refuser";
    case "ACTIVE_PARTNER":
      return "Passer en « Partenaire actif »";
    default:
      return APPLICATION_STATUS_LABELS[to];
  }
}

/** Gestes qui méritent une confirmation : un refus, et l'étape finale (sans retour). */
const CONFIRM: ApplicationStatus[] = ["REFUSED", "ACTIVE_PARTNER"];

export function ApplicationWorkflow({ id, status, partner }: { id: string; status: ApplicationStatus; partner: { id: string; name: string } | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targets = nextApplicationStatuses(status);
  const hasPartner = partner !== null;

  const move = (to: ApplicationStatus) => {
    setBusy(to);
    setError(null);
    start(async () => {
      const result = await moveApplicationAction({ id, to });
      setBusy(null);
      setConfirming(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Statut mis à jour." });
      router.refresh();
    });
  };

  const createPartner = () => {
    setBusy("partner");
    setError(null);
    start(async () => {
      const result = await createPartnerFromApplicationAction({ id });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Fiche partenaire créée." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {targets.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Étape finale : la candidature a abouti. La suite se gère depuis la fiche partenaire.</p>
      ) : confirming ? (
        <div className="space-y-2.5 rounded-lg border border-border-default bg-surface-sunken/60 p-3">
          <p className="text-[13px] text-text-primary">
            {confirming === "REFUSED"
              ? "Refuser cette candidature ? Elle pourra être rouverte plus tard."
              : "Passer en « Partenaire actif » ? C'est l'étape finale de la candidature. Le partenaire reste dans son statut de publication actuel : rien n'est diffusé aux officines."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={confirming === "REFUSED" ? "danger" : "primary"} loading={pending && busy === confirming} leadingIcon={<Check className="size-3.5" />} onClick={() => move(confirming)}>
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" leadingIcon={<X className="size-3.5" />} onClick={() => setConfirming(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {targets.map((to) => {
            const allowed = canMoveApplication(status, to, hasPartner);
            return (
              <Button
                key={to}
                size="sm"
                variant={to === "ACCEPTED" ? "success" : to === "ACTIVE_PARTNER" ? "primary" : "outline"}
                className={to === "REFUSED" ? "text-danger-700 dark:text-danger-500" : undefined}
                disabled={!allowed || pending}
                loading={pending && busy === to}
                title={!allowed && to === "ACTIVE_PARTNER" ? "Créez d'abord la fiche partenaire." : undefined}
                onClick={() => (CONFIRM.includes(to) ? setConfirming(to) : move(to))}
              >
                {moveLabel(status, to)}
              </Button>
            );
          })}
        </div>
      )}

      {status === "ACCEPTED" && !hasPartner && (
        <div className="space-y-2 rounded-lg border border-border-subtle p-3">
          <p className="text-[13px] text-text-secondary">
            Candidature acceptée : créez la fiche partenaire pour pouvoir la passer en « Partenaire actif ». La fiche naît en brouillon, invisible des officines, avec le contact de la candidature comme contact principal.
          </p>
          <Button size="sm" leadingIcon={<Building2 className="size-3.5" />} loading={pending && busy === "partner"} disabled={pending} onClick={createPartner}>
            Créer la fiche partenaire
          </Button>
        </div>
      )}

      {partner && (
        <p className="text-[13px] text-text-secondary">
          Fiche partenaire :{" "}
          <Link href={`/admin/partenaires/liste/${partner.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            {partner.name}
          </Link>
        </p>
      )}
    </div>
  );
}
