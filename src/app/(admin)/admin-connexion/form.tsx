"use client";

import { useActionState } from "react";
import Link from "next/link";
import { platformLoginAction } from "@/server/actions/platform";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(platformLoginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" placeholder="admin@pharma.ai" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••••••" />
      </div>

      <Button type="submit" size="lg" className="w-full" loading={pending} arrow>
        Se connecter
      </Button>

      <p className="text-center text-[13px]">
        <Link href="/admin-connexion/oubli" className="text-text-tertiary underline underline-offset-2 hover:text-text-secondary">
          Mot de passe oublié ou premier accès
        </Link>
      </p>
    </form>
  );
}
