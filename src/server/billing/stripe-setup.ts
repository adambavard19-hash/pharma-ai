import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { VAT_PERCENT } from "@/core/billing/checkout";
import { getStripe } from "./stripe-client";

/**
 * Ce que Stripe doit connaître une fois pour toutes, assuré à la demande et sans
 * doublon : le taux de TVA, le prix de la mise en service d'une offre, la
 * configuration du portail client. Chaque fonction peut être rappelée autant de
 * fois qu'on veut : elle retrouve l'objet existant avant d'en créer un.
 */

const VAT_MARKER = "pharmaboost_vat_fr_20";

let vatTaxRateId: string | null = null;

/** Le taux de TVA française (20 %, ajouté au HT), retrouvé par sa marque, créé s'il manque. */
export async function ensureVatTaxRate(stripe: Stripe = getStripe()): Promise<string> {
  if (vatTaxRateId) return vatTaxRateId;
  for await (const rate of stripe.taxRates.list({ active: true, inclusive: false, limit: 100 })) {
    if (rate.metadata?.pharmaboost === VAT_MARKER && rate.percentage === VAT_PERCENT) {
      vatTaxRateId = rate.id;
      return rate.id;
    }
  }
  const created = await stripe.taxRates.create({
    display_name: "TVA",
    description: "TVA française 20 %",
    jurisdiction: "FR",
    country: "FR",
    percentage: VAT_PERCENT,
    inclusive: false,
    tax_type: "vat",
    metadata: { pharmaboost: VAT_MARKER },
  });
  vatTaxRateId = created.id;
  return created.id;
}

/** Le produit Stripe de la mise en service : un seul, à identifiant fixe, retrouvé ou créé. */
export const SETUP_PRODUCT_ID = "pharmaboost_mise_en_service";

async function ensureSetupProduct(stripe: Stripe): Promise<string> {
  try {
    const product = await stripe.products.retrieve(SETUP_PRODUCT_ID);
    if (!product.active) await stripe.products.update(SETUP_PRODUCT_ID, { active: true });
    return SETUP_PRODUCT_ID;
  } catch {
    try {
      await stripe.products.create({ id: SETUP_PRODUCT_ID, name: "Mise en service PharmaBoost", description: "Installation et configuration des postes de comptoir, paramétrage de l'officine et import du stock, tests, formation de l'équipe.", metadata: { kind: "setup_fee" } });
    } catch (error) {
      // Créé entre-temps par un autre appel : on le relit, sinon l'erreur remonte.
      await stripe.products.retrieve(SETUP_PRODUCT_ID).catch(() => {
        throw error;
      });
    }
    return SETUP_PRODUCT_ID;
  }
}

/**
 * Le prix Stripe ponctuel de la mise en service d'une offre, au montant de
 * l'offre. Un prix Stripe est immuable : si le montant a changé, un nouveau prix
 * est créé et l'ancien désactivé. `null` quand l'offre n'a pas de mise en service.
 */
export async function ensurePlanSetupPrice(planId: string, stripe: Stripe = getStripe()): Promise<string | null> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId }, select: { id: true, name: true, currency: true, setupFeeCents: true, stripeSetupPriceId: true } });
  const amount = plan.setupFeeCents ?? 0;
  if (amount <= 0) return null;
  if (plan.stripeSetupPriceId) {
    try {
      const price = await stripe.prices.retrieve(plan.stripeSetupPriceId);
      if (price.active && price.unit_amount === amount && price.currency === plan.currency && !price.recurring) return price.id;
      if (price.active) await stripe.prices.update(price.id, { active: false });
    } catch {
      // Prix introuvable (autre compte Stripe, supprimé) : on en crée un.
    }
  }
  const product = await ensureSetupProduct(stripe);
  const price = await stripe.prices.create({ currency: plan.currency, unit_amount: amount, product, nickname: `${plan.name} — mise en service`, metadata: { pharmaboostPlanId: plan.id, kind: "setup_fee" } });
  await prisma.plan.update({ where: { id: plan.id }, data: { stripeSetupPriceId: price.id } });
  return price.id;
}

/**
 * La ligne « mise en service » d'une souscription : le prix de l'offre quand le
 * montant est celui du catalogue, sinon (montant figé sur un lien plus ancien)
 * un prix ponctuel au montant exact, sur le même produit. `null` : aucune.
 */
export async function setupLineFor(planId: string, amountCents: number, stripe: Stripe = getStripe()): Promise<{ priceId: string } | { productId: string; unitAmountCents: number; currency: string } | null> {
  if (amountCents <= 0) return null;
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId }, select: { setupFeeCents: true, currency: true } });
  if (plan.setupFeeCents === amountCents) {
    const priceId = await ensurePlanSetupPrice(planId, stripe);
    if (priceId) return { priceId };
  }
  return { productId: await ensureSetupProduct(stripe), unitAmountCents: amountCents, currency: plan.currency };
}

const PORTAL_MARKER = "pharmaboost_portal_v1";
let portalConfigurationId: string | null = null;

/**
 * La configuration du portail client : moyen de paiement, factures, adresse et
 * n° de TVA — mais PAS de résiliation ni de changement d'offre en libre-service.
 * L'engagement de 12 mois ne se contourne pas depuis le portail : une résiliation
 * passe par l'équipe, qui la date à la fin de l'engagement.
 * `STRIPE_PORTAL_CONFIGURATION_ID` l'emporte quand il est renseigné.
 */
export async function ensurePortalConfiguration(stripe: Stripe = getStripe()): Promise<string> {
  const fromEnv = getEnv().STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) return fromEnv;
  if (portalConfigurationId) return portalConfigurationId;
  for await (const configuration of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (configuration.metadata?.pharmaboost === PORTAL_MARKER) {
      portalConfigurationId = configuration.id;
      return configuration.id;
    }
  }
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "PharmaBoost — votre abonnement" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["address", "name", "tax_id", "email"] },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { pharmaboost: PORTAL_MARKER },
  });
  portalConfigurationId = created.id;
  return created.id;
}

/** Pour les tests : oublier ce qui a été retenu en mémoire. */
export function resetStripeSetupCacheForTests(): void {
  vatTaxRateId = null;
  portalConfigurationId = null;
}
