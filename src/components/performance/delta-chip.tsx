import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import type { Metric, RateMetric } from "@/core/performance/types";
import { cn } from "@/lib/utils";
import { describeMetricDelta, describeRateDelta, type DeltaView } from "./format";

const TONES: Record<DeltaView["tone"], string> = {
  up: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500",
  down: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
  flat: "bg-surface-sunken text-text-secondary",
  none: "bg-surface-sunken text-text-tertiary",
  new: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
};

/** « Aucune variation » n'a pas d'icône : un tiret à côté du tiret du texte se lirait « — — ». */
const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus, none: null, new: Sparkles } as const;

/**
 * La pastille d'une variation déjà décrite (`DeltaView`) : une flèche, une couleur
 * et des mots — jamais la couleur seule. Vert pour une hausse, rouge pour une
 * baisse ; gris quand il n'y a rien à comparer (jamais de pourcentage sur une
 * base nulle). `comparison` (« vs hier ») s'écrit à côté et se lit à la suite.
 */
export function DeltaBadge({ view, comparison, className }: { view: DeltaView; comparison?: string; className?: string }) {
  const Icon = ICONS[view.tone];
  // Quand la phrase dit déjà « période précédente », la répéter donnerait « … vs la période précédente ».
  const spokenComparison = comparison && !/période précédente/i.test(view.spoken) ? ` ${comparison}` : "";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <span
        className={cn("inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 text-[12px] leading-4 font-medium tabular", Icon ? "pl-1.5" : "pl-2", TONES[view.tone])}
        data-trend={view.tone}
      >
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        <span aria-hidden="true">{view.text}</span>
        <span className="sr-only">
          {view.spoken}
          {spokenComparison}
        </span>
      </span>
      {comparison && (
        <span className="text-[12px] text-text-tertiary" aria-hidden="true">
          {comparison}
        </span>
      )}
    </span>
  );
}

/**
 * La variation face à la période précédente. On passe soit un nombre (`metric`),
 * soit un taux (`rate`, en points).
 */
export function DeltaChip({
  metric,
  rate,
  comparison,
  className,
}: {
  metric?: Metric;
  rate?: RateMetric;
  /** « vs hier » : ce à quoi on se compare, écrit à côté de la pastille. */
  comparison?: string;
  className?: string;
}) {
  const view = metric ? describeMetricDelta(metric) : rate ? describeRateDelta(rate) : null;
  if (!view) return null;
  return <DeltaBadge view={view} comparison={comparison} className={className} />;
}
