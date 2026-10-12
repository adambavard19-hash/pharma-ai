import "server-only";
import { prisma } from "@/server/db/client";
import { withAdvisoryLock } from "@/server/db/advisory-lock";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { recordProspectEvent } from "@/server/services/sales/events";
import { createPharmacyFromProspect } from "@/server/services/sales/client-pharmacies";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { buildSubscriptionCheckout, firstInvoiceSentence } from "@/core/billing/checkout";
import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";
import { SUBSCRIPTION_TERMS_VERSION } from "@/core/billing/subscription-terms";
import type { CheckoutSessionShape } from "@/core/billing/stripe-shapes";
import { getStripe, stripeConfigState } from "./stripe-client";
import { ensureVatTaxRate, setupLineFor } from "./stripe-setup";
import { ensurePlanStripePrice, ensureStripeCustomer } from "./subscriptions";

/**
 * La souscription EN LIGNE, depuis le site : le titulaire remplit le formulaire,
 * accepte les conditions d'abonnement, paie (prélèvement SEPA ou carte) la mise en
 * service et le premier mois, et son espace PharmaBoost se crée tout seul.
 *
 * Elle n'est ouverte que si Stripe est configuré ET si la console a publié une
 * offre par défaut complète (prix mensuel et mise en service) : le visiteur paie
 * exactement ce que le site affiche. Sinon le formulaire reste une demande que
 * l'équipe reprend (contrat, puis lien d'activation).
 *
 * Règle de prudence pour le prélèvement SEPA : l'espace est créé dès que Stripe
 * confirme la souscription (mandat signé ou carte acceptée), pour que la mise en
 * service puisse être planifiée sans attendre ; mais rien n'est compté comme PAYÉ
 * (paiement, commission du commercial, remise du parrain) avant la facture payée
 * (`invoice.paid`). Un prélèvement rejeté suit le chemin des impayés.
 */

/** La version du texte des conditions acceptées, gardée sur le dossier avec l'heure d'acceptation. */
export const SELF_SERVICE_TERMS_VERSION = SUBSCRIPTION_TERMS_VERSION;

export type SelfServiceAvailability = { available: true; planId: string; monthlyPriceCents: number; setupFeeCents: number; commitmentMonths: number } | { available: false; reason: string };

export async function selfServiceAvailability(): Promise<SelfServiceAvailability> {
  const stripe = stripeConfigState();
  if (!stripe.configured) return { available: false, reason: `Stripe n'est pas configuré : ${stripe.detail}` };
  const pricing = await loadPublicPricing();
  if (pricing.source !== "PLAN" || !pricing.planId) return { available: false, reason: "Aucune offre par défaut complète n'est publiée dans la console (Offres & tarifs → « Publier l'offre officielle »)." };
  return { available: true, planId: pricing.planId, monthlyPriceCents: pricing.monthlyPriceCents, setupFeeCents: pricing.setupFeeCents, commitmentMonths: pricing.commitmentMonths };
}

/**
 * Ouvre le paiement Stripe d'un dossier en libre-service, tout juste créé par le
 * formulaire du site. Le client Stripe porte le dossier (l'officine n'existe pas
 * encore) ; la session et l'abonnement aussi, par leurs métadonnées.
 * Aucun essai : la première facture porte la mise en service et le premier mois.
 */
