"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { deleteMyAccountAction } from "@/server/actions/mobile-account";
import { FormError, MField, MInput, MPasswordInput, MSubmit } from "../../../_components/fields";

/**
 * « Supprimer mon compte », dans l'application même (l'App Store et Google Play l'exigent). Replié par défaut ; une fois
 * ouvert : ce qui sera effacé, le mot de passe, le mot SUPPRIMER. La suppression faite, l'action renvoie à la connexion.
 */
export function DeleteAccountPanel() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccountAction({ password: String(data.get("password") ?? ""), confirmation: String(data.get("confirmation") ?? "") });
      if (result && !result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.fieldErrors ? null : result.error);
      }
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-ink-50">
        <span className="flex size-9 items-center justify-center rounded-xl bg-danger-50 text-danger-700"><Trash2 className="size-[18px]" aria-hidden="true" /></span>
        <span className="flex-1 text-[15px] font-medium text-danger-700">Supprimer mon compte</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold text-danger-700">Supprimer mon compte</p>
        <p className="text-[13px] leading-5 text-text-secondary">
          Votre compte est supprimé tout de suite, dans l&apos;application et au comptoir : adresse e-mail, téléphone, RPPS et mot de passe sont effacés, vos accès fermés. L&apos;historique de votre officine garde votre nom, sans aucun moyen de se connecter. Cette action est définitive.
        </p>
      </div>
      <FormError message={error} />
      <MField label="Votre mot de passe" htmlFor="delete-password" error={fieldErrors.password}>
        <MPasswordInput id="delete-password" name="password" autoComplete="current-password" />
      </MField>
      <MField label="Tapez SUPPRIMER pour confirmer" htmlFor="delete-confirmation" error={fieldErrors.confirmation}>
        <MInput id="delete-confirmation" name="confirmation" autoComplete="off" autoCapitalize="characters" />
      </MField>
      <div className="flex flex-col gap-2">
        <MSubmit pending={pending} icon={<Trash2 className="size-5" aria-hidden="true" />} className="bg-none bg-danger-600">Supprimer définitivement</MSubmit>
        <button type="button" onClick={() => { setOpen(false); setError(null); setFieldErrors({}); }} className="min-h-11 rounded-[14px] text-[15px] font-medium text-ink-700 active:bg-ink-50">Annuler</button>
      </div>
    </form>
  );
}
