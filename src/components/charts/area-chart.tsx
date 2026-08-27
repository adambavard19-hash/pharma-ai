import { cn } from "@/lib/utils";
import type { ChartFormatter, SeriesPoint } from "./types";

/**
 * Courbe d'évolution en aires empilables, rendue en SVG pur.
 *
 * Aucun composant de graphique tiers : le rendu se fait côté serveur, sans
 * JavaScript client, ce qui garde les pages du comptoir immédiates. Le lissage
 * est un Catmull-Rom converti en courbes de Bézier — visuellement soigné, sans
 * dépassement au-dessus des points réels.
 */
export function AreaChart({
  data,
  height = 220,
  formatValue,
  primaryLabel,
  secondaryLabel,
  className,
  showSecondary = false,
}: {
  data: SeriesPoint[];
  height?: number;
  formatValue: ChartFormatter;
  primaryLabel: string;
  secondaryLabel?: string;
  className?: string;
  showSecondary?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border-default text-[13px] text-text-tertiary",
          className,
        )}
        style={{ height }}
      >
        Aucune donnée sur la période
      </div>
    );
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 28, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) =>
    showSecondary ? [d.value, d.secondaryValue ?? 0] : [d.value],
  );
  const rawMax = Math.max(...allValues, 0);
  const max = rawMax === 0 ? 1 : niceCeiling(rawMax);

  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const x = (index: number) =>
    padding.left + (data.length === 1 ? innerWidth / 2 : index * stepX);
  const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

  const primaryPath = smoothPath(data.map((d, i) => [x(i), y(d.value)]));
  const primaryArea = `${primaryPath} L ${x(data.length - 1)} ${padding.top + innerHeight} L ${x(0)} ${padding.top + innerHeight} Z`;
  const secondaryPath = showSecondary
    ? smoothPath(data.map((d, i) => [x(i), y(d.secondaryValue ?? 0)]))
    : null;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: max * ratio,
    y: padding.top + innerHeight - ratio * innerHeight,
  }));

  // Sur une série dense, on n'étiquette qu'un point sur N pour rester lisible.
  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="sr-only">
        {primaryLabel} — évolution sur {data.length} points, maximum{" "}
        {formatValue(rawMax)}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${primaryLabel} : évolution`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--border-subtle)"
              strokeWidth="1"
              strokeDasharray={tick.value === 0 ? undefined : "3 4"}
            />
            <text
              x={padding.left - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              className="fill-[var(--text-tertiary)] text-[10px] tabular"
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        <path d={primaryArea} fill="url(#areaPrimary)" />
        <path
          d={primaryPath}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {secondaryPath && (
          <path
            d={secondaryPath}
            fill="none"
            stroke="var(--color-accent-500)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {data.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r="2.75"
              fill="var(--surface-card)"
              stroke="var(--color-brand-600)"
              strokeWidth="1.75"
            />
            <title>{`${point.label} — ${formatValue(point.value)}`}</title>
          </g>
        ))}

        {data.map((point, index) =>
          index % labelStride === 0 || index === data.length - 1 ? (
            <text
              key={`label-${index}`}
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--text-tertiary)] text-[10px]"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-brand-600" />
          {primaryLabel}
        </span>
        {showSecondary && secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-accent-500" />
            {secondaryLabel}
          </span>
        )}
      </div>
    </figure>
  );
}

/** Arrondit la borne supérieure à une valeur « ronde » lisible. */
function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Catmull-Rom → Bézier cubique, tension 0,5. */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return path;
}
