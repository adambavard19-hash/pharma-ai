"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { MIN_CUSTOM_YEAR, PERIOD_OPTIONS } from "@/core/performance/periods";
import type { PerformancePeriod } from "@/core/performance/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { comparisonLabel, customRangeProblem, isoDateInTimeZone } from "./format";

/** Les quatre choix du cœur, avec la valeur écrite dans l'adresse (`?periode=…`) : une seule source, celle du parseur. */
type Choice = (typeof PERIOD_OPTIONS)[number];

const PERIOD_PARAMS = new Set(["periode", "du", "au"]);

/**
 * L'adresse d'une période. `preserveParams` (ex. `onglet=performance` sur la
 * fiche d'une officine) est conservé tel quel ; les trois paramètres de période
 * sont toujours réécrits, jamais hérités. Le chemin de base doit être interne
 * (un seul « / » au début) : on ne navigue jamais vers une adresse extérieure.
 */
export function buildPeriodHref(
  basePath: string,
  preserveParams: Record<string, string> | undefined,
  choice: { value: string; from?: string; to?: string },
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(preserveParams ?? {})) {
    if (!PERIOD_PARAMS.has(name)) params.set(name, value);
  }
  params.set("periode", choice.value);
  if (choice.from && choice.to) {
    params.set("du", choice.from);
    params.set("au", choice.to);
  }
  const safeBase = /^\/(?!\/)[^\s?#\\]*$/.test(basePath) ? basePath : "/";
  return `${safeBase}?${params.toString()}`;
}

/**
 * Le choix de la période, écrit dans l'adresse : une période se partage, se met
 * en favori et survit au rechargement. Quatre puces ; « Personnalisée » ouvre
 * deux dates, vérifiées AVANT le clic (une date à venir ou impossible se dit,
 * elle ne ramène pas en silence à « 7 jours »).
 */
export function PeriodBar({
  period,
  basePath,
  preserveParams,
}: {
  period: PerformancePeriod;
  basePath: string;
  preserveParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(period.key === "custom");
  const [from, setFrom] = useState(period.from ?? isoDateInTimeZone(period.start));
  const [to, setTo] = useState(period.to ?? isoDateInTimeZone(new Date(period.end.getTime() - 1)));
  const [error, setError] = useState<string | null>(null);

  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));

  const choose = (choice: Choice) => {
    setError(null);
    if (choice.key === "custom") {
      setOpen((value) => !value);
      return;
    }
    setOpen(false);
    go(buildPeriodHref(basePath, preserveParams, choice));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = customRangeProblem(from, to, isoDateInTimeZone(new Date()));
    setError(problem);
    if (problem) return;
    go(buildPeriodHref(basePath, preserveParams, { value: "perso", from, to }));
  };

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Choisir la période" className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((choice) => {
            const active = period.key === choice.key;
            const Icon = choice.key === "custom" ? CalendarRange : null;
            return (
              <button
                key={choice.key}
                type="button"
                aria-pressed={active}
                aria-expanded={choice.key === "custom" ? open : undefined}
                onClick={() => choose(choice)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-border-default bg-surface-card text-text-secondary hover:border-border-strong hover:text-text-primary",
                )}
              >
                {Icon && <Icon className="size-3.5" aria-hidden="true" />}
                {choice.label}
              </button>
            );
          })}
        </div>

        <p className={cn("text-[12.5px] leading-5 text-text-secondary transition-opacity", pending && "opacity-60 motion-reduce:transition-none")} aria-live="polite">
          <span className="font-medium text-text-primary">{period.label}</span>
          <span className="text-text-tertiary"> · variations {comparisonLabel(period.key)}</span>
          {pending && <span className="sr-only"> Mise à jour en cours</span>}
        </p>
      </div>

      {open && (
        <form onSubmit={submit} noValidate className="space-y-2.5 rounded-xl border border-border-subtle bg-surface-card p-3.5" aria-label="Période personnalisée">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <label className="min-w-0 space-y-1">
              <span className="block text-[12px] font-medium text-text-secondary">Du</span>
              <input
                type="date"
                name="du"
                min={`${MIN_CUSTOM_YEAR}-01-01`}
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-[12px] font-medium text-text-secondary">Au (inclus)</span>
              <input
                type="date"
                name="au"
                min={`${MIN_CUSTOM_YEAR}-01-01`}
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              />
            </label>
            <Button type="submit" size="sm" disabled={!from || !to || pending} className="col-span-2 sm:col-span-1">
              Afficher
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-[12.5px] leading-5 text-danger-700 dark:text-danger-500">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
