"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { RANGE_CHIPS } from "@/core/counter/sales-report";
import { cn } from "@/lib/utils";

/**
 * Le choix de la période du rapport : aujourd'hui, hier, cette semaine, ce mois-ci, 7 et 30 derniers jours, ou un jour /
 * un mois précis. Tout passe par l'adresse (`?periode=…`) : le PDF et la liste suivent la même période.
 */
export function PeriodPicker({ current, hrefFor, today }: { current: string; hrefFor: Record<string, string> & { base: string }; today: string }) {
  const router = useRouter();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(current) ? current : "";
  const month = /^\d{4}-\d{2}$/.test(current) ? current : "";
  const go = (value: string) => {
    if (!value) return;
    const url = new URL(hrefFor.base, window.location.origin);
    url.searchParams.set("periode", value);
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-periode={current}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Période">
        {RANGE_CHIPS.map((chip) => (
          <Link
            key={chip.param}
            href={hrefFor[chip.param] ?? hrefFor.base}
            scroll={false}
            aria-current={current === chip.param ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              current === chip.param ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary",
            )}
          >
            {chip.label}
          </Link>
        ))}
      </div>
      <label className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px]", day ? "border-brand-600 text-text-primary" : "border-border-default text-text-secondary")}>
        <CalendarDays className="size-4 text-text-tertiary" aria-hidden="true" />
        <span className="sr-only">Un jour précis</span>
        <input type="date" value={day} max={today} onChange={(event) => go(event.target.value)} className="bg-transparent text-[13px] outline-none" aria-label="Choisir un jour" data-periode-jour="" />
      </label>
      <label className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px]", month ? "border-brand-600 text-text-primary" : "border-border-default text-text-secondary")}>
        <span className="sr-only">Un mois précis</span>
        <input type="month" value={month} max={today.slice(0, 7)} onChange={(event) => go(event.target.value)} className="bg-transparent text-[13px] outline-none" aria-label="Choisir un mois" data-periode-mois="" />
      </label>
    </div>
  );
}
