"use client";

import { useState } from "react";
import { ESTIMATE_ASSUMPTIONS, estimateAdditionalRevenue, parseClientsPerDay } from "@/core/pricing/revenue-estimate";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";

const SLIDER_MAX = 600;

/**
 * Le simulateur, pièce maîtresse de la section tarif : « à combien estimez-vous votre nombre de clients/patients par jour ? »
 * → le chiffre d'affaires supplémentaire estimé par mois, en grand, à côté de ce que coûte l'abonnement (deux barres à la même
 * échelle). Chaque étape du calcul est visible et se refait à la calculette ; les trois hypothèses sont écrites dessous, avec le
 * mot « estimation » : ce n'est pas une promesse de résultat.
 */
export function RevenueCalculator({ monthlyPriceCents }: { monthlyPriceCents: number }) {
  const [raw, setRaw] = useState("200");
  const clients = parseClientsPerDay(raw);
  const estimate = clients === null ? null : estimateAdditionalRevenue(clients);
  const ratePercent = Math.round(ESTIMATE_ASSUMPTIONS.adviceRate * 100);
  const openDays = ESTIMATE_ASSUMPTIONS.openDaysPerMonth;
  const invalid = clients === null && raw.trim() !== "";

  return (
    <div className="relative flex h-full flex-col rounded-[28px] border-2 border-brand-500 bg-surface-card p-7 shadow-[0_18px_50px_-24px_var(--color-brand-600)] sm:p-9">
      <h3 className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Estimez ce que PharmaBoost vous rapporte</h3>

      <label htmlFor="clients-par-jour" className="mt-5 block text-[18px] leading-snug font-semibold text-text-primary text-balance">
        À combien estimez-vous votre nombre de clients/patients par jour ?
      </label>
      <div className="mt-4 flex items-center gap-3">
        <input
          id="clients-par-jour"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          aria-describedby="clients-aide"
          className={cn(
            "h-14 w-36 rounded-2xl border bg-surface-app px-4 text-[26px] font-semibold tabular-nums text-text-primary outline-none transition-colors focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30",
            invalid ? "border-danger-500" : "border-border-default",
          )}
        />
        <span className="text-[15px] text-text-secondary">clients par jour</span>
      </div>
      <input
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={10}
        value={Math.min(clients ?? 0, SLIDER_MAX)}
        onChange={(event) => setRaw(event.target.value)}
        aria-label="Nombre de clients par jour"
        className="mt-4 w-full accent-[var(--color-brand-600)]"
      />
      <p id="clients-aide" className={cn("mt-1 min-h-5 text-[12.5px]", invalid ? "text-danger-600" : "text-text-tertiary")}>
        {invalid ? "Indiquez un nombre, par exemple 200." : "Tapez votre nombre, ou déplacez le curseur."}
      </p>

      {/* Le résultat d'abord, en grand : c'est ce que le visiteur vient chercher. */}
      <div className="mt-5 rounded-2xl bg-brand-50 px-5 py-6 sm:px-6" aria-live="polite">
        <p className="text-[14px] font-medium text-brand-800">Chiffre d&apos;affaires supplémentaire estimé</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[52px] leading-none font-bold tracking-[-0.035em] text-brand-700 tabular-nums sm:text-[64px]">{estimate ? formatPriceEuros(estimate.perMonthCents) : "—"}</span>
          <span className="text-[17px] font-medium text-brand-800">par mois</span>
        </p>
        <p className="mt-2 text-[13.5px] text-brand-900/80">Pour un abonnement de {formatPriceEuros(monthlyPriceCents)} HT par mois.</p>
      </div>

      {/* Les étapes du calcul : chacune se refait à la calculette. */}
      <ol className="mt-6 divide-y divide-border-subtle border-y border-border-subtle text-[14.5px]" aria-label="Le calcul, étape par étape">
        <Step label={`Clients repartis avec un produit conseillé (${ratePercent} %)`} value={estimate ? `${estimate.advisedClientsPerDay} par jour` : "—"} />
        <Step label={`× ${formatPriceEuros(ESTIMATE_ASSUMPTIONS.averageProductCents)} par produit en moyenne`} hint="Compléments alimentaires, médicaments sans ordonnance" value={estimate ? `${formatPriceEuros(estimate.perDayCents)} par jour` : "—"} />
        <Step label={`× ${openDays} jours d'ouverture`} value={estimate ? `${formatPriceEuros(estimate.perMonthCents)} par mois` : "—"} strong />
      </ol>

      <p className="mt-auto pt-5 text-[12.5px] leading-5 text-text-tertiary">
        Estimation indicative : {ratePercent} % de vos clients prennent un produit conseillé, à {formatPriceEuros(ESTIMATE_ASSUMPTIONS.averageProductCents)} en moyenne, sur {openDays} jours d&apos;ouverture par mois. Ce n&apos;est pas une promesse de résultat.
      </p>
    </div>
  );
}

function Step({ label, hint, value, strong = false }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-3">
      <span className="text-text-secondary">
        {label}
        {hint && <span className="mt-0.5 block text-[12px] leading-4 text-text-tertiary">({hint})</span>}
      </span>
      <span className={cn("text-right font-medium whitespace-nowrap text-text-primary tabular-nums", strong && "font-semibold text-brand-700")}>{value}</span>
    </li>
  );
}
