"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "Cette semaine" },
  { key: "month", label: "Ce mois" },
] as const;

/**
 * Le choix de la période, écrit dans l'URL.
 *
 * Rien n'est gardé en état local côté serveur : une période se partage, se met
 * en favori et survit au rechargement. Les bornes personnalisées voyagent en
 * clair (`du`/`au`), ce qui rend un écart de chiffres explicable — on voit sur
 * quoi il a été calculé.
 */
export function PeriodPicker({
  activeKey,
  from,
  to,
}: {
  activeKey: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(activeKey === "custom");
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `/pilotage?${query}` : "/pilotage", { scroll: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => {
              setOpen(false);
              go({ periode: preset.key, du: null, au: null });
            }}
            aria-pressed={activeKey === preset.key}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              activeKey === preset.key
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
            )}
          >
            {preset.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-pressed={activeKey === "custom"}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            activeKey === "custom"
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
          )}
        >
          <CalendarRange className="size-3.5" />
          Période personnalisée
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-card p-3.5">
          <label className="space-y-1">
            <span className="block text-[12px] font-medium text-text-secondary">Du</span>
            <input
              type="date"
              value={start}
              max={end || undefined}
              onChange={(event) => setStart(event.target.value)}
              className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-[13.5px] text-text-primary"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[12px] font-medium text-text-secondary">Au</span>
            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(event) => setEnd(event.target.value)}
              className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-[13.5px] text-text-primary"
            />
          </label>
          <Button
            size="sm"
            disabled={!start || !end}
            onClick={() => go({ periode: "custom", du: start, au: end })}
          >
            Afficher
          </Button>
        </div>
      )}
    </div>
  );
}
