import "server-only";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { generateToken, hashToken } from "@/server/security/tokens";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { getStripe, stripeConfigState } from "./stripe-client";
import { readSubscription, type SubscriptionShape } from "@/core/billing/stripe-shapes";
import { subscriptionStatusFromStripe, trialEndDate, trialSentence, formatEuros } from "@/core/billing/subscription";
import { buildSubscriptionInviteEmail, buildSubscriptionStartedEmail } from "@/core/platform/billing-emails";
import type { Plan, Prisma } from "@/generated/prisma";

/**
 * L'abonnement PharmaBoost, côté serveur : l'offre et son prix Stripe, le
 * client Stripe de l'officine, le lien d'activation, le Checkout, le portail,
 * et la synchronisation de l'état depuis Stripe.
 *
 * Deux règles structurelles :
 *   - un identifiant Stripe n'est jamais une autorisation : chaque fonction
 *     part d'une officine ou d'une organisation déjà autorisée par l'appelant
 *     (session titulaire ou console) ;
 *   - l'état affiché vient de Stripe (webhooks, ou relecture explicite),
 *     jamais du seul retour navigateur après le Checkout.
 */

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// ---------------------------------------------------------------- Offres

/**
 * Crée ou met à jour le produit et le prix Stripe d'une offre. Un prix Stripe
 * est immuable : si le tarif ou la devise a changé, un nouveau prix est créé
 * et l'ancien est désactivé pour les nouvelles souscriptions ; les
 * abonnements en cours gardent leur prix.
 */
export async function ensurePlanStripePrice(planId: string): Promise<{ ok: true; priceId: string; created: boolean } | { ok: false; error: string }> {
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Offre introuvable." };
  const stripe = getStripe();

  let productId = plan.stripeProductId;
  if (productId) {
    try {
      const product = await stripe.products.retrieve(productId);
      if (product.name !== plan.name || product.description !== (plan.description || undefined)) {
        await stripe.products.update(productId, { name: plan.name, description: plan.description || undefined });
      }
    } catch {
      productId = null;
    }
  }
  if (!productId) {
    const product = await stripe.products.create({ name: plan.name, description: plan.description || undefined, metadata: { pharmaboostPlanId: plan.id, pharmaboostPlanCode: plan.code } });
    productId = product.id;
  }

  let priceId = plan.stripePriceId;
  let created = false;
  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      const same = price.unit_amount === plan.monthlyPriceCents && price.currency === plan.currency && price.recurring?.interval === "month" && price.active && price.product === productId;
      if (!same) {
        if (price.active) await stripe.prices.update(priceId, { active: false });
        priceId = null;
      }
    } catch {
      priceId = null;
    }
  }
  if (!priceId) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.monthlyPriceCents,
      currency: plan.currency,
      recurring: { interval: "month" },
      nickname: `${plan.name} — mensuel`,
      metadata: { pharmaboostPlanId: plan.id },
    });
    priceId = price.id;
    created = true;
  }
  await prisma.plan.update({ where: { id: plan.id }, data: { stripeProductId: productId, stripePriceId: priceId } });
  return { ok: true, priceId, created };
}

// ---------------------------------------------------------------- Lien d'activation

export type InviteContext = {
  pharmacy: { id: string; name: string; organizationId: string; email: string | null; addressLine1: string | null; postalCode: string | null; city: string | null; siret: string | null };
  owner: { firstName: string; lastName: string; email: string } | null;
  plan: Plan;
  contractId: string | null;
};

async function loadInviteContext(pharmacyId: string, planId: string, contractId: string | null): Promise<{ ok: true; context: InviteContext } | { ok: false; error: string }> {
  const [pharmacy, plan] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, name: true, organizationId: true, email: true, addressLine1: true, postalCode: true, city: true, siret: true, memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
    }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  if (!plan || !plan.isActive) return { ok: false, error: "Offre introuvable ou archivée." };
  const owner = pharmacy.memberships[0]?.user ?? null;
  if (!owner && !pharmacy.email) return { ok: false, error: "Aucun titulaire ni adresse e-mail sur cette officine : impossible d'envoyer le lien." };
  if (contractId) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { pharmacyId: true, prospect: { select: { pharmacyId: true } } } });
    if (!contract || (contract.pharmacyId ?? contract.prospect.pharmacyId) !== pharmacyId) return { ok: false, error: "Ce contrat n'appartient pas à cette officine." };
  }
  return { ok: true, context: { pharmacy, owner, plan, contractId } };
}

