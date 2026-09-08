"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { salesLoginAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

const input = "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white placeholder:text-white/40 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 focus:outline-none";

export function SalesLoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(salesLoginAction, null);
  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && <p className="rounded-lg bg-danger-700/30 px-3.5 py-2.5 text-[13px] text-danger-200">{state.error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[13px] font-medium text-white/80">Adresse e-mail</label>
        <input id="email" name="email" type="email" required autoComplete="username" className={input} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[13px] font-medium text-white/80">Mot de passe</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={input} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <LogIn className="size-[18px]" />}>
        Se connecter
      </Button>
    </form>
  );
}
