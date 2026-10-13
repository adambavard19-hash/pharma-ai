"use client";

import { useActionState } from "react";
import { setSalesPasswordAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function SetSalesPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(setSalesPasswordAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <div className="space-y-1.5"><Label htmlFor="password">Mot de passe</Label><Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" /></div>
      <div className="space-y-1.5"><Label htmlFor="confirm">Confirmez-le</Label><Input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" /></div>
      <Button type="submit" size="lg" className="w-full" loading={pending} arrow>Enregistrer et entrer</Button>
    </form>
  );
}
