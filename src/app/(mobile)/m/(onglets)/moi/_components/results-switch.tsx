"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Figures = { proposed: number; validated: number; rate: number | null };
const PERIODS = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
] as const;

/** Mes résultats : un sélecteur de période et trois chiffres. Rien d'autre que les miens. */
export function ResultsSwitch({ results }: { results: Record<(typeof PERIODS)[number]["key"], Figures> }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("month");
  const current = results[period];
  const rate = current.rate === null ? null : Math.round(current.rate * 100);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Période" className="grid grid-cols-3 gap-1 rounded-[14px] bg-ink-100/80 p-1">
        {PERIODS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={period === entry.key}
            onClick={() => setPeriod(entry.key)}
            className={cn(
              "min-h-11 rounded-[11px] text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              period === entry.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        <Figure label="Proposés" value={current.proposed} />
        <Figure label="Validés" value={current.validated} />
        <Figure label="Taux" value={rate === null ? "—" : `${rate} %`} emphasis />
      </div>
      {rate !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${rate}%` }} />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-3 text-center", emphasis ? "bg-brand-50 ring-1 ring-brand-100 ring-inset" : "bg-ink-50")}>
      <p className={cn("text-[24px] leading-none font-bold tracking-[-0.03em] tabular", emphasis ? "text-brand-800" : "text-ink-900")}>{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-text-tertiary">{label}</p>
    </div>
  );
}
