"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { savePatientAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function PatientForm({
  patient,
}: {
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    sex: string;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    commercialNotes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ patientId: string }> | null,
    FormData
  >(savePatientAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/patients/${state.data.patientId}`);
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-5">
      {patient && <input type="hidden" name="id" value={patient.id} />}

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="firstName" required error={fieldErrors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={patient?.firstName}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Nom" htmlFor="lastName" required error={fieldErrors.lastName}>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={patient?.lastName}
            autoComplete="family-name"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de naissance" htmlFor="birthDate" error={fieldErrors.birthDate}>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={patient?.birthDate?.toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Sexe" htmlFor="sex">
          <Select id="sex" name="sex" defaultValue={patient?.sex ?? "UNSPECIFIED"}>
            <option value="UNSPECIFIED">Non renseigné</option>
            <option value="FEMALE">Féminin</option>
            <option value="MALE">Masculin</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Adresse e-mail"
          htmlFor="email"
          error={fieldErrors.email}
          hint="Nécessaire pour transmettre la fiche conseil par e-mail."
        >
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={patient?.email ?? ""}
            autoComplete="email"
          />
        </Field>
        <Field label="Téléphone" htmlFor="phone" error={fieldErrors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={patient?.phone ?? ""}
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="Adresse" htmlFor="addressLine1">
        <Input id="addressLine1" name="addressLine1" defaultValue={patient?.addressLine1 ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Code postal" htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" defaultValue={patient?.postalCode ?? ""} />
        </Field>
        <Field label="Ville" htmlFor="city">
          <Input id="city" name="city" defaultValue={patient?.city ?? ""} />
        </Field>
      </div>

      <Field
        label="Notes commerciales"
        htmlFor="commercialNotes"
        hint="Préférences d'achat, langue… Aucune information de santé ici : elle relève du profil de santé, chiffré."
      >
        <Textarea
          id="commercialNotes"
          name="commercialNotes"
          rows={3}
          defaultValue={patient?.commercialNotes ?? ""}
        />
      </Field>

      <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
        <Button
          type="submit"
          loading={pending}
          leadingIcon={<UserPlus className="size-[18px]" />}
        >
          {patient ? "Enregistrer les modifications" : "Créer le patient"}
        </Button>
      </div>
    </form>
  );
}
