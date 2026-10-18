import { AFFILIATE_RATE_LABEL, AFFILIATE_SIGNUP_BONUS_CENTS, DIRECTOR_SIGNUP_BONUS_CENTS, monthlyAffiliateCommissionCents } from "@/core/affiliation/terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { AffiliateSimulator } from "./affiliate-simulator";
import { DirectorSimulator } from "./director-simulator";

type Pricing = { monthlyPriceCents: number; setupFeeCents: number };

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <p className="text-[11.5px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-1 text-[20px] leading-6 font-semibold text-text-primary tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{hint}</p>
    </div>
  );
}

/**
 * « Mes tarifs et ma rémunération » : les tarifs du moment (l'offre publiée dans la console, sinon l'offre officielle,
 * lus par la page avec `loadPublicPricing`), ce que touche l'affilié, et — pour le directeur — sa prime, avec le
 * simulateur animé. Aucun montant n'est écrit ici : tout vient de `core/affiliation/terms` et de la source des prix.
 */
export function PricingAndPay({ audience, pricing }: { audience: "affiliate" | "director"; pricing: Pricing }) {
  const perPharmacy = monthlyAffiliateCommissionCents(pricing.monthlyPriceCents);
  const director = audience === "director";
  return (
    <section aria-labelledby="tarifs-remuneration" className="space-y-4 overflow-x-clip" data-tarifs-remuneration="">
      <div>
        <h2 id="tarifs-remuneration" className="text-[16px] leading-6 font-semibold text-text-primary">{director ? "Les tarifs et votre rémunération" : "Mes tarifs et ma rémunération"}</h2>
        <p className="text-[13px] text-text-secondary">Les tarifs proposés aujourd&apos;hui aux pharmacies, et ce que {director ? "vous et vos affiliés touchez" : "vous touchez"} pour chacune.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Abonnement" value={`${formatPriceEuros(pricing.monthlyPriceCents)} HT`} hint="par mois et par pharmacie" />
        <Fact label="Mise en service" value={`${formatPriceEuros(pricing.setupFeeCents)} HT`} hint="une seule fois" />
        <Fact label={director ? "Vos affiliés" : "Chaque mois, à vie"} value={`${AFFILIATE_RATE_LABEL} · ${formatPriceEuros(perPharmacy)}`} hint={director ? `par pharmacie et par mois, à vie, + ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} de prime` : "par pharmacie abonnée, tant qu'elle reste abonnée"} />
        {director ? (
          <Fact label="Votre prime" value={`${formatPriceEuros(DIRECTOR_SIGNUP_BONUS_CENTS)} HT`} hint="par pharmacie signée par l'équipe, mise en service réglée" />
        ) : (
          <Fact label="Prime d'arrivée" value={`${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT`} hint="par pharmacie, une fois sa mise en service réglée" />
        )}
      </div>
      <div className="max-w-[640px]">
        {director ? <DirectorSimulator monthlyPriceCents={pricing.monthlyPriceCents} /> : <AffiliateSimulator monthlyPriceCents={pricing.monthlyPriceCents} withSignupBonus inputId="simulateur-extranet" />}
      </div>
    </section>
  );
}
