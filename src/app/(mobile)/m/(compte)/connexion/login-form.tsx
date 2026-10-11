"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { mobileLoginAction } from "@/server/actions/mobile-auth";
import { FormError, MField, MInput, MPasswordInput, MSubmit, useFormAction } from "../../_components/fields";

export function MobileLoginForm() {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(mobileLoginAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <MField label="Adresse e-mail" htmlFor="email" error={fieldErrors.email}>
        <MInput id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="prenom.nom@exemple.fr" required aria-invalid={Boolean(fieldErrors.email)} />
      </MField>
      <MField label="Mot de passe" htmlFor="password" error={fieldErrors.password}>
        <MPasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={Boolean(fieldErrors.password)} />
      </MField>
      <MSubmit pending={pending} icon={<LogIn className="size-5" aria-hidden="true" />}>Se connecter</MSubmit>
      <p className="text-center">
        <Link href="/login/oubli" className="inline-flex min-h-11 items-center text-[13.5px] font-medium text-brand-800 underline-offset-2 hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}
