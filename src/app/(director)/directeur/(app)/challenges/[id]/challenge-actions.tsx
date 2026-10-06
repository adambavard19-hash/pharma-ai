"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Trash2 } from "lucide-react";
import { deleteChallengeAction, endChallengeAction } from "@/server/actions/director-challenges";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Terminer un challenge en cours, maintenant : le décompte s'arrête. */
export function EndChallengeButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      label="Terminer maintenant"
      icon={<Flag className="size-3.5" />}
      variant="outline"
      title="Terminer ce challenge maintenant ?"
      description="Le challenge s'arrête à cet instant."
      consequences={["Ce que les commerciaux feront ensuite ne comptera plus : le décompte s'arrête maintenant.", "Les chiffres se recalculent sur les dossiers actuels : un dossier réaffecté déplace son crédit.", "Le challenge passe dans la liste des challenges terminés.", "Il ne pourra pas être rouvert."]}
      confirmLabel="Terminer le challenge"
      onConfirm={() => endChallengeAction({ id })}
    />
  );
}

/**
 * Supprimer un challenge, avec confirmation. Une fois supprimé, la fiche n'existe
 * plus : on retourne à la liste (la fenêtre de confirmation habituelle,
 * elle, recharge la fiche qu'on vient d'effacer).
 */
export function DeleteChallengeButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  const confirm = () =>
    start(async () => {
      setError(null);
      const result = await deleteChallengeAction({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Challenge supprimé." });
      router.replace("/directeur/challenges");
    });

  return (
    <>
      <Button type="button" variant="outline" size="sm" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setOpen(true)}>
        Supprimer
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Supprimer ce challenge ?"
        description={`« ${title} » sera supprimé définitivement.`}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" variant="danger" onClick={confirm} loading={pending}>
              Supprimer le challenge
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1.5 rounded-xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-5 text-text-primary">
            {["Le challenge disparaît de votre liste et de l'espace des commerciaux.", "Ses résultats ne sont plus consultables.", "Les notifications déjà envoyées restent chez les commerciaux."].map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-text-tertiary">
                  •
                </span>
                {line}
              </li>
            ))}
          </ul>
          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
