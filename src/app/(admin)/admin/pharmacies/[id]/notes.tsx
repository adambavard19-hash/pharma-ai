"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, StickyNote } from "lucide-react";
import { addAdminNoteAction, setAdminNotePinnedAction } from "@/server/actions/admin-notes";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const MAX = 2000;

/**
 * « Ajouter une note » : une note interne à l'équipe PharmaBoost, jamais
 * visible de l'officine ni des commerciaux.
 */
export function AddNoteButton({ pharmacyId, label = "Ajouter une note", variant = "secondary", size = "sm" }: { pharmacyId: string; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const length = body.trim().length;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await addAdminNoteAction({ pharmacyId, body });
      if (!result.ok) {
        setError(result.fieldErrors?.body ?? result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Note ajoutée." });
      setBody("");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} leadingIcon={<StickyNote className="size-4" />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Ajouter une note interne"
        description="Visible seulement de l'équipe PharmaBoost : ni l'officine ni les commerciaux ne la voient."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" onClick={submit} loading={pending} disabled={length < 2 || length > MAX}>
              Enregistrer la note
            </Button>
          </div>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-text-primary">Note</span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={MAX} placeholder="Appel du titulaire le…, point d'attention, engagement pris…" />
          <span className="flex justify-between gap-3 text-[12px] text-text-tertiary">
            <span>Aucune donnée de santé ni information sur un patient.</span>
            <span className="tabular-nums">
              {length} / {MAX}
            </span>
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-700/15 dark:text-danger-500">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}

/** Épingler une note : elle remonte en tête de la fiche et dans l'aperçu. */
export function NotePinButton({ noteId, pinned }: { noteId: string; pinned: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      loading={pending}
      leadingIcon={pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      onClick={() =>
        start(async () => {
          const result = await setAdminNotePinnedAction({ noteId, pinned: !pinned });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
          router.refresh();
        })
      }
    >
      {pinned ? "Désépingler" : "Épingler"}
    </Button>
  );
}
