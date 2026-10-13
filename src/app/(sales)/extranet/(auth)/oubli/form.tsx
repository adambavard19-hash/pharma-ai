"use client";

import { useActionState } from "react";
import { requestSalesPasswordLinkAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function RequestSalesLinkForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(requestSalesPasswordLinkAction, null);
  if (state?.ok) return <Alert tone="success" role="status">{state.message}</Alert>;
  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} arrow>Envoyer le lien</Button>
    </form>
  );
}
