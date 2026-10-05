"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { addSalesApplicationNoteAction } from "@/server/actions/admin-sales-applications";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Ajoute une note interne à l'historique de la candidature. */
export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await addSalesApplicationNoteAction({ id, note });
      if (!result.ok) {
        setError(result.fieldErrors?.note ?? result.error);
        return;
      }
      setNote("");
      push({ tone: "success", title: result.message ?? "Note ajoutée." });
      router.refresh();
    });

  return (
    <form
      className="space-y-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field label="Note interne" htmlFor="sales-application-note" hint="Visible de l'équipe PharmaBoost seulement, jamais du candidat." error={error}>
        <Textarea id="sales-application-note" rows={3} value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} placeholder="Appel passé, impression, point à vérifier…" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" leadingIcon={<StickyNote className="size-3.5" />} loading={pending} disabled={!note.trim()}>
          Ajouter la note
        </Button>
      </div>
    </form>
  );
}
