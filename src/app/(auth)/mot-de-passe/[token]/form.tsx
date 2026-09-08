"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { setUserPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(setUserPasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Nouveau mot de passe" htmlFor="password" required>
        <Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Confirmez-le" htmlFor="confirm" required>
        <Input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <KeyRound className="size-[18px]" />}>
        Enregistrer et me connecter
      </Button>
    </form>
  );
}
