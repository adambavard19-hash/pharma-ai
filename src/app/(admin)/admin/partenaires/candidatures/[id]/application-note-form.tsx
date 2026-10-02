"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { addApplicationNoteAction } from "@/server/actions/platform-partners";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Ajoute une note interne à l'historique de la candidature. */
export function ApplicationNoteForm({ id }: { id: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await addApplicationNoteAction({ id, note });
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
      <Field label="Note interne" htmlFor="application-note" hint="Visible de l'équipe PharmaBoost seulement, jamais du laboratoire ni des officines." error={error}>
        <Textarea id="application-note" rows={3} value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} placeholder="Échange téléphonique, point à vérifier…" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" leadingIcon={<StickyNote className="size-3.5" />} loading={pending} disabled={!note.trim()}>
          Ajouter la note
        </Button>
      </div>
    </form>
  );
}
