"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePharmacyInfoAction } from "@/server/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

type Info = { name: string; addressLine1: string; postalCode: string; city: string; phone: string; email: string; finessNumber: string };

export function PharmacyInfoForm({ initial }: { initial: Info }) {
  const [form, setForm] = useState<Info>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = (key: keyof Info) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          const result = await updatePharmacyInfoAction(form);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          push({ tone: "success", title: result.message ?? "Enregistré." });
          router.push("/bienvenue?etape=2");
        });
      }}
    >
      {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
      <Field label="Nom de l'officine" htmlFor="ob-name" required error={fieldErrors.name} className="sm:col-span-2"><Input id="ob-name" value={form.name} onChange={set("name")} /></Field>
      <Field label="Adresse" htmlFor="ob-addr" required error={fieldErrors.addressLine1} className="sm:col-span-2"><Input id="ob-addr" value={form.addressLine1} onChange={set("addressLine1")} autoComplete="street-address" /></Field>
      <Field label="Code postal" htmlFor="ob-cp" required error={fieldErrors.postalCode}><Input id="ob-cp" inputMode="numeric" value={form.postalCode} onChange={set("postalCode")} /></Field>
      <Field label="Ville" htmlFor="ob-city" required error={fieldErrors.city}><Input id="ob-city" value={form.city} onChange={set("city")} /></Field>
      <Field label="Téléphone" htmlFor="ob-phone" error={fieldErrors.phone}><Input id="ob-phone" type="tel" value={form.phone} onChange={set("phone")} /></Field>
      <Field label="E-mail de l'officine" htmlFor="ob-email" error={fieldErrors.email}><Input id="ob-email" type="email" value={form.email} onChange={set("email")} /></Field>
      <Field label="N° FINESS" htmlFor="ob-finess" error={fieldErrors.finessNumber}><Input id="ob-finess" value={form.finessNumber} onChange={set("finessNumber")} /></Field>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" loading={pending}>Enregistrer et continuer</Button>
      </div>
    </form>
  );
}
