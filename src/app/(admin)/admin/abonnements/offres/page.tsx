import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { planSubscriptionStats } from "@/server/services/admin/billing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { StripeNotConfigured } from "../billing-ui";
import { PlansManager } from "./plans-manager";

export const metadata: Metadata = { title: "Offres & tarifs" };

/**
 * Le catalogue PharmaBoost : offres, prix, essai, contenu, remises. Il ne
 * s'applique qu'aux NOUVEAUX abonnements ; chaque officine abonnée garde son
 * tarif contractuel. Pour chaque offre, on montre combien d'abonnements en
 * cours y sont rattachés et combien paient un tarif différent du catalogue.
 */
export default async function PlansPage() {
  await requirePlatformSession();
  const [plans, stats] = await Promise.all([prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }), planSubscriptionStats()]);
  const stripe = stripeConfigState();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Facturation", href: "/admin/abonnements" }}
        parent={{ label: "Abonnements", href: "/admin/abonnements" }}
        title="Offres & tarifs"
        description="Nom, prix, essai, contenu et remises de chaque offre. Le prix Stripe est créé à l'enregistrement ; un changement de prix crée un nouveau prix Stripe, les abonnements en cours gardent le leur."
        actions={
          <Button asChild variant="outline" size="sm" leadingIcon={<CreditCard className="size-4" />}>
            <Link href="/admin/abonnements">Abonnements</Link>
          </Button>
        }
      />

      <Alert tone="info" title="Le catalogue s'applique uniquement aux nouveaux abonnements.">
        Les officines déjà abonnées gardent leur tarif contractuel. Pour changer le tarif d&apos;une officine, passez par sa fiche abonnement : la modification est motivée et tracée.
      </Alert>
      {!stripe.configured && <StripeNotConfigured detail={stripe.detail}>Les offres s&apos;enregistrent ; leur prix Stripe sera créé dès que la clé sera renseignée.</StripeNotConfigured>}

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
