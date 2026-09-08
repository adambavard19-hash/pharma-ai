"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { requestUserPasswordLinkAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";

export function RequestLinkForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(requestUserPasswordLinkAction, null);

  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Adresse e-mail" htmlFor="email" required>
        <Input id="email" name="email" type="email" required autoComplete="username" autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <Send className="size-[18px]" />}>
        Envoyer le lien
      </Button>
    </form>
  );
}
