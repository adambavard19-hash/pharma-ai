import { cn } from "@/lib/utils";
import type { ChartFormatter, SeriesPoint } from "./types";

/** Barres horizontales — classement lisible, adapté aux libellés longs. */
export function RankedBarChart({
  data,
  formatValue,
  className,
  tone = "brand",
  emptyLabel = "Aucune donnée",
  maxItems = 8,
}: {
  data: SeriesPoint[];
  formatValue: ChartFormatter;
  className?: string;
  tone?: "brand" | "accent" | "success";
  emptyLabel?: string;
  maxItems?: number;
}) {
  const items = data.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <p className={cn("py-8 text-center text-[13px] text-text-tertiary", className)}>
        {emptyLabel}
      </p>
    );
  }

  const max = Math.max(...items.map((d) => d.value), 1);
  const bars = {
    brand: "bg-brand-500",
    accent: "bg-accent-500",
    success: "bg-success-500",
  } as const;

  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-text-primary">
              {item.label}
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular text-text-secondary">
              {formatValue(item.value)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", bars[tone])}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Histogramme vertical compact (ex. répartition hebdomadaire). */
export function ColumnChart({
  data,
  formatValue,
  height = 160,
  className,
}: {
  data: SeriesPoint[];
  formatValue: ChartFormatter;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[13px] text-text-tertiary",
          className,
        )}
        style={{ height }}
      >
        Aucune donnée sur la période
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn("flex items-end gap-1.5", className)} style={{ height }}>
      {data.map((point, index) => {
        const ratio = point.value / max;
        return (
          <div key={`${point.label}-${index}`} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-[3px] bg-brand-400 transition-colors group-hover:bg-brand-600 dark:bg-brand-700 dark:group-hover:bg-brand-500"
                style={{ height: `${Math.max(2, ratio * 100)}%` }}
                title={`${point.label} — ${formatValue(point.value)}`}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-text-tertiary">
              {point.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
