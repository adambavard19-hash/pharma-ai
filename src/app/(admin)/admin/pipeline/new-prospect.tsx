"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { adminCreateProspectAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

/**
 * Un dossier créé depuis la console : prospect, officine de démonstration ou
 * dossier en préparation. Aucun contrat ne part à la création : l'envoi est un
 * geste explicite, depuis la fiche (« Envoyer le contrat »).
 */
export function NewProspect({ reps }: { reps: { id: string; firstName: string; lastName: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", legalName: "", siret: "", addressLine1: "", postalCode: "", city: "", phone: "", ownerName: "", ownerTitle: "Pharmacien titulaire", email: "", notes: "", salesRepId: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  if (!open) return <Button leadingIcon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nouveau dossier</Button>;
  return (
    <Card>
      <CardHeader title="Nouveau dossier" description="Seul le nom est requis. Aucun contrat n'est envoyé à la création." />
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nom de la pharmacie" htmlFor="np-name" required error={fieldErrors.name}><Input id="np-name" value={form.name} onChange={set("name")} /></Field>
          <Field label="Raison sociale" htmlFor="np-legal"><Input id="np-legal" value={form.legalName} onChange={set("legalName")} /></Field>
          <Field label="SIRET" htmlFor="np-siret"><Input id="np-siret" inputMode="numeric" value={form.siret} onChange={set("siret")} /></Field>
          <Field label="Adresse" htmlFor="np-addr"><Input id="np-addr" value={form.addressLine1} onChange={set("addressLine1")} /></Field>
          <Field label="Code postal" htmlFor="np-cp"><Input id="np-cp" inputMode="numeric" value={form.postalCode} onChange={set("postalCode")} /></Field>
          <Field label="Ville" htmlFor="np-city"><Input id="np-city" value={form.city} onChange={set("city")} /></Field>
          <Field label="Signataire" htmlFor="np-owner"><Input id="np-owner" value={form.ownerName} onChange={set("ownerName")} placeholder="Prénom Nom" /></Field>
          <Field label="Qualité" htmlFor="np-title"><Input id="np-title" value={form.ownerTitle} onChange={set("ownerTitle")} /></Field>
          <Field label="E-mail du signataire" htmlFor="np-email" error={fieldErrors.email}><Input id="np-email" type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Téléphone" htmlFor="np-phone"><Input id="np-phone" type="tel" value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Commercial" htmlFor="np-rep"><Select id="np-rep" value={form.salesRepId} onChange={set("salesRepId")}><option value="">Aucun (console)</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}</Select></Field>
          <Field label="Note" htmlFor="np-notes"><Input id="np-notes" value={form.notes} onChange={set("notes")} placeholder="Démonstration, test, contexte…" /></Field>
        </div>
        <div className="flex gap-2">
          <Button loading={pending} disabled={form.name.trim().length < 2} onClick={() => start(async () => {
            setError(null);
            setFieldErrors({});
            const result = await adminCreateProspectAction(form);
            if (!result.ok) { setError(result.error); setFieldErrors(result.fieldErrors ?? {}); return; }
            router.push(`/admin/dossiers/${result.data.prospectId}`);
          })}>Créer le dossier</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
        </div>
      </CardContent>
    </Card>
  );
}
