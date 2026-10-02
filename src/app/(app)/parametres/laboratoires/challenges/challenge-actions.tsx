"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Flag, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { deleteChallengeAction, setChallengeStatusAction } from "@/server/actions/challenges";
import type { EffectiveStatus } from "@/core/challenges/progress";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * Le menu « … » d'un challenge : terminer, archiver, réactiver, supprimer.
 *
 * Terminer fige le challenge avant sa date de fin ; archiver le range hors de
 * la vue. Supprimer (avec confirmation) efface aussi les saisies : c'est pour
 * une erreur de saisie, l'archivage garde la trace.
 */
export function ChallengeActions({
  id,
  title,
  status,
  effectiveStatus,
  afterDelete,
}: {
  id: string;
  title: string;
  status: "ACTIVE" | "ENDED" | "ARCHIVED";
  effectiveStatus: EffectiveStatus;
  /** Où aller après suppression (depuis le détail) ; sinon on rafraîchit. */
  afterDelete?: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const setStatus = (next: "ACTIVE" | "ENDED" | "ARCHIVED") =>
    start(async () => {
      const result = await setChallengeStatusAction({ id, status: next });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const result = await deleteChallengeAction(id);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Supprimé.") : result.error });
      setConfirming(false);
      if (result.ok && afterDelete) router.push(afterDelete);
      else router.refresh();
    });

  return (
    <>
      <Dropdown
        triggerLabel={`Plus d'actions pour ${title}`}
        triggerClassName="inline-flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary disabled:opacity-50"
        trigger={<MoreHorizontal className="size-4" />}
      >
        {status === "ACTIVE" && effectiveStatus !== "ENDED" && (
          <DropdownItem icon={<Flag className="size-4" />} onClick={() => setStatus("ENDED")} disabled={pending}>
            Terminer maintenant
          </DropdownItem>
        )}
        {status !== "ACTIVE" && (
          <DropdownItem icon={<RotateCcw className="size-4" />} onClick={() => setStatus("ACTIVE")} disabled={pending}>
            Réactiver
          </DropdownItem>
        )}
        {status !== "ARCHIVED" && (
          <DropdownItem icon={<Archive className="size-4" />} onClick={() => setStatus("ARCHIVED")} disabled={pending}>
            Archiver
          </DropdownItem>
        )}
        <DropdownSeparator />
        <DropdownItem icon={<Trash2 className="size-4" />} destructive onClick={() => setConfirming(true)} disabled={pending}>
          Supprimer…
        </DropdownItem>
      </Dropdown>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Supprimer ce challenge ?"
        description={title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="danger" onClick={remove} loading={pending}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-5 text-text-secondary">
          Le challenge et ses saisies manuelles seront effacés. Les ventes, elles, restent intactes. Pour garder une trace,
          archivez-le plutôt.
        </p>
      </Modal>
    </>
  );
}
