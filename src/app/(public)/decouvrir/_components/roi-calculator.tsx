"use client";

import { useState } from "react";

/**
 * Rentable en combien de jours ? Deux curseurs, un résultat en gros, et le
 * mois dessiné jour par jour : les jours qui paient l'abonnement, puis les
 * jours qui restent à l'officine. Les hypothèses sont visibles et modifiables.
 */
const DAYS_OPEN = 26;

export function RoiCalculator({ monthlyPriceCents }: { monthlyPriceCents: number }) {
  const [perDay, setPerDay] = useState(5);
  const [marginEuros, setMarginEuros] = useState(4.6);
  const price = monthlyPriceCents / 100;
  const dailyMargin = perDay * marginEuros;
  const daysToCover = Math.max(1, Math.ceil(price / dailyMargin));
  const monthly = dailyMargin * DAYS_OPEN;
  const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">Rentable en</p>
          <p className="mt-1 text-[44px] leading-none font-semibold tracking-[-0.03em] text-brand-700 tabular dark:text-brand-400">
            {daysToCover > DAYS_OPEN ? "plus d'un mois" : `${daysToCover} jour${daysToCover > 1 ? "s" : ""}`}
          </p>
        </div>
        <p className="text-right text-[13px] leading-5 text-text-secondary">
          Abonnement : <strong className="text-text-primary">{fmt(price)} HT</strong> / mois<br />
          Marge additionnelle : <strong className="text-text-primary">{fmt(monthly)}</strong> / mois
        </p>
      </div>

      <div className="mt-5 grid grid-cols-13 gap-1" aria-label={`Le mois, jour par jour : ${Math.min(daysToCover, DAYS_OPEN)} jours paient l'abonnement, le reste va à l'officine`}>
        {Array.from({ length: DAYS_OPEN }, (_, i) => (
          <span key={i} className={i < daysToCover ? "h-7 rounded-md bg-ink-300 dark:bg-ink-600" : "h-7 rounded-md bg-brand-500"} title={i < daysToCover ? "paie l'abonnement" : "pour l'officine"} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-text-secondary">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-ink-300 dark:bg-ink-600" /> jours qui paient l&apos;abonnement</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-brand-500" /> jours pour l&apos;officine</span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Slider label="Conseils acceptés par jour" value={perDay} min={1} max={20} step={1} onChange={setPerDay} format={(v) => `${v}`} />
        <Slider label="Marge moyenne par conseil" value={marginEuros} min={1} max={15} step={0.1} onChange={setMarginEuros} format={(v) => `${v.toFixed(2).replace(".", ",")} €`} />
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-tertiary">Vos chiffres, pas les nôtres : réglez les curseurs. Dans le logiciel, la marge est lue sur chaque vente.</p>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12.5px] text-text-secondary"><span>{label}</span><span className="font-semibold text-text-primary tabular">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-brand-600)]" aria-label={label} />
    </label>
  );
}
