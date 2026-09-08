"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createProspectAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const PRESETS = [
  { label: "Dans 2 jours", days: 2 },
  { label: "Dans 1 semaine", days: 7 },
  { label: "Dans 2 semaines", days: 14 },
];

export function NewProspectForm() {
  const [values, setValues] = useState({ name: "", ownerName: "", phone: "", email: "", city: "", finessNumber: "", siret: "", notes: "", nextActionLabel: "Relancer" });
  const [nextActionAt, setNextActionAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [key]: e.target.value });
  const pickDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    setNextActionAt(d.toISOString().slice(0, 10));
  };
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createProspectAction({ ...values, nextActionAt: nextActionAt ? new Date(`${nextActionAt}T09:00:00`).toISOString() : null });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Dossier créé" });
      router.push(`/extranet/dossiers/${result.data.prospectId}`);
    });
  };
  return (
    <Card><CardContent className="space-y-4 py-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nom de la pharmacie" htmlFor="name" required><Input id="name" value={values.name} onChange={set("name")} placeholder="Pharmacie du Centre" autoFocus /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titulaire" htmlFor="ownerName"><Input id="ownerName" value={values.ownerName} onChange={set("ownerName")} placeholder="Prénom Nom" /></Field>
        <Field label="Ville" htmlFor="city"><Input id="city" value={values.city} onChange={set("city")} /></Field>
        <Field label="Téléphone" htmlFor="phone"><Input id="phone" type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} /></Field>
        <Field label="E-mail" htmlFor="email"><Input id="email" type="email" inputMode="email" value={values.email} onChange={set("email")} /></Field>
        <Field label="FINESS" htmlFor="finess" hint="Si connu"><Input id="finess" inputMode="numeric" value={values.finessNumber} onChange={set("finessNumber")} /></Field>
        <Field label="SIRET" htmlFor="siret" hint="Si connu"><Input id="siret" inputMode="numeric" value={values.siret} onChange={set("siret")} /></Field>
      </div>
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" rows={3} value={values.notes} onChange={set("notes")} placeholder="Contexte, interlocuteur, points d'attention…" /></Field>
      <Field label="Prochaine relance" htmlFor="nextActionAt">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => <button key={p.days} type="button" onClick={() => pickDays(p.days)} className="rounded-full border border-border-default px-3 py-1.5 text-[12.5px] text-text-secondary hover:border-brand-400 hover:text-text-primary">{p.label}</button>)}
          <Input id="nextActionAt" type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} className="max-w-[170px]" />
        </div>
      </Field>
      <Button size="lg" className="w-full sm:w-auto" onClick={submit} loading={pending} disabled={values.name.trim().length < 2} leadingIcon={<Check className="size-[18px]" />}>Créer le dossier</Button>
    </CardContent></Card>
  );
}
