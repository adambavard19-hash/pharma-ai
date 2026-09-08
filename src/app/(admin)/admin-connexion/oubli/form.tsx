"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { requestPlatformPasswordLinkAction } from "@/server/actions/platform";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

export function RequestLinkForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(requestPlatformPasswordLinkAction, null);

  if (state?.ok) {
    return <p className="rounded-lg bg-success-700/20 px-3.5 py-3 text-[13.5px] leading-5 text-success-300">{state.message}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <p className="rounded-lg bg-danger-700/20 px-3.5 py-2.5 text-[13px] text-danger-500">{state.error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[13px] font-medium text-ink-200">
          Adresse e-mail du compte
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <Send className="size-[18px]" />}>
        Envoyer le lien
      </Button>
    </form>
  );
}
