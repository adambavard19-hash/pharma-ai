"use client";

import { useState, useTransition, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { changeMyPasswordAction } from "@/server/actions/mobile-account";
import { FormError, MField, MPasswordInput, MSubmit } from "../../../_components/fields";

/** Le même changement de mot de passe que le comptoir : ancien mot de passe exigé, autres sessions fermées. */
export function PasswordPanel() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await changeMyPasswordAction({ currentPassword: String(data.get("currentPassword") ?? ""), newPassword: String(data.get("newPassword") ?? "") });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.fieldErrors ? null : result.error);
        return;
      }
      setFieldErrors({});
      setDone(true);
      form.reset();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[20px] bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] sm:p-5" noValidate>
      <FormError message={error} />
      {done && <p role="status" className="rounded-2xl bg-success-50 px-4 py-3 text-[13.5px] font-medium text-success-800">Mot de passe modifié. Vos autres appareils ont été déconnectés.</p>}
      <MField label="Mot de passe actuel" htmlFor="currentPassword" error={fieldErrors.currentPassword}>
        <MPasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
      </MField>
      <MField label="Nouveau mot de passe" htmlFor="newPassword" error={fieldErrors.newPassword} hint="12 caractères au moins, avec une majuscule, une minuscule et un chiffre.">
        <MPasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
      </MField>
      <MSubmit pending={pending} icon={<KeyRound className="size-5" aria-hidden="true" />}>Changer le mot de passe</MSubmit>
    </form>
  );
}
