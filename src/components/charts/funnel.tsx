import { cn } from "@/lib/utils";

export type FunnelStep = {
  label: string;
  value: number;
  hint?: string;
};

/**
 * Entonnoir de conversion : proposé → accepté → présenté → acheté.
 * Chaque étape affiche sa part de l'étape précédente, qui est l'information
 * réellement actionnable au comptoir.
 */
export function Funnel({
  steps,
  className,
  formatValue = (v: number) => String(v),
}: {
  steps: FunnelStep[];
  className?: string;
  formatValue?: (value: number) => string;
}) {
  const first = steps[0]?.value ?? 0;

  return (
    <ol className={cn("space-y-2.5", className)}>
      {steps.map((step, index) => {
        const previous = index === 0 ? null : steps[index - 1].value;
        const ratioOfFirst = first > 0 ? step.value / first : 0;
        const ratioOfPrevious =
          previous && previous > 0 ? step.value / previous : null;

        return (
          <li key={step.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-text-primary">
                {step.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[14px] font-semibold tabular text-text-primary">
                  {formatValue(step.value)}
                </span>
                {ratioOfPrevious !== null && (
                  <span className="text-[12px] tabular text-text-tertiary">
                    {(ratioOfPrevious * 100).toFixed(0)} % de l&apos;étape précédente
                  </span>
                )}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-surface-sunken">
              <div
                className={cn(
                  "flex h-full items-center rounded-md px-2.5 transition-[width] duration-700",
                  index === steps.length - 1 ? "bg-accent-400" : "bg-brand-500",
                )}
                style={{ width: `${Math.max(4, ratioOfFirst * 100)}%` }}
              >
                {step.hint && ratioOfFirst > 0.3 && (
                  <span className="truncate text-[11px] font-medium text-white">
                    {step.hint}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