/**
 * Crée le lien d'activation (ou réutilise celui en cours) et l'envoie au
 * titulaire. Le jeton en clair ne vit que le temps de l'e-mail.
 */
export async function sendSubscriptionInvite(params: { pharmacyId: string; planId: string; contractId: string | null; adminId: string }): Promise<{ ok: true; inviteId: string; sentTo: string; emailStatus: string } | { ok: false; error: string }> {
  const loaded = await loadInviteContext(params.pharmacyId, params.planId, params.contractId);
  if (!loaded.ok) return loaded;
  const { pharmacy, owner, plan, contractId } = loaded.context;
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const price = await ensurePlanStripePrice(plan.id);
  if (!price.ok) return price;

  const existingSubscription = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { stripeSubscriptionId: true, status: true } });
  if (existingSubscription?.stripeSubscriptionId && ["TRIALING", "ACTIVE", "PAST_DUE"].includes(existingSubscription.status)) {
    return { ok: false, error: "Cette officine a déjà un abonnement en cours. Utilisez « Voir l'abonnement »." };
  }

  const sentTo = owner?.email ?? pharmacy.email!;
  const token = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  // Un lien non consommé pour la même officine et la même offre est remplacé :
  // un seul lien vivant à la fois, celui de l'e-mail le plus récent.
  const previous = await prisma.subscriptionInvite.findFirst({ where: { pharmacyId: pharmacy.id, completedAt: null }, orderBy: { createdAt: "desc" } });
  const invite = previous
    ? await prisma.subscriptionInvite.update({ where: { id: previous.id }, data: { planId: plan.id, contractId, tokenHash: hashToken(token), sentTo, expiresAt, sentCount: { increment: 1 }, sentAt: now } })
    : await prisma.subscriptionInvite.create({ data: { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, planId: plan.id, contractId, tokenHash: hashToken(token), sentTo, expiresAt, sentCount: 1, sentAt: now, createdByAdminId: params.adminId } });

  const company = await prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } });
  const message = buildSubscriptionInviteEmail({
    ownerName: owner ? `${owner.firstName} ${owner.lastName}` : pharmacy.name,
    pharmacyName: pharmacy.name,
    planName: plan.name,
    monthlyPriceCents: plan.monthlyPriceCents,
    trialDays: plan.trialDays,
    url: publicUrl(`/abonnement/activer/${token}`),
    expiresAt,
    contactEmail: company?.representativeEmail ?? "contact@pharmaboost.app",
  });
  const outcome = await getMessagingProvider().sendEmail({ to: sentTo, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  if (outcome.status !== "SENT") {
    await prisma.subscriptionInvite.update({ where: { id: invite.id }, data: { sentAt: previous?.sentAt ?? null, sentCount: { decrement: 1 } } });
    return { ok: false, error: `Le lien n'a pas pu être envoyé : ${outcome.detail}` };
  }
  await recordAudit({ action: "billing.invite_sent", entityType: "SubscriptionInvite", entityId: invite.id, platformAdminId: params.adminId, metadata: { pharmacyId: pharmacy.id, planId: plan.id, contractId, sentTo } });
  return { ok: true, inviteId: invite.id, sentTo, emailStatus: outcome.status };
}

/** Le lien, vu par le titulaire : ce qu'il va souscrire, avant d'aller chez Stripe. */
export async function peekInvite(token: string) {
  if (!token || token.length < 16) return null;
  const invite = await prisma.subscriptionInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { plan: true, pharmacy: { select: { id: true, name: true, organizationId: true } }, contract: { select: { status: true, version: true } } },
  });
  if (!invite) return null;
  if (invite.expiresAt < new Date() && !invite.completedAt) return { expired: true as const, invite };
  if (!invite.openedAt) await prisma.subscriptionInvite.update({ where: { id: invite.id }, data: { openedAt: new Date() } });
  return { expired: false as const, invite };
}

