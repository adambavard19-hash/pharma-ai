"use client";

import { useState } from "react";
import { estimateAffiliateSignupBonuses, SIMULATOR_DEFAULT_PHARMACIES, SIMULATOR_MAX_PHARMACIES, SIMULATOR_MIN_PHARMACIES, clampPharmacies } from "@/core/affiliation/simulator";
import { AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { HAIRLINE, settle, useCountTo } from "./use-count-to";
import { cn } from "@/lib/utils";

/**
 * Le simulateur de l'apporteur d'affaires (20 oct. 2026) : « combien de pharmacies apportez-vous ? » → N × 100 €, une
 * prime par pharmacie signée, versée une fois sa mise en service réglée. Plus de pourcentage mensuel. La prime vient de
 * `core/affiliation/terms` : rien n'est écrit ici. C'est une estimation avant impôts et charges, pas un revenu net.
 */
export function AffiliateSimulator({ inputId = "pharmacies-apportees" }: { monthlyPriceCents?: number; inputId?: string }) {
  const [pharmacies, setPharmacies] = useState(SIMULATOR_DEFAULT_PHARMACIES);
  const bonusesCents = estimateAffiliateSignupBonuses(pharmacies);
  const bonuses = useCountTo(bonusesCents);
  const fill = ((pharmacies - SIMULATOR_MIN_PHARMACIES) / (SIMULATOR_MAX_PHARMACIES - SIMULATOR_MIN_PHARMACIES)) * 100;
  const plural = (n: number) => (n > 1 ? "pharmacies" : "pharmacie");

  return (
    <div className="relative mx-auto w-full max-w-[540px] lg:max-w-none" data-simulateur-affiliation="">
      <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(55%_55%_at_65%_45%,var(--color-brand-100),transparent_72%)] opacity-90" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[24px] border-2 border-brand-500 bg-surface-card p-6 shadow-[0_18px_50px_-24px_var(--color-brand-600)] sm:p-8">
        <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
        <h2 className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Simulateur de revenus</h2>

        <div className="mt-5 flex items-baseline justify-between gap-4">
          <label htmlFor={inputId} className="text-[16px] leading-snug font-semibold text-text-primary">
            Pharmacies apportées
          </label>
          <span className="text-[28px] leading-none font-bold tracking-[-0.03em] text-text-primary tabular-nums">{pharmacies}</span>
        </div>
        <input
          id={inputId}
          type="range"
          min={SIMULATOR_MIN_PHARMACIES}
          max={SIMULATOR_MAX_PHARMACIES}
          step={1}
          value={pharmacies}
          onChange={(event) => setPharmacies(clampPharmacies(Number(event.target.value)))}
          aria-valuetext={`${pharmacies} ${plural(pharmacies)} apportée${pharmacies > 1 ? "s" : ""}`}
          aria-describedby={`${inputId}-formule`}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-600 [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:shadow-md"
          style={{ background: `linear-gradient(to right, var(--color-brand-600) ${fill}%, var(--color-border-default) ${fill}%)` }}
        />
        <div className="mt-2 flex justify-between text-[12px] text-text-tertiary tabular-nums" aria-hidden="true">
          <span>{SIMULATOR_MIN_PHARMACIES}</span>
          <span>{SIMULATOR_MAX_PHARMACIES}</span>
        </div>

        <div className="mt-6 rounded-2xl bg-brand-50 px-5 py-6 sm:px-6 dark:bg-brand-950/40">
          <p className="text-[14px] font-medium text-brand-800 dark:text-brand-200">Vos primes estimées</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[44px] leading-none font-bold tracking-[-0.035em] text-brand-700 tabular-nums sm:text-[60px] dark:text-brand-300" data-montant-primes="">
              {formatPriceEuros(settle(bonuses, bonusesCents))}
            </span>
          </p>
          {/* Le montant final, annoncé une fois, sans les valeurs intermédiaires de l'animation. */}
          <p className="sr-only" aria-live="polite">
            {pharmacies} {plural(pharmacies)} signée{pharmacies > 1 ? "s" : ""} : {formatPriceEuros(bonusesCents)} de primes.
          </p>
        </div>

        <p id={`${inputId}-formule`} className="mt-4 text-[13px] leading-5 text-text-secondary tabular-nums">
          {pharmacies} {plural(pharmacies)} signée{pharmacies > 1 ? "s" : ""} × {formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT, versés dès que chaque mise en service est réglée
        </p>
        <p className="mt-2 text-[12.5px] leading-5 text-text-tertiary">
          Estimation avant impôts et charges, à titre d&apos;illustration : seules les pharmacies réellement signées comptent.
        </p>
      </div>
    </div>
  );
}
