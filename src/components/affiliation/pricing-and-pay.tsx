import { AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { AffiliateSimulator } from "./affiliate-simulator";

export type Pricing = { monthlyPriceCents: number; setupFeeCents: number };

export function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <p className="text-[11.5px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-1 text-[20px] leading-6 font-semibold text-text-primary tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{hint}</p>
    </div>
  );
}

/**
 * « Mes tarifs et ma rémunération » de l'affilié (extranet) : les tarifs du moment (l'offre publiée dans la console, sinon
 * l'offre officielle, lus par la page avec `loadPublicPricing`), ce qu'il touche (100 € par pharmacie signée, depuis le 20 oct. 2026), avec le simulateur animé. Aucun montant n'est écrit ici : tout vient de `core/affiliation/terms` et de la
 * source des prix. La rémunération du directeur n'apparaît JAMAIS ici (elle a son propre bloc, dans son espace).
 */
export function PricingAndPay({ pricing }: { pricing: Pricing }) {
  return (
    <section aria-labelledby="tarifs-remuneration" className="space-y-4 overflow-x-clip" data-tarifs-remuneration="">
      <div>
        <h2 id="tarifs-remuneration" className="text-[16px] leading-6 font-semibold text-text-primary">Mes tarifs et ma rémunération</h2>
        <p className="text-[13px] text-text-secondary">Les tarifs proposés aujourd&apos;hui aux pharmacies, et ce que vous touchez pour chacune.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Fact label="Abonnement" value={`${formatPriceEuros(pricing.monthlyPriceCents)} HT`} hint="par mois et par pharmacie" />
        <Fact label="Mise en service" value={`${formatPriceEuros(pricing.setupFeeCents)} HT`} hint="une seule fois" />
        <Fact label="Votre prime" value={`${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT`} hint="par pharmacie signée, une fois sa mise en service réglée" />
      </div>
      <div className="max-w-[640px]">
        <AffiliateSimulator monthlyPriceCents={pricing.monthlyPriceCents} inputId="simulateur-extranet" />
      </div>
    </section>
  );
}
