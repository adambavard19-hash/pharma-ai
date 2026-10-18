import type { Metadata } from "next";
import { requireDirectorSession } from "@/server/auth/director-session";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { listDirectorBonuses } from "@/server/services/sales/director-bonuses";
import { DirectorPricingAndPay } from "@/components/affiliation/director-pricing-and-pay";
import { PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { formatPriceEuros } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "Rémunération" };

/**
 * « Rémunération » du directeur : les tarifs du moment (source officielle des prix), ce que touchent ses affiliés, sa
 * prime par pharmacie signée par l'équipe, un simulateur, et ses vraies primes (d'après SA session).
 */
export default async function DirectorPayPage() {
  const session = await requireDirectorSession();
  const [pricing, bonuses] = await Promise.all([loadPublicPricing(), listDirectorBonuses({ salesDirectorId: session.director.id })]);
  return (
    <>
      <PageHeader title="Rémunération" description="Les tarifs proposés aux pharmacies, ce que touchent vos affiliés, et vos primes." />
      <section aria-label="Mes primes" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Primes acquises" value={formatPriceEuros(bonuses.earnedCents)} sublabel="à valider par PharmaBoost" />
        <StatCard label="À payer" value={formatPriceEuros(bonuses.payableCents)} sublabel="validées" />
        <StatCard label="Payées" value={formatPriceEuros(bonuses.paidCents)} sublabel="depuis le début" emphasis="brand" />
      </section>
      <DirectorPricingAndPay pricing={pricing} />
    </>
  );
}
