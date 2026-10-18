import { AFFILIATE_TIERS } from "@/core/affiliation/terms";
import { cn } from "@/lib/utils";

/**
 * L'échelle des paliers d'affiliation (10, 12, 15, 20 %) : quatre marches, la marche atteinte en surbrillance. Au
 * franchissement d'un palier, la marche s'allume (transition de couleur et d'échelle) et son taux rejoue une courte
 * entrée ; avec « réduire les animations », seul le changement de couleur reste. Les paliers viennent de `terms.ts`.
 */
export function TierScale({ tierIndex, count, className }: { tierIndex: number; /** 0 : aucune pharmacie, aucune marche atteinte. */ count: number; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-4 gap-1.5", className)} aria-label="Paliers de commission" data-paliers="">
      {AFFILIATE_TIERS.map((tier, index) => {
        const current = count > 0 && index === tierIndex;
        const reached = count > 0 && index <= tierIndex;
        return (
          <li
            key={tier.ratePercent}
            aria-current={current ? "step" : undefined}
            data-palier={tier.ratePercent}
            data-palier-courant={current ? "" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center rounded-xl border px-1 py-2 text-center transition-all duration-300 ease-out motion-reduce:transition-colors",
              current
                ? "scale-[1.04] border-brand-600 bg-brand-600 text-white shadow-[0_8px_20px_-10px_var(--color-brand-600)]"
                : reached
                  ? "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                  : "border-border-subtle bg-surface-card text-text-tertiary",
            )}
          >
            <span key={current ? "on" : "off"} className={cn("text-[17px] leading-6 font-bold tabular-nums", current && "motion-safe:animate-slide-up")}>
              {tier.ratePercent} %
            </span>
            <span className={cn("text-[11px] leading-4 tabular-nums", current ? "text-white/85" : "")}>{tier.max === null ? `${tier.min} et +` : `${tier.min}–${tier.max}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
