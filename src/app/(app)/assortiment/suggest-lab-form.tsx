"use client";

import { useState, useTransition } from "react";
import { suggestLabAction } from "@/server/actions/assortment";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Signaler un laboratoire à PharmaBoost : réservé au titulaire (la page le vérifie, l'action aussi). */
export function SuggestLabForm({ defaultNeed = "" }: { defaultNeed?: string }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const { push } = useToast();

  const submit = () =>
    start(async () => {
      const result = await suggestLabAction({ name, note, need: defaultNeed });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé") : result.error });
      if (result.ok) {
        setName("");
        setNote("");
      }
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field label="Laboratoire ou marque" htmlFor="lab-name" required>
        <Input id="lab-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Nom du laboratoire ou de la marque" />
      </Field>
      <Field label="Pourquoi (facultatif)" htmlFor="lab-note">
        <Textarea id="lab-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="Un besoin que vos produits ne couvrent pas, une gamme que vos patients demandent…" />
      </Field>
      <Button type="submit" loading={pending} disabled={name.trim().length < 2}>Signaler à PharmaBoost</Button>
    </form>
  );
}
