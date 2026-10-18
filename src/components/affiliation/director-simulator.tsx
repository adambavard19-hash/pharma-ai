"use client";

import { useState } from "react";
import { SIMULATOR_MAX_PHARMACIES } from "@/core/affiliation/simulator";
import { DIRECTOR_SIMULATOR_DEFAULT, DIRECTOR_SIMULATOR_MIN, estimateDirectorBonuses } from "@/core/affiliation/director-simulator";
import { AFFILIATE_TIERS } from "@/core/affiliation/terms";
import { DIRECTOR_SIGNUP_BONUS_CENTS } from "@/core/affiliation/director-terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";
import { HAIRLINE, settle, useCountTo } from "./use-count-to";
import { TierScale } from "./tier-scale";

/**
 * Le simulateur du directeur commercial : « pharmacies signées par votre équipe » → sa prime (N × 50 € HT, une fois
 * chaque mise en service réglée), qui compte en douceur, et, en petit, ce que l'équipe d'affiliés touche chaque mois
 * (N × abonnement × taux du palier atteint par N, 10 à 20 %), avec l'échelle des paliers.
 * Le prix de l'abonnement vient du serveur, les montants de `core/affiliation/terms` : rien n'est écrit ici.
 */
export function DirectorSimulator({ monthlyPriceCents }: { monthlyPriceCents: number }) {
  const [pharmacies, setPharmacies] = useState(DIRECTOR_SIMULATOR_DEFAULT);
  const estimate = estimateDirectorBonuses(pharmacies, monthlyPriceCents);
  const bonus = useCountTo(estimate.bonusCents);
  const team = useCountTo(estimate.teamPerMonthCents);
  const fill = ((pharmacies - DIRECTOR_SIMULATOR_MIN) / (SIMULATOR_MAX_PHARMACIES - DIRECTOR_SIMULATOR_MIN)) * 100;
  const plural = (n: number) => (n > 1 ? "pharmacies" : "pharmacie");

  return (
    <div className="relative overflow-hidden rounded-[20px] border-2 border-brand-500 bg-surface-card p-5 shadow-[0_18px_50px_-24px_var(--color-brand-600)] sm:p-6" data-simulateur-directeur="">
      <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
      <h3 className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Simulateur de primes</h3>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <label htmlFor="pharmacies-signees" className="text-[15px] leading-snug font-semibold text-text-primary">
          Pharmacies signées par votre équipe
        </label>
        <span className="text-[26px] leading-none font-bold tracking-[-0.03em] text-text-primary tabular-nums">{pharmacies}</span>
      </div>
      <input
        id="pharmacies-signees"
        type="range"
        min={DIRECTOR_SIMULATOR_MIN}
        max={SIMULATOR_MAX_PHARMACIES}
        step={1}
        value={pharmacies}
        onChange={(event) => setPharmacies(estimateDirectorBonuses(Number(event.target.value), monthlyPriceCents).pharmacies)}
        aria-valuetext={`${pharmacies} ${plural(pharmacies)} signée${pharmacies > 1 ? "s" : ""}`}
        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-600 [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:shadow-md"
        style={{ background: `linear-gradient(to right, var(--color-brand-600) ${fill}%, var(--color-border-default) ${fill}%)` }}
      />
      <div className="mt-2 flex justify-between text-[12px] text-text-tertiary tabular-nums" aria-hidden="true">
        <span>{DIRECTOR_SIMULATOR_MIN}</span>
        <span>{SIMULATOR_MAX_PHARMACIES}</span>
      </div>

      <div className="mt-5 rounded-2xl bg-brand-50 px-5 py-5 dark:bg-brand-950/40">
        <p className="text-[14px] font-medium text-brand-800 dark:text-brand-200">Vos primes</p>
        <p className="mt-1 text-[44px] leading-none font-bold tracking-[-0.035em] text-brand-700 tabular-nums sm:text-[52px] dark:text-brand-300" data-montant-primes-directeur="">
          {formatPriceEuros(settle(bonus, estimate.bonusCents))}
        </p>
        <p className="mt-2 text-[13px] text-brand-900/80 tabular-nums dark:text-brand-100/80">
          {pharmacies} × {formatPriceEuros(DIRECTOR_SIGNUP_BONUS_CENTS)} HT, une fois chaque mise en service réglée
        </p>
        <div className="mt-4 border-t border-brand-200/70 pt-3 dark:border-brand-800">
          <p className="text-[12.5px] text-text-secondary tabular-nums" data-equipe-mensuel="">
            Ce que touche l&apos;équipe chaque mois : <span className="font-semibold text-text-primary">{formatPriceEuros(settle(team, estimate.teamPerMonthCents))}</span> ({pharmacies} × {formatPriceEuros(monthlyPriceCents)} HT × {estimate.teamRatePercent} %, taux du palier).
          </p>
          <TierScale tierIndex={AFFILIATE_TIERS.findIndex((tier) => tier.ratePercent === estimate.teamRatePercent)} count={pharmacies} className="mt-2" />
          <p className="mt-2 text-[11.5px] leading-4 text-text-tertiary">Le palier est propre à chaque affilié : ce montant suppose les pharmacies apportées par un même affilié.</p>
        </div>
        <p className="sr-only" aria-live="polite">
          {pharmacies} {plural(pharmacies)} : {formatPriceEuros(estimate.bonusCents)} de primes ; l&apos;équipe touche {formatPriceEuros(estimate.teamPerMonthCents)} par mois, au palier de {estimate.teamRatePercent} %.
        </p>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-tertiary">Estimation avant impôts et charges, à titre d&apos;illustration.</p>
    </div>
  );
}
