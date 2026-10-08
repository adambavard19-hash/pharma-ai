import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { planSubscriptionStats } from "@/server/services/admin/billing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/feedback";
import { StripeNotConfigured } from "../billing-ui";
import { PlansManager } from "./plans-manager";
import { PublicOfferPanel } from "./public-offer-panel";
import { describePublicPricing } from "@/server/services/public-pricing";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "Offres & tarifs" };

/**
 * Le catalogue PharmaBoost : offres, prix, essai, contenu, remises. Il ne
 * s'applique qu'aux NOUVEAUX abonnements ; chaque officine abonnée garde son
 * tarif contractuel. Pour chaque offre, on montre combien d'abonnements en
 * cours y sont rattachés et combien paient un tarif différent du catalogue.
 */
export default async function PlansPage() {
  await requirePlatformSession();
  const [plans, stats, offer, commissionCents] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    planSubscriptionStats(),
    describePublicPricing(),
    getStandardCommissionCents(),
  ]);
  const defaultPlan = plans.find((plan) => plan.isDefault && plan.isActive) ?? null;
  const stripe = stripeConfigState();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        parent={{ label: "Abonnements", href: "/admin/abonnements" }}
        title="Offres & tarifs"
        description="Nom, prix, essai, contenu et remises de chaque offre. Le prix Stripe est créé à l'enregistrement ; un changement de prix crée un nouveau prix Stripe, les abonnements en cours gardent le leur."
      />

      <Alert tone="info" title="Le catalogue s'applique uniquement aux nouveaux abonnements.">
        Les officines déjà abonnées gardent leur tarif contractuel. Pour changer le tarif d&apos;une officine, passez par sa fiche abonnement : la modification est motivée et tracée.
      </Alert>
      {!stripe.configured && <StripeNotConfigured detail={stripe.detail}>Les offres s&apos;enregistrent ; leur prix Stripe sera créé dès que la clé sera renseignée.</StripeNotConfigured>}

      <PublicOfferPanel
        data={{
          source: offer.pricing.source,
          planName: offer.pricing.name,
          monthlyPriceCents: offer.pricing.monthlyPriceCents,
          setupFeeCents: offer.pricing.setupFeeCents,
          commitmentMonths: offer.pricing.commitmentMonths,
          referralDiscountPercent: offer.pricing.referralDiscountPercent,
          commissionCents,
          gaps: offer.gaps,
          officialIsLive: offer.pricing.source === "PLAN" && defaultPlan?.code === OFFICIAL_OFFER.code,
          previousDefaultName: defaultPlan && defaultPlan.code !== OFFICIAL_OFFER.code ? defaultPlan.name : null,
        }}
      />

      <PlansManager
        plans={plans.map((plan) => {
          const stat = stats.get(plan.id);
          return {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description,
            monthlyPriceCents: plan.monthlyPriceCents,
            annualPriceCents: plan.annualPriceCents,
            setupFeeCents: plan.setupFeeCents,
            foundingPriceCents: plan.foundingPriceCents,
            discountPercent: plan.discountPercent,
            discountLabel: plan.discountLabel,
            features: plan.features,
            options: plan.options,
            maxUsers: plan.maxUsers,
            sortOrder: plan.sortOrder,
            trialDays: plan.trialDays,
            isActive: plan.isActive,
            isDefault: plan.isDefault,
            stripePriceId: plan.stripePriceId,
            ongoing: stat?.ongoing ?? 0,
            differing: stat?.differing ?? 0,
            contracts: stat?.contracts ?? 0,
          };
        })}
      />
    </div>
  );
}
