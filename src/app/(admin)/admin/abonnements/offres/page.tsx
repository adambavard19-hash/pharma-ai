import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PlansManager } from "./plans-manager";

export const metadata: Metadata = { title: "Offres" };

/**
 * Les offres PharmaBoost : nom, prix mensuel, jours d'essai. Modifiables ici
 * sans toucher au code ; le prix Stripe correspondant est créé ou remplacé à
 * l'enregistrement. Une offre archivée n'est plus proposée aux nouveaux
 * contrats mais reste attachée aux abonnements en cours.
 */
export default async function PlansPage() {
  await requirePlatformSession();
  const [plans, stripe] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { isDefault: "desc" }, { name: "asc" }], include: { _count: { select: { subscriptions: true, contracts: true } } } }),
    Promise.resolve(stripeConfigState()),
  ]);
  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/admin/abonnements">Abonnements & Contrats</Link>
      </Button>
      <PageHeader title="Offres" description="Nom, prix mensuel hors taxes, durée d'essai. Le prix Stripe est créé à l'enregistrement ; un changement de tarif crée un nouveau prix, les abonnements en cours gardent l'ancien." />
      {!stripe.configured && <Alert tone="warning" title="Stripe non configuré">{stripe.detail} Les offres s&apos;enregistrent ; leur prix Stripe sera créé dès que la clé sera renseignée.</Alert>}
      <PlansManager
        plans={plans.map((plan) => ({ id: plan.id, code: plan.code, name: plan.name, description: plan.description, monthlyPriceCents: plan.monthlyPriceCents, trialDays: plan.trialDays, isActive: plan.isActive, isDefault: plan.isDefault, stripePriceId: plan.stripePriceId, subscriptions: plan._count.subscriptions, contracts: plan._count.contracts }))}
      />
    </div>
  );
}
