"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellPlus, Check } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { completeFollowUpAction, setFollowUpAction } from "@/server/actions/admin-commercial";
import { parisDayInputToDate } from "@/core/sales/board";
import { ProspectPicker, type ProspectOption } from "../demonstrations/demo-dialog";

const LABEL_SUGGESTIONS = ["Rappeler", "Relancer par e-mail", "Envoyer la proposition", "Préparer le contrat", "Faire le point après la démo"];


/**
 * « Fixer une relance » : un dossier (imposé ou à choisir), une date, un
 * objet. Avec un commercial, la relance entre dans son agenda ; sans, elle
 * devient la prochaine action du dossier.
 */
export function FollowUpButton({
  defaultDue,
  prospects,
  fixedProspect,
  label = "Fixer une relance",
  variant = "primary",
  size = "md",
}: {
  /** Date proposée par défaut (« AAAA-MM-JJ »), calculée par le serveur. */
  defaultDue: string;
  prospects?: ProspectOption[];
  fixedProspect?: { id: string; name: string };
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} leadingIcon={<BellPlus className="size-4" />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <FollowUpDialog onClose={() => setOpen(false)} defaultDue={defaultDue} prospects={prospects} fixedProspect={fixedProspect} />}
    </>
  );
}

function FollowUpDialog({ onClose, defaultDue, prospects, fixedProspect }: { onClose: () => void; defaultDue: string; prospects?: ProspectOption[]; fixedProspect?: { id: string; name: string } }) {
  const [prospectId, setProspectId] = useState(fixedProspect?.id ?? "");
  const [due, setDue] = useState(defaultDue);
  const [text, setText] = useState("Rappeler");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const submit = () => {
    // Le jour choisi est un jour de Paris ; la relance y tombe à 9 h, heure de Paris, quel que soit le fuseau du navigateur.
    const dueAt = parisDayInputToDate(due)?.toISOString() ?? null;
    if (!prospectId) return setError("Choisissez le dossier.");
    if (!dueAt) return setError("Indiquez une date valide.");
    if (text.trim().length < 2) return setError("Indiquez l'objet de la relance.");
    setError(null);
    start(async () => {
      const result = await setFollowUpAction({ prospectId, dueAt, label: text.trim() });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Relance fixée." });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Fixer une relance"
      description={fixedProspect ? fixedProspect.name : "Avec un commercial, la relance entre dans son agenda ; sinon, elle devient la prochaine action du dossier."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button onClick={submit} loading={pending} leadingIcon={<BellPlus className="size-4" />}>Fixer la relance</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {!fixedProspect && prospects && (
          <Field label="Dossier" htmlFor="fu-prospect" required>
            <ProspectPicker id="fu-prospect" prospects={prospects} value={prospectId} onChange={setProspectId} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Échéance" htmlFor="fu-due" required hint="Jour de Paris, 9 h.">
            <Input id="fu-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Objet" htmlFor="fu-label" required>
            <Input id="fu-label" list="fu-label-suggestions" maxLength={160} value={text} onChange={(e) => setText(e.target.value)} />
            <datalist id="fu-label-suggestions">{LABEL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** « Faite » : une relance de l'agenda d'un commercial (`taskId`), ou la prochaine action d'un dossier sans relance (`prospectId`). */
export function FollowUpDoneButton({ taskId, prospectId, size = "sm" }: { taskId?: string | null; prospectId?: string | null; size?: ButtonProps["size"] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      variant="outline"
      size={size}
      loading={pending}
      leadingIcon={<Check className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await completeFollowUpAction(taskId ? { taskId } : { prospectId: prospectId ?? "" });
          push(result.ok ? { tone: "success", title: result.message ?? "Relance marquée faite." } : { tone: "error", title: result.error });
          if (result.ok) router.refresh();
        })
      }
    >
      Faite
    </Button>
  );
}
