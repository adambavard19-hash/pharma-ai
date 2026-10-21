import { AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";
import { DIRECTOR_SIGNUP_BONUS_CENTS } from "@/core/affiliation/director-terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { DirectorSimulator } from "./director-simulator";
import { Fact, type Pricing } from "./pricing-and-pay";

/**
 * « Les tarifs et votre rémunération » du directeur commercial (son espace SEULEMENT) : les tarifs du moment, ce que
 * touchent ses affiliés (100 € par pharmacie signée), sa prime par pharmacie signée par l'équipe, avec son
 * simulateur. Aucun montant n'est écrit ici.
 */
export function DirectorPricingAndPay({ pricing }: { pricing: Pricing }) {
  return (
    <section aria-labelledby="tarifs-remuneration" className="space-y-4 overflow-x-clip" data-tarifs-remuneration="">
      <div>
        <h2 id="tarifs-remuneration" className="text-[16px] leading-6 font-semibold text-text-primary">Les tarifs et votre rémunération</h2>
        <p className="text-[13px] text-text-secondary">Les tarifs proposés aujourd&apos;hui aux pharmacies, et ce que vous et vos affiliés touchez pour chacune.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Abonnement" value={`${formatPriceEuros(pricing.monthlyPriceCents)} HT`} hint="par mois et par pharmacie" />
        <Fact label="Mise en service" value={`${formatPriceEuros(pricing.setupFeeCents)} HT`} hint="une seule fois" />
        <Fact label="Vos affiliés" value={`${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT`} hint="par pharmacie apportée et signée, une seule fois" />
        <Fact label="Votre prime" value={`${formatPriceEuros(DIRECTOR_SIGNUP_BONUS_CENTS)} HT`} hint="par pharmacie signée par l'équipe, mise en service réglée" />
      </div>
      <div className="max-w-[640px]">
        <DirectorSimulator monthlyPriceCents={pricing.monthlyPriceCents} />
      </div>
    </section>
  );
}
