"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { setSalesPasswordAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

const input = "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 focus:outline-none";

export function SetSalesPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(setSalesPasswordAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <p className="rounded-lg bg-danger-700/30 px-3.5 py-2.5 text-[13px] text-danger-200">{state.error}</p>}
      <div className="space-y-1.5"><label htmlFor="password" className="block text-[13px] font-medium text-white/80">Mot de passe</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className={input} /></div>
      <div className="space-y-1.5"><label htmlFor="confirm" className="block text-[13px] font-medium text-white/80">Confirmez-le</label><input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className={input} /></div>
      <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <KeyRound className="size-[18px]" />}>Enregistrer et entrer</Button>
    </form>
  );
}
