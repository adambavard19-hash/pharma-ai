"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { setPlatformPasswordAction } from "@/server/actions/platform";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

const inputClass =
  "w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(setPlatformPasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <p className="rounded-lg bg-danger-700/20 px-3.5 py-2.5 text-[13px] text-danger-500">{state.error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[13px] font-medium text-ink-200">
          Nouveau mot de passe
        </label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-[13px] font-medium text-ink-200">
          Confirmez-le
        </label>
        <input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <KeyRound className="size-[18px]" />}>
        Enregistrer et me connecter
      </Button>
    </form>
  );
}
