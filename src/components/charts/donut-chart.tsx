import { cn } from "@/lib/utils";
import type { ChartFormatter } from "./types";

export type DonutSlice = { label: string; value: number };

const SLICE_COLORS = [
  "var(--color-brand-500)",
  "var(--color-accent-500)",
  "var(--color-info-500)",
  "var(--color-success-500)",
  "var(--color-brand-300)",
  "var(--color-ink-400)",
];

/**
 * Anneau de répartition. Les proportions sont également données en texte, pour
 * que l'information reste accessible sans percevoir les couleurs.
 */
export function DonutChart({
  slices,
  formatValue,
  centerLabel,
  centerValue,
  className,
  size = 168,
}: {
  slices: DonutSlice[];
  formatValue: ChartFormatter;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
  size?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <p className={cn("py-8 text-center text-[13px] text-text-tertiary", className)}>
        Aucune donnée sur la période
      </p>
    );
  }

  const radius = 60;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  // Le décalage cumulé est porté par l'accumulateur : aucune variable n'est
  // réassignée après le rendu.
  const arcs = slices.reduce<
    { label: string; value: number; color: string; dash: number; offset: number; percent: number }[]
  >((accumulator, slice, index) => {
    const fraction = slice.value / total;
    const consumed = accumulator.reduce((sum, arc) => sum + arc.percent, 0);

    accumulator.push({
      ...slice,
      color: SLICE_COLORS[index % SLICE_COLORS.length],
      dash: fraction * circumference,
      offset: -consumed * circumference,
      percent: fraction,
    });
    return accumulator;
  }, []);

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 160 160" className="size-full -rotate-90" role="img" aria-label="Répartition">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
            >
              <title>{`${arc.label} — ${formatValue(arc.value)}`}</title>
            </circle>
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="text-lg font-semibold tabular text-text-primary">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-[11px] text-text-tertiary">{centerLabel}</span>
            )}
          </div>
        )}
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: arc.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
              {arc.label}
            </span>
            <span className="shrink-0 text-[12.5px] tabular text-text-secondary">
              {formatValue(arc.value)}
            </span>
            <span className="w-11 shrink-0 text-right text-[12px] tabular text-text-tertiary">
              {(arc.percent * 100).toFixed(0)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
