"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Euro, Target, TrendingUp, Trophy } from "lucide-react";
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
  /** La marge HT générée (prix d'achat connus), pour le titulaire. */
  margin?: string;
  salesWithAdvice: string;
  sales: number;
  /** Ventes avec au moins un conseil vendu, de 0 à 1 ; null sans vente. */
  share: number | null;
  /** Ventes terminées reparties avec au moins un conseil vendu. */
  withAdvice: number;
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

export function SoldCounter({ periods, title, subtitle, initial = 1, money = true, rateLabel }: { periods: CounterPeriod[]; title: string; subtitle: string; initial?: number; /** false : aucun montant (l'espace d'un membre de l'équipe, fondateur 4 nov. 2026). */ money?: boolean; /** Le libellé du taux de conseil (par défaut : celui de la pharmacie, ou « Votre taux » sans montants). */ rateLabel?: string }) {
  const [index, setIndex] = useState(initial);
  const period = periods[index];
  const shown = useCountUp(period.sold);

  // Une carte de verre posée sur l'ADN (fondateur, 5 nov. 2026 : « plus moderne, l'ADN en fond plutôt que le fond vert »).
  return (
    <section aria-label={title} className="overflow-hidden rounded-[28px] border border-white/70 bg-white/55 p-5 shadow-[0_30px_60px_-40px_rgba(15,43,38,.45)] backdrop-blur-xl sm:p-7 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-300">{title}</p>
          <p className="text-[14px] text-text-secondary">{subtitle}</p>
        </div>
        <div role="tablist" aria-label="Période" className="flex flex-wrap gap-1 rounded-full border border-border-subtle bg-white/70 p-1 dark:bg-white/10">
          {periods.map((entry, i) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors", i === index ? "bg-brand-700 text-white shadow-sm" : "text-text-secondary hover:bg-surface-sunken")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <p className="flex items-baseline gap-3">
          <span aria-live="polite" className="bg-gradient-to-br from-brand-700 to-[#0b5560] bg-clip-text text-[72px] leading-none font-bold tracking-[-0.04em] text-transparent tabular sm:text-[96px] dark:from-brand-300 dark:to-brand-500">{shown.toLocaleString("fr-FR")}</span>
          <span className="text-[18px] font-semibold text-text-primary">conseil{period.sold > 1 ? "s" : ""} vendu{period.sold > 1 ? "s" : ""}</span>
        </p>
        <Trophy className="mb-3 hidden size-10 text-amber-400 sm:block" aria-hidden="true" />
      </div>

      <dl className={cn("mt-5 grid grid-cols-1 gap-3", money ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
        {money && (
          <Tile icon={<Euro className="size-4" />} label="Chiffre d'affaires ajouté" value={period.revenue} />
        )}
        {money && (
          <Tile icon={<TrendingUp className="size-4" />} label="Marge générée (HT)" value={period.margin ?? "—"} />
        )}
        <div className={"rounded-2xl border border-border-subtle bg-white/70 p-3.5 sm:col-span-2 dark:bg-white/5"}>
          <dt className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
            <span className="text-brand-600"><Target className="size-4" /></span>
            {rateLabel ?? (money ? "Taux de conseil de la pharmacie" : "Votre taux de conseil")}
          </dt>
          <dd className="mt-0.5 text-[22px] font-semibold text-text-primary tabular">{period.share === null ? "—" : exactPercent(period.share)}</dd>
          <dd className="mt-0.5 text-[12.5px] text-text-secondary">
            {period.share === null
              ? "Aucune vente terminée sur la période"
              : `${period.withAdvice.toLocaleString("fr-FR")} client${period.withAdvice > 1 ? "s" : ""} sur ${period.sales.toLocaleString("fr-FR")} repart${period.withAdvice > 1 ? "ent" : ""} avec au moins un conseil vendu`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Le pourcentage exact, à une décimale : « 12,4 % ». */
function exactPercent(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-white/70 p-3.5 dark:bg-white/5">
      <dt className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
        <span className="text-brand-600">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-[22px] font-semibold text-text-primary tabular">{value}</dd>
    </div>
  );
}
