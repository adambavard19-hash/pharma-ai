import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import type { ReactNode } from "react";

/**
 * Indicateur clé. `emphasis="accent"` est réservé au chiffre d'affaires
 * généré grâce à Pharma.ai : c'est la métrique que le titulaire doit voir en
 * premier.
 */
export function StatCard({
  label,
  value,
  sublabel,
  delta,
  icon,
  emphasis = "default",
  footer,
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  /** Variation en points de pourcentage. `null` = non comparable. */
  delta?: number | null;
  icon?: ReactNode;
  emphasis?: "default" | "accent" | "brand";
  footer?: ReactNode;
  className?: string;
}) {
  const accented = emphasis === "accent";
  const branded = emphasis === "brand";

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-5",
        accented &&
          "border-accent-200 bg-gradient-to-br from-accent-50 to-surface-card dark:border-accent-800/60 dark:from-accent-900/20 dark:to-surface-card",
        branded &&
          "border-brand-200 bg-gradient-to-br from-brand-50 to-surface-card dark:border-brand-800/60 dark:from-brand-950 dark:to-surface-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-4 font-medium text-text-secondary">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              accented
                ? "bg-accent-100 text-accent-700 dark:bg-accent-900/50 dark:text-accent-300"
                : branded
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                  : "bg-surface-sunken text-text-tertiary",
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-2.5 text-[27px] leading-9 font-semibold tracking-[-0.02em] tabular",
          accented ? "text-accent-800 dark:text-accent-200" : "text-text-primary",
        )}
      >
        {value}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined && <DeltaBadge delta={delta} />}
        {sublabel && <span className="text-[12px] text-text-tertiary">{sublabel}</span>}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </Card>
  );
}

export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-text-tertiary">
        <Minus className="size-3" aria-hidden="true" />
        nouveau
      </span>
    );
  }

  const positive = delta > 0.05;
  const negative = delta < -0.05;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-medium tabular",
        positive && "text-success-600 dark:text-success-500",
        negative && "text-danger-600 dark:text-danger-500",
        !positive && !negative && "text-text-tertiary",
      )}
    >
      {positive && <ArrowUpRight className="size-3.5" aria-hidden="true" />}
      {negative && <ArrowDownRight className="size-3.5" aria-hidden="true" />}
      {!positive && !negative && <Minus className="size-3" aria-hidden="true" />}
      {Math.abs(delta).toFixed(1).replace(".", ",").replace(/,0$/, "")} %
    </span>
  );
}
