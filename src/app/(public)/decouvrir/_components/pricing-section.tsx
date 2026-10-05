import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HAIRLINE, SectionHead } from "./site-shell";
import { formatPriceEuros, formulaQuery, type PublicPricing } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";

/**
 * Les deux formules, côte à côte, lisibles d'un coup d'œil : le prix, l'engagement,
 * la mise en service. L'annuelle est mise en avant comme la plus avantageuse : même
 * prix par mois, mise en service offerte. Rien n'est affiché qui ne vienne de
 * `PublicPricing` (la console, ou l'offre officielle).
 */
export function PricingSection({ pricing }: { pricing: PublicPricing }) {
  const { monthly, annual } = pricing;
  const saved = monthly.setupFeeCents - annual.setupFeeCents;
  // Une année en formule mensuelle : 12 mois + la mise en service (99 × 12 + 390 = 1 578 €).
  const firstYearCents = monthly.priceCents * annual.commitmentMonths + monthly.setupFeeCents;
  const annualSetupOffered = annual.setupFeeCents === 0;
  const annualSetupLabel = annualSetupOffered ? "Offerte" : `${formatPriceEuros(annual.setupFeeCents)} HT, une seule fois`;

  return (
    <section id="tarif" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
      <SectionHead kicker="Tarif" title="Deux formules. Tous les postes inclus." center>
        Un abonnement par officine, quel que soit le nombre de postes de comptoir.
      </SectionHead>

      {/* Le mot de réassurance : la promesse d'abord, la précision ensuite, plus discrète. */}
      <div className="mx-auto mt-10 max-w-3xl text-center">
        <div className={cn("mx-auto mb-5 h-px w-16", HAIRLINE)} aria-hidden="true" />
        <p className="text-[20px] leading-[1.35] font-semibold tracking-[-0.015em] text-text-primary text-balance md:text-[26px]">
          Rassurez-vous, l’objectif est simple : que PharmaBoost vous rapporte bien plus qu’il ne vous coûte.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-6 text-text-tertiary text-balance md:text-[14.5px]">
          Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl items-stretch gap-5 md:grid-cols-2">
        {/* ---- Mensuelle ---- */}
        <article className="order-2 flex flex-col rounded-[28px] border border-border-subtle bg-surface-card p-7 sm:p-8 md:order-1" aria-labelledby="formule-mensuelle">
          <h3 id="formule-mensuelle" className="font-mono text-[12px] tracking-[0.14em] text-text-tertiary uppercase">Mensuelle</h3>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[48px] leading-none font-semibold tracking-[-0.04em] text-text-primary tabular">{formatPriceEuros(monthly.priceCents)}</span>
            <span className="text-[15px] text-text-secondary">HT / mois</span>
            {/* Ce que coûte une année en formule mensuelle : 12 mois + la mise en service, à comparer à l'annuelle. */}
            <span className="text-[20px] font-semibold text-text-secondary tabular" title={`12 mois à ${formatPriceEuros(monthly.priceCents)} HT + mise en service de ${formatPriceEuros(monthly.setupFeeCents)} HT`}>
              ({formatPriceEuros(firstYearCents)})
              <span className="sr-only"> sur un an, mise en service comprise</span>
            </span>
          </p>
          <p className="mt-1.5 text-[13.5px] text-text-secondary">par officine</p>
          <dl className="mt-7 divide-y divide-border-subtle border-y border-border-subtle text-[14.5px]">
            <Row label="Engagement" value="Sans engagement" />
            <Row label="Mise en service" value={`${formatPriceEuros(monthly.setupFeeCents)} HT, une seule fois`} />
          </dl>
          <div className="mt-auto pt-8">
            <Link href={`/decouvrir/abonnement?formule=${formulaQuery("MONTHLY")}`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border-default text-[15px] font-semibold text-text-primary transition-colors hover:border-brand-400">
              Choisir cette formule <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>

        {/* ---- Annuelle : la plus avantageuse ---- */}
        <article className="relative order-1 flex flex-col rounded-[28px] border-2 border-brand-500 bg-surface-card p-7 shadow-[0_18px_50px_-24px_var(--color-brand-600)] sm:p-8 md:order-2" aria-labelledby="formule-annuelle">
          <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
          <p className="absolute -top-3.5 left-7 rounded-full bg-brand-600 px-3.5 py-1 text-[12.5px] font-semibold text-white shadow-sm">La plus avantageuse</p>
          <h3 id="formule-annuelle" className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Annuelle</h3>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[48px] leading-none font-semibold tracking-[-0.04em] text-text-primary tabular">{formatPriceEuros(annual.priceCents)}</span>
            <span className="text-[15px] text-text-secondary">HT / an</span>
          </p>
          <dl className="mt-7 divide-y divide-border-subtle border-y border-border-subtle text-[14.5px]">
            <Row label="Mise en service" value={annualSetupLabel} strong={annualSetupOffered} />
          </dl>
          {annualSetupOffered && saved > 0 && (
            <p className="mt-4 flex items-start gap-2 text-[13.5px] font-medium text-brand-800">
              <Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} aria-hidden="true" />
              Mise en service offerte, au lieu de {formatPriceEuros(saved)} HT en formule mensuelle.
            </p>
          )}
          <div className="mt-auto pt-8">
            <Link href={`/decouvrir/abonnement?formule=${formulaQuery("ANNUAL")}`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700">
              Choisir cette formule <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>
      </div>

      <p className="mx-auto mt-8 max-w-4xl text-center text-[14px] text-text-secondary">
        Pas encore décidé ?{" "}
        <Link href="/decouvrir/demo" className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800">Réserver une démo</Link>
      </p>
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cn("text-right font-medium text-text-primary", strong && "font-semibold text-brand-700")}>{value}</dd>
    </div>
  );
}
