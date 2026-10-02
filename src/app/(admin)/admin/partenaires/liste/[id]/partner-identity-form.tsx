"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Save } from "lucide-react";
import { savePartnerIdentityAction } from "@/server/actions/platform-partners";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { UniversePicker } from "../_components/universe-picker";

export type PartnerIdentityValues = {
  id: string;
  name: string;
  legalName: string;
  website: string;
  logoUrl: string;
  description: string;
  universes: string[];
  startsAt: string;
  endsAt: string;
  notes: string;
};

/** L'identité du partenaire, éditable. Les notes internes ne sortent jamais de la console. */
export function PartnerIdentityForm({ initial }: { initial: PartnerIdentityValues }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const set = <K extends keyof PartnerIdentityValues>(key: K, value: PartnerIdentityValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const submit = () =>
    start(async () => {
      setError(null);
      setFieldErrors({});
      const result = await savePartnerIdentityAction(values);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Fiche enregistrée." });
      router.refresh();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nom affiché" htmlFor="pi-name" required error={fieldErrors.name}>
          <Input id="pi-name" value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={120} />
        </Field>
        <Field label="Raison sociale" htmlFor="pi-legal" error={fieldErrors.legalName}>
          <Input id="pi-legal" value={values.legalName} onChange={(event) => set("legalName", event.target.value)} maxLength={200} />
        </Field>
        <Field label="Site" htmlFor="pi-website" error={fieldErrors.website}>
          <Input id="pi-website" value={values.website} onChange={(event) => set("website", event.target.value)} placeholder="https://" inputMode="url" />
        </Field>
        <Field label="Logo (adresse https)" htmlFor="pi-logo" error={fieldErrors.logoUrl} hint="Un lien vers le logo publié par le partenaire.">
          <Input id="pi-logo" value={values.logoUrl} onChange={(event) => set("logoUrl", event.target.value)} placeholder="https://" inputMode="url" />
        </Field>
        <Field label="Début du partenariat" htmlFor="pi-starts" error={fieldErrors.startsAt}>
          <Input id="pi-starts" type="date" value={values.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
        </Field>
        <Field label="Fin du partenariat" htmlFor="pi-ends" error={fieldErrors.endsAt}>
          <Input id="pi-ends" type="date" value={values.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
        </Field>
      </div>
      <Field label="Présentation" htmlFor="pi-description" error={fieldErrors.description} hint="Texte factuel, sans superlatif.">
        <Textarea id="pi-description" rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={4000} />
      </Field>
      <Field label="Univers">
        <UniversePicker idPrefix="pi-universe" value={values.universes} onChange={(next) => set("universes", next)} />
      </Field>
      <div className="space-y-2 rounded-lg border border-dashed border-warning-500/50 bg-warning-50/50 p-3 dark:bg-warning-700/10">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning-700 dark:text-warning-500">
          <Lock className="size-3.5" aria-hidden="true" />
          Notes internes, jamais montrées aux officines
        </p>
        <Textarea id="pi-notes" aria-label="Notes internes" rows={3} value={values.notes} onChange={(event) => set("notes", event.target.value)} maxLength={8000} />
        {fieldErrors.notes && <p className="text-[12.5px] text-danger-600">{fieldErrors.notes}</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" leadingIcon={<Save className="size-4" />} loading={pending} disabled={!dirty || values.name.trim().length < 2}>
          Enregistrer la fiche
        </Button>
      </div>
    </form>
  );
}
