"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCompanyProfileAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

type Values = { legalName: string; legalForm: string; addressLine1: string; postalCode: string; city: string; siren: string; representativeName: string; representativeTitle: string; representativeEmail: string };
const EMPTY: Values = { legalName: "", legalForm: "", addressLine1: "", postalCode: "", city: "", siren: "", representativeName: "", representativeTitle: "", representativeEmail: "" };

export function CompanyForm({ initial }: { initial: Values | null }) {
  const [values, setValues] = useState<Values>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: e.target.value });
  return (
    <Card><CardContent className="space-y-4 py-5">
      {!initial && <Alert tone="warning" title="Fiche non renseignée">Aucun contrat ne peut être généré tant que la société n&apos;est pas décrite ici.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dénomination" htmlFor="s-name" required><Input id="s-name" value={values.legalName} onChange={set("legalName")} placeholder="PharmaBoost SAS" /></Field>
        <Field label="Forme juridique" htmlFor="s-form"><Input id="s-form" value={values.legalForm} onChange={set("legalForm")} placeholder="SAS" /></Field>
        <Field label="Adresse" htmlFor="s-addr"><Input id="s-addr" value={values.addressLine1} onChange={set("addressLine1")} /></Field>
        <div className="grid grid-cols-[1fr_2fr] gap-3"><Field label="Code postal" htmlFor="s-cp"><Input id="s-cp" value={values.postalCode} onChange={set("postalCode")} /></Field><Field label="Ville" htmlFor="s-city"><Input id="s-city" value={values.city} onChange={set("city")} /></Field></div>
        <Field label="SIREN" htmlFor="s-siren"><Input id="s-siren" value={values.siren} onChange={set("siren")} /></Field>
        <Field label="Représentant (signataire)" htmlFor="s-rep" required><Input id="s-rep" value={values.representativeName} onChange={set("representativeName")} /></Field>
        <Field label="Qualité" htmlFor="s-title"><Input id="s-title" value={values.representativeTitle} onChange={set("representativeTitle")} placeholder="Président" /></Field>
        <Field label="E-mail du signataire" htmlFor="s-email" required><Input id="s-email" type="email" value={values.representativeEmail} onChange={set("representativeEmail")} /></Field>
      </div>
      <Button loading={pending} onClick={() => { setError(null); startTransition(async () => { const r = await saveCompanyProfileAction(values); if (!r.ok) return setError(r.error); push({ tone: "success", title: r.message ?? "Enregistré" }); router.refresh(); }); }}>Enregistrer</Button>
    </CardContent></Card>
  );
}