export async function startSelfServiceCheckout(prospectId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const availability = await selfServiceAvailability();
  if (!availability.available) return { ok: false, error: "Le paiement en ligne n'est pas ouvert : notre équipe revient vers vous." };
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, name: true, email: true, phone: true, siret: true, addressLine1: true, postalCode: true, city: true, ownerName: true, planId: true, pharmacyId: true, termsAcceptedAt: true, selfCheckoutSessionId: true } });
  if (!prospect || !prospect.email) return { ok: false, error: "Dossier introuvable." };
  if (prospect.pharmacyId) return { ok: false, error: "Cet abonnement est déjà activé." };
  if (!prospect.termsAcceptedAt) return { ok: false, error: "Acceptez les conditions d'abonnement pour continuer." };
  if (prospect.planId !== availability.planId) return { ok: false, error: "L'offre a changé entre-temps : notre équipe revient vers vous." };

  const price = await ensurePlanStripePrice(availability.planId);
  if (!price.ok) return { ok: false, error: "Le paiement en ligne est momentanément indisponible : notre équipe revient vers vous." };
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: availability.planId }, select: { monthlyPriceCents: true } });
  const setupFeeCents = availability.setupFeeCents;
  const commitmentMonths = OFFICIAL_OFFER.commitmentMonths;

  const customerId = await ensureStripeCustomer(null, {
    name: prospect.name,
    email: prospect.email,
    phone: prospect.phone,
    address: prospect.addressLine1 ? { line1: prospect.addressLine1, postalCode: prospect.postalCode, city: prospect.city, country: "FR" } : null,
    metadata: { prospectId: prospect.id, ownerName: prospect.ownerName ?? "", siret: prospect.siret ?? "", source: "SELF_SERVICE" },
  });
  const metadata = { prospectId: prospect.id, planId: availability.planId, source: "SELF_SERVICE", commitmentMonths: String(commitmentMonths), setupFeeCents: String(setupFeeCents), termsVersion: SELF_SERVICE_TERMS_VERSION };
  const [taxRateId, setup] = await Promise.all([ensureVatTaxRate(), setupLineFor(availability.planId, setupFeeCents)]);
  const session = await getStripe().checkout.sessions.create(
    buildSubscriptionCheckout({
      customerId,
      recurring: { priceId: price.priceId },
      setup,
      taxRateId,
      trialDays: 0,
      metadata,
      clientReferenceId: prospect.id,
      description: `Abonnement PharmaBoost — ${prospect.name}`,
      submitMessage: firstInvoiceSentence({ monthlyCents: plan.monthlyPriceCents, setupFeeCents, trialDays: 0, commitmentMonths }),
      successUrl: publicUrl(`/abonnement/merci?session_id={CHECKOUT_SESSION_ID}`),
      cancelUrl: publicUrl("/decouvrir/abonnement?paiement=annule"),
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }),
  );
  if (!session.url) return { ok: false, error: "Stripe n'a pas fourni d'adresse de paiement." };
  await prisma.prospect.update({ where: { id: prospect.id }, data: { selfCheckoutSessionId: session.id } });
  return { ok: true, url: session.url };
}

/**
 * La souscription en ligne est confirmée par Stripe : l'espace PharmaBoost naît
 * du dossier (officine, organisation, titulaire, parrain), une seule fois même si
 * Stripe renvoie l'événement ou en envoie deux à la fois. Rend l'officine, ou
 * `null` quand la session n'est pas une souscription en ligne connue.
 */
export async function completeSelfServiceCheckout(session: CheckoutSessionShape): Promise<{ pharmacyId: string; created: boolean } | null> {
  const prospectId = session.metadata.prospectId;
  if (session.metadata.source !== "SELF_SERVICE" || !prospectId) return null;
  if (session.status !== "complete") return null;
  return withAdvisoryLock(`self-checkout:${prospectId}`, async () => {
    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, name: true, pharmacyId: true, termsAcceptedAt: true, selfCheckoutSessionId: true } });
    if (!prospect) return null;
    if (prospect.pharmacyId) return { pharmacyId: prospect.pharmacyId, created: false };
    const system = { type: "SYSTEM" as const, label: "Souscription en ligne" };
    const created = await createPharmacyFromProspect(prospect.id, system, { paidCheckout: true });
    if (!created.ok) {
      // Paiement validé mais espace non créé (adresse prise entre-temps…) : l'équipe le fait à la main, rien n'est perdu.
      await recordProspectEvent({ prospectId: prospect.id, type: "NOTE", summary: `Paiement en ligne validé, mais l'espace n'a pas pu être créé : ${created.error}`, actor: system });
      await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Souscription payée à finaliser — ${prospect.name}`, body: `Stripe a validé la souscription, mais l'espace PharmaBoost n'a pas pu être créé : ${created.error} Créez-le depuis le dossier ; l'abonnement Stripe s'y rattachera.`, linkUrl: `/admin/dossiers/${prospect.id}`, severity: "CRITICAL" });
      return null;
    }
    await recordProspectEvent({ prospectId: prospect.id, type: "SUBSCRIPTION_REQUESTED", summary: `Souscription en ligne confirmée par Stripe (${session.paymentStatus === "paid" ? "paiement reçu" : "prélèvement SEPA en cours"}) : espace PharmaBoost créé.`, actor: system, metadata: { checkoutSessionId: session.id, paymentStatus: session.paymentStatus } });
    await recordAudit({ action: "billing.self_checkout_completed", entityType: "Pharmacy", entityId: created.pharmacyId, pharmacyId: created.pharmacyId, metadata: { prospectId: prospect.id, checkoutSessionId: session.id, paymentStatus: session.paymentStatus, termsVersion: session.metadata.termsVersion ?? null, termsAcceptedAt: prospect.termsAcceptedAt?.toISOString() ?? null } });
    return { pharmacyId: created.pharmacyId, created: true };
  });
}
