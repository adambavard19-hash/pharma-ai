"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { UniverseRow } from "@/core/performance/types";
import { formatCents, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RATE_NOTE, countOf, formatRate } from "./format";

/**
 * Les univers (catégories de produits) classés au choix par chiffre d'affaires
 * attribué ou par conseils acceptés. Les deux mesures n'ont pas la même
 * horloge — le chiffre d'affaires suit la date de la vente, les conseils leur
 * date de proposition — et la note sous la liste le redit à chaque bascule.
 */

type Measure = "revenue" | "accepted";

const MEASURES: { id: Measure; label: string; ranking: string; note: string }[] = [
  {
    id: "revenue",
    label: "Chiffre d'affaires",
    ranking: "Univers classés par chiffre d'affaires attribué",
    note: "Chiffre d'affaires TTC des ventes confirmées, compté à la date de la vente.",
  },
  {
    id: "accepted",
    label: "Conseils acceptés",
    ranking: "Univers classés par conseils acceptés",
    note: `Conseils retenus par l'équipe, comptés à la date où ils ont été proposés. Un conseil accepté n'est pas une vente. ${RATE_NOTE}`,
  },
];

/** Au-delà, on dit combien d'univers ne sont pas montrés plutôt que d'allonger la carte. */
const MAX_ROWS = 8;

const valueOf = (row: UniverseRow, measure: Measure) => (measure === "revenue" ? row.revenueTtcCents : row.accepted);

/** Du plus grand au plus petit ; à égalité, l'autre mesure, puis l'ordre alphabétique (un ordre stable d'un rechargement à l'autre). */
function ranked(universes: UniverseRow[], measure: Measure): UniverseRow[] {
  const other: Measure = measure === "revenue" ? "accepted" : "revenue";
  return [...universes].sort((a, b) => valueOf(b, measure) - valueOf(a, measure) || valueOf(b, other) - valueOf(a, other) || a.label.localeCompare(b.label, "fr"));
}

export function UniverseBars({ universes, className }: { universes: UniverseRow[]; className?: string }) {
  const hasRevenue = universes.some((row) => row.revenueTtcCents > 0);
  // Sans chiffre d'affaires, on ouvre sur les conseils acceptés : mieux qu'un graphique vide.
  const [measure, setMeasure] = useState<Measure>(() => (hasRevenue ? "revenue" : "accepted"));

  const current = MEASURES.find((candidate) => candidate.id === measure) ?? MEASURES[0];
  const rows = ranked(universes, measure);
  const max = rows.length > 0 ? valueOf(rows[0], measure) : 0;
  const shown = rows.filter((row) => valueOf(row, measure) > 0).slice(0, MAX_ROWS);
  const hidden = rows.filter((row) => valueOf(row, measure) > 0).length - shown.length;

  return (
    <Card className={className}>
      <CardHeader title="Par univers" description="Les catégories de produits où le conseil donne le plus." />
      <CardContent className="space-y-4">
        <div role="group" aria-label="Mesure affichée" className="inline-flex rounded-lg bg-surface-sunken p-0.5">
          {MEASURES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={measure === option.id}
              onClick={() => setMeasure(option.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12.5px] font-medium motion-safe:transition-colors",
                measure === option.id ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {current.ranking}
        </p>

        {shown.length === 0 ? (
          <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-[13px] leading-5 text-text-secondary">
            {universes.length === 0
              ? "Aucun conseil n'a été proposé sur cette période."
              : measure === "revenue"
                ? "Aucune vente confirmée au prix connu sur cette période : voyez les conseils acceptés."
                : "Aucun conseil accepté sur cette période."}
          </p>
        ) : (
          <ol className="space-y-3.5" aria-label={current.ranking}>
            {shown.map((row, index) => {
              const value = valueOf(row, measure);
              const width = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
              return (
                <li key={row.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] text-text-primary" title={row.label}>
                      {row.label}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-text-primary tabular">{measure === "revenue" ? formatCents(value) : formatNumber(value)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                    <div
                      className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500", index === 0 ? "bg-brand-500" : "bg-brand-300 dark:bg-brand-700")}
                      style={{ width: `${Math.round(width * 10) / 10}%` }}
                    />
                  </div>
                  {measure === "accepted" && (
                    <p className="mt-1 text-[12px] text-text-tertiary tabular">
                      {countOf(row.proposed, "conseil proposé", "conseils proposés")} · taux d&apos;acceptation {formatRate(row.acceptanceRate)}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {hidden > 0 && (
          <p className="text-[12px] text-text-tertiary">
            et {countOf(hidden, "autre univers", "autres univers")} {hidden > 1 ? "moins importants" : "moins important"}
          </p>
        )}
        <p className="text-[12px] leading-5 text-text-tertiary">{current.note}</p>
      </CardContent>
    </Card>
  );
}
