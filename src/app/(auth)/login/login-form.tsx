"use client";

import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { demoLoginAction, loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ROLE_LABELS, type Role } from "@/server/rbac/permissions";
import type { ActionResult } from "@/server/actions/types";

export function LoginForm({
  demoAccounts,
  initialError,
}: {
  demoAccounts: { email: string; name: string; role: string }[];
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(loginAction, initialError ? { ok: false, error: initialError } : null);

  const error = state && !state.ok ? state.error : null;
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {error && (
          <Alert tone="danger" icon={<AlertCircle className="size-[18px]" />}>
            {error}
          </Alert>
        )}

        <Field
          label="Adresse e-mail"
          htmlFor="email"
          required
          error={fieldErrors.email}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="prenom.nom@officine.fr"
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>

        <Field
          label="Mot de passe"
          htmlFor="password"
          required
          error={fieldErrors.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

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

      {demoAccounts.length > 0 && (
        <div className="space-y-3 rounded-xl border border-accent-200 bg-accent-50 p-4 dark:border-accent-800/60 dark:bg-accent-900/20">
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-accent-900 dark:text-accent-100">
              Mode démonstration
            </p>
            <p className="text-[12.5px] leading-5 text-accent-800 dark:text-accent-200">
              Officine, équipe, patients et ventes sont entièrement fictifs.
              Choisissez un profil pour découvrir l&apos;application.
            </p>
          </div>

          <div className="grid gap-1.5">
            {demoAccounts.map((account) => (
              <form key={account.email} action={demoLoginAction}>
                <input type="hidden" name="email" value={account.email} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-accent-200 bg-surface-card px-3 py-2 text-left transition-colors hover:border-accent-400 dark:border-accent-800/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-text-primary">
                      {account.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">
                      {account.email}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-800 dark:bg-accent-900/60 dark:text-accent-200">
                    {ROLE_LABELS[account.role as Role] ?? account.role}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-[12px] leading-5 text-text-tertiary">
        Pharma.ai traite des données personnelles et potentiellement des données de
        santé. L&apos;accès est journalisé.
      </p>
    </div>
  );
}
