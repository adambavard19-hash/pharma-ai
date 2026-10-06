import { cn } from "@/lib/utils";
import { monotonePath, splitRuns, xPercent, yPercent, type Point } from "./chart-math";

/**
 * Une mini-courbe sans axe, pour dire « ça monte » ou « ça stagne » d'un coup
 * d'œil à côté d'un chiffre. Le zéro est toujours le bas de la courbe : une série
 * qui varie de 100 à 102 reste plate, elle ne devient pas une montagne.
 *
 * Les teintes sont celles du milieu de l'échelle, sans variante « dark: » : la
 * courbe reste lisible sur une carte claire comme sur un fond sombre.
 *
 * SVG pur, rendu côté serveur. Le trait est tracé dans un repère étiré
 * (`preserveAspectRatio="none"`) mais garde 2 px d'épaisseur ; le point final est un
 * élément HTML positionné en pourcentage pour rester parfaitement rond.
 */

const TONES = {
  brand: "text-brand-600",
  success: "text-success-600",
  neutral: "text-text-tertiary",
} as const;

export type SparklineGeometry = {
  /** Les tronçons continus (une valeur illisible coupe la courbe, elle ne vaut jamais zéro). */
  runs: { line: string; area: string }[];
  /** Le dernier point connu, en pourcentage de la largeur et de la hauteur. */
  end: { x: number; y: number } | null;
  max: number;
};

/** La géométrie, séparée du rendu pour être vérifiée sans navigateur. */
export function sparkGeometry(values: number[]): SparklineGeometry {
  const known = values.map((value) => (Number.isFinite(value) ? value : null));
  const max = Math.max(0, ...known.filter((value): value is number => value !== null));
  const count = known.length;
  const point = (index: number): Point => [xPercent(index, count), yPercent(known[index] ?? 0, max)];

  const runs = splitRuns(known)
    .filter((run) => run.indices.length >= 2)
    .map((run) => {
      const points = run.indices.map(point);
      const line = monotonePath(points);
      const first = points[0];
      const last = points[points.length - 1];
      const round = (value: number) => Math.round(value * 100) / 100;
      return { line, area: `${line} L ${round(last[0])} 100 L ${round(first[0])} 100 Z` };
    });

  let endIndex: number | null = null;
  for (let index = count - 1; index >= 0; index -= 1) {
    if (known[index] !== null) {
      endIndex = index;
      break;
    }
  }
  const end = endIndex === null ? null : { x: xPercent(endIndex, count), y: yPercent(known[endIndex] ?? 0, max) };
  return { runs, end, max };
}

export function Sparkline({
  values,
  tone = "brand",
  ariaLabel,
  className,
}: {
  values: number[];
  tone?: "brand" | "success" | "neutral";
  ariaLabel: string;
  className?: string;
}) {
  if (values.length === 0) return null;
  const { runs, end } = sparkGeometry(values);

  return (
    <div role="img" aria-label={ariaLabel} data-tone={tone} className={cn("relative h-10 w-full", TONES[tone], className)}>
      {/* Une marge de 5 px : le point final déborde de moitié sans être rogné. */}
      <div className="absolute inset-x-[5px] inset-y-[5px] motion-safe:animate-fade-in">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true" focusable="false">
          {runs.map((run, index) => (
            <g key={index}>
              <path d={run.area} fill="currentColor" fillOpacity={0.1} stroke="none" />
              <path d={run.line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        {end && (
          <span
            aria-hidden="true"
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface-card"
            style={{ left: `${end.x}%`, top: `${end.y}%` }}
          />
        )}
      </div>
    </div>
  );
}
