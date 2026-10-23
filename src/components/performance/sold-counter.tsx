"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Le compteur des conseils vendus, en grand : il défile jusqu'au nombre à chaque période choisie. Les chiffres sont ceux
 * des ventes terminées (« Vendu » déclaré au comptoir), calculés côté serveur pour les quatre périodes ; le client ne fait
 * que choisir laquelle montrer. L'onglet Performances du titulaire et du pharmacien (fondateur, 23 oct. 2026).
 */

export type CounterPeriod = {
  key: string;
  label: string;
  sold: number;
  revenue: string;
  salesWithAdvice: string;
  sales: number;
  /** Ventes avec au moins un conseil vendu, de 0 à 1 ; null sans vente. */
  share: number | null;
};

function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(origin + (target - origin) * eased);
      setValue(next);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export function SoldCounter({ periods, title, subtitle, initial = 1 }: { periods: CounterPeriod[]; title: string; subtitle: string; initial?: number }) {
  const [index, setIndex] = useState(initial);
  const period = periods[index];
  const shown = useCountUp(period.sold);
  const goal = 0.1;
  const share = period.share ?? 0;

  return (
    <section aria-label={title} className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-600 via-brand-700 to-[#0b5560] p-5 text-white shadow-lg sm:p-7 dark:border-brand-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.08em] text-white/70 uppercase">{title}</p>
          <p className="text-[14px] text-white/80">{subtitle}</p>
        </div>
        <div role="tablist" aria-label="Période" className="flex flex-wrap gap-1 rounded-full bg-white/10 p-1">
          {periods.map((entry, i) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors", i === index ? "bg-white text-brand-800" : "text-white/80 hover:bg-white/10")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <p className="flex items-baseline gap-3">
          <span aria-live="polite" className="text-[72px] leading-none font-bold tracking-[-0.04em] tabular sm:text-[96px]">{shown.toLocaleString("fr-FR")}</span>
          <span className="text-[18px] font-semibold text-white/85">conseil{period.sold > 1 ? "s" : ""} vendu{period.sold > 1 ? "s" : ""}</span>
        </p>
        <Trophy className="mb-3 hidden size-10 text-amber-300 sm:block" aria-hidden="true" />
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/10 p-3.5">
          <dt className="text-[12.5px] text-white/70">Chiffre d&apos;affaires ajouté</dt>
          <dd className="mt-0.5 text-[22px] font-semibold tabular">{period.revenue}</dd>
        </div>
        <div className="rounded-2xl bg-white/10 p-3.5">
          <dt className="text-[12.5px] text-white/70">Ventes avec un conseil vendu</dt>
          <dd className="mt-0.5 text-[22px] font-semibold tabular">{period.salesWithAdvice}</dd>
        </div>
        <div className="rounded-2xl bg-white/10 p-3.5">
          <dt className="text-[12.5px] text-white/70">Objectif : 10 % des ventes</dt>
          <dd className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15">
            <span className={cn("block h-full rounded-full transition-[width] duration-700", share >= goal ? "bg-emerald-300" : "bg-amber-300")} style={{ width: `${Math.min(100, (share / goal) * 100)}%` }} />
          </dd>
          <dd className="mt-1.5 text-[12.5px] text-white/80">{period.share === null ? "Aucune vente terminée sur la période" : share >= goal ? "Objectif atteint" : `${Math.round(share * 100)} % sur 10 %`}</dd>
        </div>
      </dl>
    </section>
  );
}
