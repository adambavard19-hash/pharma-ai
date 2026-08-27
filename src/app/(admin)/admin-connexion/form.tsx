"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { platformLoginAction } from "@/server/actions/platform";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/types";

export function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(platformLoginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok === false && (
        <p className="rounded-lg bg-danger-700/20 px-3.5 py-2.5 text-[13px] text-danger-500">
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[13px] font-medium text-ink-200">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          placeholder="admin@pharma.ai"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[13px] font-medium text-ink-200">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          placeholder="••••••••••••"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        leadingIcon={pending ? undefined : <LogIn className="size-[18px]" />}
      >
        Se connecter
      </Button>
    </form>
  );
}