/**
 * Ouvre le Checkout Stripe pour ce lien : un client Stripe par officine
 * (réutilisé), une session fraîche à chaque clic, l'essai et le prix de
 * l'offre, et toutes les métadonnées qui rattachent la future Subscription à
 * l'officine, à l'offre et au contrat.
 */
export async function startCheckoutForInvite(token: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const peeked = await peekInvite(token);
  if (!peeked) return { ok: false, error: "Ce lien n'est pas valide." };
  if (peeked.expired) return { ok: false, error: "Ce lien a expiré. Demandez-nous un nouveau lien." };
  const { invite } = peeked;
  if (invite.completedAt) return { ok: false, error: "Cet abonnement a déjà été activé." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: "Le paiement n'est pas encore disponible. Réessayez plus tard ou contactez-nous." };
  const price = await ensurePlanStripePrice(invite.planId);
  if (!price.ok) return { ok: false, error: price.error };

  const stripe = getStripe();
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: invite.pharmacyId },
    select: { name: true, email: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, country: true, siret: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
  });
  const owner = pharmacy.memberships[0]?.user ?? null;
  const existing = await prisma.subscription.findUnique({ where: { organizationId: invite.organizationId }, select: { externalCustomerId: true } });

  let customerId = invite.stripeCustomerId ?? existing?.externalCustomerId ?? null;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if ("deleted" in customer && customer.deleted) customerId = null;
    } catch {
      customerId = null;
    }
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: pharmacy.name,
      email: invite.sentTo,
      address: pharmacy.addressLine1 ? { line1: pharmacy.addressLine1, line2: pharmacy.addressLine2 ?? undefined, postal_code: pharmacy.postalCode ?? undefined, city: pharmacy.city ?? undefined, country: pharmacy.country || "FR" } : undefined,
      metadata: { pharmacyId: invite.pharmacyId, organizationId: invite.organizationId, ownerName: owner ? `${owner.firstName} ${owner.lastName}` : "", siret: pharmacy.siret ?? "" },
    });
    customerId = customer.id;
  }

  const trialDays = Math.max(0, invite.plan.trialDays);
  const trialEndsAt = trialEndDate(new Date(), trialDays);
  const metadata = { pharmacyId: invite.pharmacyId, organizationId: invite.organizationId, planId: invite.planId, contractId: invite.contractId ?? "", inviteId: invite.id };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    customer_update: { address: "auto", name: "auto" },
    line_items: [{ price: price.priceId, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      ...(trialDays > 0 ? { trial_period_days: trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
      metadata,
      description: `Abonnement PharmaBoost — ${pharmacy.name}`,
    },
    metadata,
    client_reference_id: invite.id,
    locale: "fr",
    allow_promotion_codes: false,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    custom_text: {
      submit: { message: trialSentence({ monthlyPriceCents: invite.plan.monthlyPriceCents, trialDays, trialEndsAt }) },
    },
    success_url: publicUrl(`/abonnement/merci?session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: publicUrl(`/abonnement/activer/${token}`),
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  });
  if (!session.url) return { ok: false, error: "Stripe n'a pas fourni d'adresse de paiement." };
  await prisma.subscriptionInvite.update({ where: { id: invite.id }, data: { stripeCustomerId: customerId, checkoutSessionId: session.id, checkoutCreatedAt: new Date() } });
  return { ok: true, url: session.url };
}

// ---------------------------------------------------------------- Synchronisation depuis Stripe

/**
 * Retrouve l'organisation que concerne un abonnement Stripe : par ses
 * métadonnées, par l'abonnement déjà connu, par le client Stripe déjà connu,
 * ou par le lien d'activation qui a créé le client. Sans correspondance, on ne
 * rattache rien : un abonnement inconnu ne s'invente pas une officine.
 */
async function resolveOrganizationForSubscription(shape: SubscriptionShape): Promise<string | null> {
  if (shape.metadata.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: shape.metadata.organizationId }, select: { id: true } });
    if (org) return org.id;
  }
  if (shape.id) {
    const known = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: shape.id }, select: { organizationId: true } });
    if (known) return known.organizationId;
  }
  if (shape.customerId) {
    const byCustomer = await prisma.subscription.findUnique({ where: { externalCustomerId: shape.customerId }, select: { organizationId: true } });
    if (byCustomer) return byCustomer.organizationId;
    const invite = await prisma.subscriptionInvite.findFirst({ where: { stripeCustomerId: shape.customerId }, orderBy: { createdAt: "desc" }, select: { organizationId: true } });
    if (invite) return invite.organizationId;
  }
  return null;
}

/** Applique l'état d'un abonnement Stripe à notre ligne `Subscription`. Idempotent. */
export async function syncSubscriptionFromStripe(shape: SubscriptionShape): Promise<{ organizationId: string; subscriptionId: string; created: boolean; statusChanged: boolean } | null> {
  const organizationId = await resolveOrganizationForSubscription(shape);
  if (!organizationId || !shape.id) return null;
  const plan = shape.metadata.planId
    ? await prisma.plan.findUnique({ where: { id: shape.metadata.planId }, select: { id: true } })
    : shape.priceId
      ? await prisma.plan.findUnique({ where: { stripePriceId: shape.priceId }, select: { id: true } })
      : null;
  const existing = await prisma.subscription.findUnique({ where: { organizationId } });
  // Un ancien abonnement Stripe (résilié) ne doit pas écraser un plus récent.
  if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== shape.id && existing.status !== "CANCELED" && existing.status !== "INCOMPLETE_EXPIRED") {
    return null;
  }
  const status = subscriptionStatusFromStripe(shape.status, existing?.status ?? "INCOMPLETE");
  const data = {
    planId: plan?.id ?? existing?.planId,
    status: existing?.suspendedAt ? ("SUSPENDED" as const) : status,
    trialStartsAt: shape.trialStart,
    trialEndsAt: shape.trialEnd,
    currentPeriodStart: shape.currentPeriodStart ?? existing?.currentPeriodStart ?? new Date(),
    currentPeriodEnd: shape.currentPeriodEnd,
    cancelAtPeriodEnd: shape.cancelAtPeriodEnd,
    cancelAt: shape.cancelAt,
    canceledAt: shape.canceledAt,
    endedAt: shape.endedAt,
    externalCustomerId: shape.customerId ?? existing?.externalCustomerId ?? null,
    stripeSubscriptionId: shape.id,
    stripePriceId: shape.priceId,
    nextInvoiceAt: status === "CANCELED" ? null : shape.currentPeriodEnd,
    contractId: shape.metadata.contractId || existing?.contractId || null,
  };
  if (!data.planId) return null;
  const row = existing
    ? await prisma.subscription.update({ where: { organizationId }, data })
    : await prisma.subscription.create({ data: { organizationId, ...data, planId: data.planId } });
  if (shape.metadata.inviteId) {
    await prisma.subscriptionInvite.updateMany({ where: { id: shape.metadata.inviteId, completedAt: null }, data: { completedAt: new Date(), stripeCustomerId: shape.customerId ?? undefined } });
  }
  return { organizationId, subscriptionId: row.id, created: !existing, statusChanged: existing?.status !== row.status };
}

/** Relit l'abonnement chez Stripe et l'applique (webhook manqué, ou vérification). */
export async function refreshSubscriptionFromStripe(organizationId: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId }, select: { stripeSubscriptionId: true } });
  if (!subscription?.stripeSubscriptionId) return { ok: false, error: "Aucun abonnement Stripe rattaché à cette organisation." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscription.stripeSubscriptionId);
  const synced = await syncSubscriptionFromStripe(readSubscription(stripeSubscription));
  if (!synced) return { ok: false, error: "L'abonnement Stripe n'a pas pu être rattaché." };
  const row = await prisma.subscription.findUniqueOrThrow({ where: { organizationId }, select: { status: true } });
  return { ok: true, status: row.status };
}

/** Après la première synchronisation d'un abonnement, prévenir le titulaire et la console. */
export async function announceSubscriptionStarted(organizationId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true, organization: { select: { pharmacies: { take: 1, select: { id: true, name: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } } } } } } });
  const pharmacy = subscription?.organization.pharmacies[0];
  if (!subscription || !pharmacy) return;
  const owner = pharmacy.memberships[0]?.user;
  if (owner) {
    const message = buildSubscriptionStartedEmail({ ownerName: `${owner.firstName} ${owner.lastName}`, pharmacyName: pharmacy.name, planName: subscription.plan.name, monthlyPriceCents: subscription.plan.monthlyPriceCents, trialEndsAt: subscription.trialEndsAt, appUrl: publicUrl("/") });
    await getMessagingProvider().sendEmail({ to: owner.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  }
  await notifyAdmins({ type: "SUBSCRIPTION_STARTED", title: `${pharmacy.name} : abonnement démarré`, body: `${subscription.plan.name} — ${formatEuros(subscription.plan.monthlyPriceCents)}/mois${subscription.trialEndsAt ? `, essai jusqu'au ${subscription.trialEndsAt.toLocaleDateString("fr-FR")}` : ""}.`, linkUrl: `/admin/abonnements/${pharmacy.id}`, severity: "SUCCESS" });
  const prospect = await prisma.prospect.findUnique({ where: { pharmacyId: pharmacy.id }, select: { id: true, status: true } });
  if (prospect && prospect.status !== "ACTIVATED") await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "ACTIVATED" } });
}

// ---------------------------------------------------------------- Portail et gestes

/** Le portail client Stripe, pour l'organisation de la session (moyen de paiement, factures). */
export async function createPortalSession(organizationId: string, returnPath: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId }, select: { externalCustomerId: true } });
  if (!subscription?.externalCustomerId) return { ok: false, error: "Aucun abonnement Stripe n'est rattaché à votre officine." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: "Le portail de facturation n'est pas disponible pour le moment." };
  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.externalCustomerId,
    return_url: publicUrl(returnPath),
    ...(getEnv().STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: getEnv().STRIPE_PORTAL_CONFIGURATION_ID } : {}),
    locale: "fr",
  });
  return { ok: true, url: session.url };
}

/** Programme (ou annule) la résiliation à la fin de la période en cours. Décision de l'administrateur, tracée. */
export async function setCancelAtPeriodEnd(organizationId: string, cancel: boolean, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId }, select: { stripeSubscriptionId: true } });
  if (!subscription?.stripeSubscriptionId) return { ok: false, error: "Aucun abonnement Stripe rattaché." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const updated = await getStripe().subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: cancel });
  await syncSubscriptionFromStripe(readSubscription(updated));
  await recordAudit({ action: cancel ? "billing.cancel_scheduled" : "billing.cancel_revoked", entityType: "Subscription", entityId: subscription.stripeSubscriptionId, platformAdminId: adminId, metadata: { organizationId } });
  return { ok: true };
}

/** Suspend ou rétablit l'accès : l'officine est désactivée, l'abonnement marqué. Stripe n'est pas touché. */
export async function setAccessSuspended(pharmacyId: string, suspended: boolean, reason: string | null, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, organizationId: true, name: true } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { id: true, stripeSubscriptionId: true } });
  await prisma.$transaction(async (tx) => {
    await tx.pharmacy.update({ where: { id: pharmacy.id }, data: { isActive: !suspended } });
    if (suspended) await tx.session.updateMany({ where: { pharmacyId: pharmacy.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (subscription) {
      if (suspended) {
        await tx.subscription.update({ where: { id: subscription.id }, data: { suspendedAt: new Date(), suspendedReason: reason, status: "SUSPENDED" } });
      } else {
        await tx.subscription.update({ where: { id: subscription.id }, data: { suspendedAt: null, suspendedReason: null } });
      }
    }
  });
  if (!suspended && subscription?.stripeSubscriptionId) await refreshSubscriptionFromStripe(pharmacy.organizationId).catch(() => null);
  await recordAudit({ action: suspended ? "billing.access_suspended" : "billing.access_restored", entityType: "Pharmacy", entityId: pharmacy.id, platformAdminId: adminId, metadata: { reason } });
  return { ok: true };
}

// ---------------------------------------------------------------- Lectures

export type PharmacyBillingRow = Prisma.PharmacyGetPayload<{
  select: {
    id: true; name: true; city: true; isActive: true; organizationId: true; createdAt: true;
    organization: { select: { subscription: { include: { plan: true; payments: { orderBy: { createdAt: "desc" }; take: 1 } } } } };
    contracts: { orderBy: { version: "desc" }; take: 1; select: { id: true; status: true; version: true; sentAt: true; finalizedAt: true; monthlyPriceCents: true; trialDays: true; plan: { select: { name: true } } } };
    prospect: { select: { id: true; contracts: { orderBy: { version: "desc" }; take: 1; select: { id: true; status: true; version: true; sentAt: true; finalizedAt: true; monthlyPriceCents: true; trialDays: true; plan: { select: { name: true } } } } } };
    subscriptionInvites: { orderBy: { createdAt: "desc" }; take: 1; select: { id: true; sentAt: true; sentCount: true; openedAt: true; completedAt: true; expiresAt: true; sentTo: true; plan: { select: { name: true; monthlyPriceCents: true; trialDays: true } } } };
    memberships: { where: { role: "OWNER"; isActive: true }; take: 1; select: { user: { select: { firstName: true; lastName: true; email: true } } } };
  };
}>;

export const PHARMACY_BILLING_SELECT = {
  id: true, name: true, city: true, isActive: true, organizationId: true, createdAt: true,
  organization: { select: { subscription: { include: { plan: true, payments: { orderBy: { createdAt: "desc" as const }, take: 1 } } } } },
  contracts: { orderBy: { version: "desc" as const }, take: 1, select: { id: true, status: true, version: true, sentAt: true, finalizedAt: true, monthlyPriceCents: true, trialDays: true, plan: { select: { name: true } } } },
  prospect: { select: { id: true, contracts: { orderBy: { version: "desc" as const }, take: 1, select: { id: true, status: true, version: true, sentAt: true, finalizedAt: true, monthlyPriceCents: true, trialDays: true, plan: { select: { name: true } } } } } },
  subscriptionInvites: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, sentAt: true, sentCount: true, openedAt: true, completedAt: true, expiresAt: true, sentTo: true, plan: { select: { name: true, monthlyPriceCents: true, trialDays: true } } } },
  memberships: { where: { role: "OWNER" as const, isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } },
} satisfies Prisma.PharmacySelect;

/** Le dernier contrat d'une officine : rattaché directement, sinon via son dossier. */
export function latestContractOf(row: PharmacyBillingRow) {
  return row.contracts[0] ?? row.prospect?.contracts[0] ?? null;
}

export async function listPharmaciesBilling(): Promise<PharmacyBillingRow[]> {
  return prisma.pharmacy.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: PHARMACY_BILLING_SELECT });
}

export async function getPharmacyBilling(pharmacyId: string): Promise<PharmacyBillingRow | null> {
  return prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: PHARMACY_BILLING_SELECT });
}

/** L'historique d'une officine : événements Stripe, paiements, événements du dossier. */
export async function getPharmacyBillingHistory(pharmacyId: string, organizationId: string) {
  const [events, payments, dossierEvents] = await Promise.all([
    prisma.billingEvent.findMany({ where: { OR: [{ organizationId }, { pharmacyId }] }, orderBy: { receivedAt: "desc" }, take: 100 }),
    prisma.billingPayment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.prospectEvent.findMany({ where: { prospect: { pharmacyId } }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  return { events, payments, dossierEvents };
}
