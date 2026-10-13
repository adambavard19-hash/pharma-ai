"use client";

import { useActionState } from "react";
import { directorLoginAction } from "@/server/actions/director-auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function DirectorLoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(directorLoginAction, null);
  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} arrow>
        Se connecter
      </Button>
    </form>
  );
}
