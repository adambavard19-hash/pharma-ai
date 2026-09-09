"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, LogIn, Terminal } from "lucide-react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/server/actions/types";
import { INSTALL_HELP, type InstallState } from "@/core/install/types";

export function LoginForm({
  install,
  initialError,
}: {
  install: InstallState;
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(loginAction, initialError ? { ok: false, error: initialError } : null);

  const error = state && !state.ok ? state.error : null;
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Une installation incomplète est signalée AVANT la saisie : sans cela,
  // l'utilisateur croit à un mauvais mot de passe alors que la base est vide.
  if (install.status !== "READY") {
    const help = INSTALL_HELP[install.status];
    return (
      <div className="space-y-5">
        <Alert tone="warning" title={help.title}>
          {help.body}
          {install.status === "NO_DATABASE" && (
            <p className="mt-1.5 font-mono text-[11.5px] break-words opacity-80">
              {install.detail}
            </p>
          )}
        </Alert>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
            <Terminal className="size-3.5" />
            À lancer dans le terminal
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border-default bg-surface-sunken px-3.5 py-3 font-mono text-[12.5px] text-text-primary">
            {help.command}
          </pre>
          <p className="text-[12.5px] leading-5 text-text-secondary">
            Puis rechargez cette page. Pour un diagnostic complet de votre
            installation, lancez{" "}
            <code className="font-mono text-[12px]">npm run doctor</code>.
          </p>
        </div>
      </div>
    );
  }

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

        <p className="text-center text-[13px]">
          <Link href="/login/oubli" className="text-text-tertiary underline underline-offset-2 hover:text-text-secondary">
            Mot de passe oublié ou premier accès
          </Link>
        </p>
      </form>

      <p className="text-center text-[12px] leading-5 text-text-tertiary">
        PharmaBoost traite des données personnelles et potentiellement des données de
        santé. L&apos;accès est journalisé.
      </p>
    </div>
  );
}
