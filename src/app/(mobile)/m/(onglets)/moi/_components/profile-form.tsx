"use client";

import { Save } from "lucide-react";
import { updateMobileProfileAction } from "@/server/actions/mobile-account";
import type { Profession } from "@/core/mobile/profile";
import { FormError, MField, MInput, MSubmit, ProfessionPicker, useFormAction } from "../../../_components/fields";

type Defaults = { firstName: string; lastName: string; profession: Profession | null; rpps: string; pharmacyName: string };

export function ProfileForm({ defaults, isClientStaff }: { defaults: Defaults; isClientStaff: boolean }) {
  const { onSubmit, pending, error, fieldErrors: errors, message } = useFormAction(updateMobileProfileAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      {message && <p role="status" className="rounded-2xl bg-success-50 px-4 py-3 text-[13.5px] font-medium text-success-800">{message}</p>}
      <div className="grid grid-cols-2 gap-3">
        <MField label="Prénom" htmlFor="p-firstName" error={errors.firstName}>
          <MInput id="p-firstName" name="firstName" defaultValue={defaults.firstName} autoComplete="given-name" />
        </MField>
        <MField label="Nom" htmlFor="p-lastName" error={errors.lastName}>
          <MInput id="p-lastName" name="lastName" defaultValue={defaults.lastName} autoComplete="family-name" />
        </MField>
      </div>
      <ProfessionPicker name="profession" defaultValue={defaults.profession} error={errors.profession} />
      <MField label="Numéro RPPS" htmlFor="p-rpps" optional error={errors.rpps} hint={defaults.rpps ? "Déclaratif — non vérifié par PharmaBoost." : "11 chiffres, déclaratif : affiché « non vérifié »."}>
        <MInput id="p-rpps" name="rpps" defaultValue={defaults.rpps} inputMode="numeric" maxLength={14} />
      </MField>
      {!isClientStaff && (
        <MField label="Votre officine" htmlFor="p-pharmacyName" optional>
          <MInput id="p-pharmacyName" name="pharmacyName" defaultValue={defaults.pharmacyName} autoComplete="organization" />
        </MField>
      )}
      <MSubmit pending={pending} icon={<Save className="size-5" aria-hidden="true" />}>Enregistrer</MSubmit>
    </form>
  );
}
