import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "./delta-chip";
import type { DeltaView } from "./format";
import { Sparkline } from "./sparkline";

/**
 * Un chiffre clé : son nom, sa valeur en grand, sa variation face à la période
 * précédente (flèche, couleur et mots) et, dessous, sa mini-courbe.
 *
 * La carte ne calcule rien : la valeur arrive déjà écrite (`value`), la variation
 * déjà décrite (`delta`, voir `describeMetricDelta` / `describeRateDelta`).
 * `hint` s'écrit à côté de la variation (« vs hier », « sur 30 tranchés »).
 * `emphasis="brand"` met la carte en avant : une seule par rangée.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  spark,
  emphasis = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  delta: DeltaView | null;
  spark?: number[];
  emphasis?: "brand" | "default";
  icon?: ReactNode;
}) {
  const branded = emphasis === "brand";
  // Une mini-courbe d'un seul point ne dit rien : on ne la dessine pas.
  const showSpark = spark !== undefined && spark.length >= 2;

  return (
    <Card
      data-emphasis={emphasis}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden p-4 sm:p-5",
        branded && "border-brand-200 bg-gradient-to-br from-brand-50 to-surface-card dark:border-brand-800/60 dark:from-brand-950 dark:to-surface-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-4 font-medium text-text-secondary">{label}</p>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              branded ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300" : "bg-surface-sunken text-text-tertiary",
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-2 min-w-0 text-[clamp(1.25rem,5.5vw,1.6875rem)] leading-9 font-semibold tracking-[-0.02em] break-words tabular",
          branded ? "text-brand-800 dark:text-brand-200" : "text-text-primary",
        )}
      >
        {value}
      </p>

      {(delta || hint) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta && <DeltaBadge view={delta} />}
          {hint && <span className="text-[12px] text-text-tertiary">{hint}</span>}
        </div>
      )}

      {showSpark && (
        <div className="mt-auto pt-3">
          <Sparkline values={spark} tone={branded ? "brand" : "neutral"} ariaLabel={`Évolution de « ${label} » sur la période`} />
        </div>
      )}
    </Card>
  );
}
