"use client";

import { useState } from "react";

/**
 * Le calcul de rentabilité, avec ses hypothèses visibles et modifiables.
 * Aucun chiffre n'est présenté comme une mesure : ce sont les trois nombres
 * que le lecteur règle lui-même. Dans le logiciel, en revanche, la marge est
 * lue sur chaque vente réellement enregistrée.
 */
export function RoiCalculator({ monthlyPriceCents }: { monthlyPriceCents: number }) {
  const [perDay, setPerDay] = useState(5);
  const [marginEuros, setMarginEuros] = useState(4.6);
  const [daysOpen, setDaysOpen] = useState(26);
  const dailyMargin = perDay * marginEuros;
  const monthly = dailyMargin * daysOpen;
  const price = monthlyPriceCents / 100;
  const daysToCover = dailyMargin > 0 ? Math.ceil(price / dailyMargin) : null;
  const defaultDays = Math.ceil(price / (5 * 4.6));
  const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
      <p className="text-[15px] font-semibold text-text-primary">Au bout de combien de jours l&apos;abonnement est-il couvert ?</p>
      <p className="mt-1 text-[13px] leading-5 text-text-secondary">Réglez les trois chiffres avec ceux de votre officine. La marge d&apos;un conseil, PharmaBoost la lit sur chaque vente : prix de vente moins prix d&apos;achat.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Slider label="Conseils acceptés par jour" value={perDay} min={1} max={20} step={1} onChange={setPerDay} format={(v) => `${v}`} />
        <Slider label="Marge moyenne par conseil" value={marginEuros} min={1} max={15} step={0.1} onChange={setMarginEuros} format={(v) => `${v.toFixed(2).replace(".", ",")} €`} />
        <Slider label="Jours d'ouverture par mois" value={daysOpen} min={20} max={30} step={1} onChange={setDaysOpen} format={(v) => `${v}`} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Result label="Marge additionnelle par jour" value={fmt(dailyMargin)} />
        <Result label="Marge additionnelle par mois" value={fmt(monthly)} />
        <Result label="Abonnement couvert en" value={daysToCover === null ? "—" : `${daysToCover} jour${daysToCover > 1 ? "s" : ""}`} highlight />
      </div>
      <p className="mt-4 text-[12.5px] leading-5 text-text-tertiary">Avec cinq conseils acceptés par jour à 4,60 € de marge, l&apos;abonnement de {fmt(price)} HT est couvert en {defaultDays} jour{defaultDays > 1 ? "s" : ""} d&apos;ouverture. Le reste du mois est pour l&apos;officine.</p>
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

function Result({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl bg-brand-600 px-4 py-3 text-white" : "rounded-xl bg-surface-sunken px-4 py-3"}>
      <p className={highlight ? "text-[12px] text-brand-100" : "text-[12px] text-text-tertiary"}>{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tabular">{value}</p>
    </div>
  );
}
