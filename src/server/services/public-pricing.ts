import "server-only";
import { prisma } from "@/server/db/client";
import { resolvePublicPricing, pricingPlanGaps, type PublicPricing } from "@/core/pricing/official-offer";

/**
 * Les tarifs que le site affiche : l'offre par défaut publiée dans la console
 * quand elle est complète, sinon l'offre officielle (`OFFICIAL_OFFER`). Une seule
 * lecture, un seul endroit : l'accueil, la page d'abonnement, les e-mails et la
 * console lisent la même valeur, aucun montant n'est recopié dans une page.
 *
 * Ce sont des tarifs de catalogue. Le prix d'une officine déjà cliente est celui
 * de son contrat, figé à la souscription : cette lecture n'y touche jamais.
 */
const PLAN_SELECT = { id: true, name: true, monthlyPriceCents: true, annualPriceCents: true, setupFeeCents: true, annualSetupFeeCents: true } as const;

async function loadDefaultPlan() {
  return prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" }, select: PLAN_SELECT });
}

export async function loadPublicPricing(): Promise<PublicPricing & { planId: string | null }> {
  const plan = await loadDefaultPlan();
  const pricing = resolvePublicPricing(plan);
  return { ...pricing, planId: pricing.source === "PLAN" ? (plan?.id ?? null) : null };
}

/** Pour la console : ce que le site affiche, d'où cela vient, et ce qui manque à l'offre par défaut. */
export async function describePublicPricing(): Promise<{ pricing: PublicPricing; planId: string | null; gaps: string[] }> {
  const plan = await loadDefaultPlan();
  return { pricing: resolvePublicPricing(plan), planId: plan?.id ?? null, gaps: pricingPlanGaps(plan) };
}
