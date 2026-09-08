"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { requestSalesPasswordLinkAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

export function RequestSalesLinkForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(requestSalesPasswordLinkAction, null);
  if (state?.ok) return <p className="rounded-lg bg-success-700/30 px-3.5 py-3 text-[13.5px] leading-5 text-success-200">{state.message}</p>;
  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <p className="rounded-lg bg-danger-700/30 px-3.5 py-2.5 text-[13px] text-danger-200">{state.error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[13px] font-medium text-white/80">Adresse e-mail</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white focus:border-brand-400 focus:outline-none" />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <Send className="size-[18px]" />}>Envoyer le lien</Button>
    </form>
  );
}
