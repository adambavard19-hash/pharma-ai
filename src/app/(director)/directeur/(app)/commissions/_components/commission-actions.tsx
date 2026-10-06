"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Pencil, Wallet } from "lucide-react";
import { commissionGestureAction, commissionNoteAction } from "@/server/actions/director-money";
import { commissionGesturesFor } from "@/core/sales/director/money";
import type { CommissionStatusCode } from "@/core/sales/pipeline";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const NOTE_MAX = 500;

/** Modifier la note d'une commission : un petit crayon, une fenêtre. */
function NoteEditor({ id, note, officine }: { id: string; note: string | null; officine: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };
  const save = () =>
    start(async () => {
      setError(null);
      const result = await commissionNoteAction({ commissionId: id, note: text });
      if (!result.ok) {
        setError(result.fieldErrors?.note ?? result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Note enregistrée." });
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="px-2"
        aria-label={`Modifier la note de la commission ${officine}`}
        onClick={() => {
          setText(note ?? "");
          setOpen(true);
        }}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Note de la commission"
        description={officine}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button type="button" onClick={save} loading={pending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <Field label="Note" htmlFor={`commission-note-${id}`} hint="Visible de la direction et de l'équipe PharmaBoost. Le commercial ne la voit pas." error={error}>
          <Textarea id={`commission-note-${id}`} rows={4} maxLength={NOTE_MAX} value={text} onChange={(event) => setText(event.target.value)} placeholder="Prime, accord particulier, point à vérifier…" />
        </Field>
      </Modal>
    </>
  );
}

/**
 * Les gestes d'une commission, au plus deux boutons : le geste suivant
 * (« Valider », puis « Marquer payée ») et « Annuler ». Une commission réclamée
 * par une facture se règle par la facture : aucun geste ici. Le serveur
 * revérifie tout : ces boutons ne protègent que d'un clic malheureux.
 */
export function CommissionActions({ id, status, locked, officine, amountLabel, note }: { id: string; status: CommissionStatusCode; locked: boolean; officine: string; amountLabel: string; note: string | null }) {
  const gestures = locked ? [] : commissionGesturesFor(status);
  const validate = gestures.includes("VALIDATE");
  const pay = !validate && gestures.includes("PAY");
  const cancel = gestures.includes("CANCEL");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {validate && (
        <ConfirmAction
          label="Valider"
          icon={<Check className="size-3.5" />}
          variant="outline"
          title="Valider cette commission ?"
          description={`${officine} — ${amountLabel}`}
          confirmLabel="Valider"
          consequences={["Elle passe à « À payer ».", "Vous ne pourrez la remettre « Acquise » qu'en refusant une facture qui la réclame.", "Le commercial peut ensuite la facturer."]}
          onConfirm={() => commissionGestureAction({ commissionId: id, gesture: "VALIDATE" })}
        />
      )}
      {pay && (
        <ConfirmAction
          label="Marquer payée"
          icon={<Wallet className="size-3.5" />}
          variant="outline"
          title="Marquer cette commission payée ?"
          description={`${officine} — ${amountLabel}`}
          confirmLabel="Marquer payée"
          consequences={["La date de paiement est celle d'aujourd'hui.", "Le commercial en est informé dans son espace."]}
          onConfirm={() => commissionGestureAction({ commissionId: id, gesture: "PAY" })}
        />
      )}
      {cancel && (
        <ConfirmAction
          label="Annuler"
          icon={<Ban className="size-3.5" />}
          variant="ghost"
          tone="danger"
          title="Annuler cette commission ?"
          description={`${officine} — ${amountLabel}`}
          confirmLabel="Annuler la commission"
          consequences={["Elle n'est plus comptée dans les totaux du commercial.", "Le commercial en est informé, avec votre motif.", "Une commission annulée ne se rouvre pas depuis cet espace."]}
          reason={{ label: "Motif de l'annulation", placeholder: "Pourquoi cette commission est-elle annulée ?" }}
          onConfirm={(reason) => commissionGestureAction({ commissionId: id, gesture: "CANCEL", reason })}
        />
      )}
      <NoteEditor id={id} note={note} officine={officine} />
    </div>
  );
}
