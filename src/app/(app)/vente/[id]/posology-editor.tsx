"use client";

import { Minus } from "lucide-react";
import {
  MEAL_LABELS,
  MOMENTS,
  MOMENT_LABELS,
  type MealTiming,
  type PosologySchedule,
} from "@/core/posology";
import { cn } from "@/lib/utils";

/**
 * La posologie, en quatre touches.
 *
 * Le geste le plus fréquent au comptoir est « une prise le matin et une le
 * soir » : il doit coûter deux appuis, pas un formulaire. Chaque moment est
 * une tuile qu'on incrémente en la touchant ; un « − » n'apparaît que si elle
 * porte déjà une prise, parce qu'on retire beaucoup moins souvent qu'on
 * n'ajoute.
 *
 * Le rapport au repas est facultatif et le reste : l'imposer obligerait à
 * renseigner une information que l'ordonnance ne donne pas toujours — donc à
 * l'inventer.
 */
export function PosologyEditor({
  schedule,
  onChange,
  inferred,
}: {
  schedule: PosologySchedule;
  onChange: (next: PosologySchedule) => void;
  /** Vrai quand la répartition vient d'une fréquence, pas d'une lecture. */
  inferred: boolean;
}) {
  const bump = (moment: (typeof MOMENTS)[number], delta: number) =>
    onChange({
      ...schedule,
      [moment]: Math.max(0, Math.min(9, schedule[moment] + delta)),
    });

  const setMeal = (meal: MealTiming | null) =>
    onChange({ ...schedule, mealTiming: schedule.mealTiming === meal ? null : meal });

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-2">
        {MOMENTS.map((moment) => {
          const value = schedule[moment];
          const active = value > 0;
          return (
            <div key={moment} className="relative">
              <button
                type="button"
                onClick={() => bump(moment, 1)}
                aria-label={`${MOMENT_LABELS[moment]} : ${value}, ajouter une prise`}
                className={cn(
                  "flex h-[70px] w-full flex-col items-center justify-center rounded-xl border-2 transition-colors",
                  active
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/60"
                    : "border-border-default bg-surface-card hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "text-[24px] leading-7 font-semibold tabular",
                    active ? "text-brand-700 dark:text-brand-300" : "text-text-tertiary",
                  )}
                >
                  {value}
                </span>
                <span
                  className={cn(
                    "text-[11.5px] font-medium",
                    active ? "text-brand-800 dark:text-brand-300" : "text-text-tertiary",
                  )}
                >
                  {MOMENT_LABELS[moment]}
                </span>
              </button>

              {active && (
                <button
                  type="button"
                  onClick={() => bump(moment, -1)}
                  aria-label={`Retirer une prise — ${MOMENT_LABELS[moment].toLowerCase()}`}
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border-default bg-surface-card text-text-tertiary shadow-sm transition-colors hover:text-danger-600"
                >
                  <Minus className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(MEAL_LABELS) as MealTiming[]).map((meal) => (
          <button
            key={meal}
            type="button"
            onClick={() => setMeal(meal)}
            aria-pressed={schedule.mealTiming === meal}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
              schedule.mealTiming === meal
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            {MEAL_LABELS[meal]}
          </button>
        ))}
      </div>

      {inferred && (
        <p className="text-[12px] leading-4 text-warning-700 dark:text-warning-500">
          Répartition proposée d&apos;après la fréquence — l&apos;ordonnance ne précise pas les
          moments. À confirmer.
        </p>
      )}
    </div>
  );
}
