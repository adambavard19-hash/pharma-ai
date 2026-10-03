import "server-only";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { generateToken, hashToken } from "@/server/security/tokens";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { sendInstallationGuide } from "@/server/services/platform-onboarding";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { traceDispatch } from "@/server/services/email-dispatch";
import { getStripe, stripeConfigState } from "./stripe-client";
import { readSubscription, type SubscriptionShape } from "@/core/billing/stripe-shapes";
import { SUBSCRIPTION_STATUSES, subscriptionStatusFromStripe, trialEndDate, trialSentence, formatEuros, formatFrenchDate, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { contractualPrice, initialContractPriceCents } from "@/core/billing/contract-price";
import { buildSubscriptionInviteEmail, buildSubscriptionStartedEmail } from "@/core/platform/billing-emails";
import type { Plan, Prisma } from "@/generated/prisma";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

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

/** Seul un contrat signé des deux parties fonde un lien d'activation : son identifiant, son tarif, son essai. */
export const SIGNED_CONTRACT_STATUS = "FINALIZED";

type InviteContract = { status: string; monthlyPriceCents: number; trialDays: number };

/**
 * Ce que facture un lien d'activation : le tarif et l'essai du contrat signé
 * qu'il porte, tels qu'imprimés au contrat ; sans contrat signé (aucun,
 * brouillon, en signature, refusé, expiré), le tarif et l'essai catalogue de
 * l'offre au moment du clic.
 */
export function inviteTerms(plan: { monthlyPriceCents: number; trialDays: number }, contract: InviteContract | null): { monthlyPriceCents: number; trialDays: number; fromContract: boolean } {
  if (contract && contract.status === SIGNED_CONTRACT_STATUS) {
    return { monthlyPriceCents: initialContractPriceCents({ contractMonthlyPriceCents: contract.monthlyPriceCents, planMonthlyPriceCents: plan.monthlyPriceCents }), trialDays: Math.max(0, contract.trialDays), fromContract: true };
  }
  return { monthlyPriceCents: plan.monthlyPriceCents, trialDays: Math.max(0, plan.trialDays), fromContract: false };
}

export type InviteContext = {
  pharmacy: { id: string; name: string; organizationId: string; email: string | null; addressLine1: string | null; postalCode: string | null; city: string | null; siret: string | null };
  owner: { firstName: string; lastName: string; email: string } | null;
  plan: Plan;
  contractId: string | null;
  contract: InviteContract | null;
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
  let contract: InviteContract | null = null;
  if (contractId) {
    const found = await prisma.contract.findUnique({ where: { id: contractId }, select: { pharmacyId: true, planId: true, status: true, version: true, monthlyPriceCents: true, trialDays: true, prospect: { select: { pharmacyId: true } } } });
    if (!found || (found.pharmacyId ?? found.prospect.pharmacyId) !== pharmacyId) return { ok: false, error: "Ce contrat n'appartient pas à cette officine." };
    if (found.status !== SIGNED_CONTRACT_STATUS) return { ok: false, error: `Le contrat v${found.version} n'est pas signé : le lien ne peut pas reprendre ses conditions.` };
    if (found.planId !== plan.id) return { ok: false, error: `Le contrat v${found.version} porte sur une autre offre que celle du lien.` };
    contract = { status: found.status, monthlyPriceCents: found.monthlyPriceCents, trialDays: found.trialDays };
  }
  return { ok: true, context: { pharmacy, owner, plan, contractId, contract } };
}

/**
 * Crée le lien d'activation (ou réutilise celui en cours) et l'envoie au
 * titulaire. Le jeton en clair ne vit que le temps de l'e-mail.
 */
export async function sendSubscriptionInvite(params: { pharmacyId: string; planId: string; contractId: string | null; adminId: string }): Promise<{ ok: true; inviteId: string; sentTo: string; emailStatus: string } | { ok: false; error: string }> {
  const loaded = await loadInviteContext(params.pharmacyId, params.planId, params.contractId);
  if (!loaded.ok) return loaded;
  const { pharmacy, owner, plan, contractId, contract } = loaded.context;
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const price = await ensurePlanStripePrice(plan.id);
  if (!price.ok) return price;

  const existingSubscription = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { stripeSubscriptionId: true, status: true } });
  if (existingSubscription?.stripeSubscriptionId && ["TRIALING", "ACTIVE", "PAST_DUE"].includes(existingSubscription.status)) {
    return { ok: false, error: "Cette officine a déjà un abonnement en cours. Utilisez « Voir l'abonnement »." };
  }

  const sentTo = owner?.email ?? pharmacy.email!;
  // Le prix et l'essai annoncés sont ceux qui seront facturés : ceux du contrat signé quand le lien en porte un.
  const terms = inviteTerms(plan, contract);
  const token = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  // Un lien non consommé pour la même officine et la même offre est remplacé :
  // un seul lien vivant à la fois, celui de l'e-mail le plus récent.
  const previous = await prisma.subscriptionInvite.findFirst({ where: { pharmacyId: pharmacy.id, completedAt: null }, orderBy: { createdAt: "desc" } });
  const invite = previous
    ? await prisma.subscriptionInvite.update({ where: { id: previous.id }, data: { planId: plan.id, contractId, tokenHash: hashToken(token), sentTo, expiresAt, sentCount: { increment: 1 }, sentAt: now } })
    : await prisma.subscriptionInvite.create({ data: { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, planId: plan.id, contractId, tokenHash: hashToken(token), sentTo, expiresAt, sentCount: 1, sentAt: now, createdByAdminId: params.adminId } });

  const message = buildSubscriptionInviteEmail({
    ownerName: owner ? `${owner.firstName} ${owner.lastName}` : pharmacy.name,
    pharmacyName: pharmacy.name,
    planName: plan.name,
    monthlyPriceCents: terms.monthlyPriceCents,
    trialDays: terms.trialDays,
    url: publicUrl(`/abonnement/activer/${token}`),
    expiresAt,
    contactEmail: PUBLIC_CONTACT_EMAIL,
  });
  const outcome = await getMessagingProvider().sendEmail({ to: sentTo, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  // Le journal des e-mails garde chaque envoi, réussi ou non.
  await traceDispatch({ kind: "SUBSCRIPTION_INVITE", recipient: sentTo, outcome, subject: message.subject, trigger: "SYSTEM", pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, contractId, sentByAdminId: params.adminId });
  if (outcome.status !== "SENT") {
    await prisma.subscriptionInvite.update({ where: { id: invite.id }, data: { sentAt: previous?.sentAt ?? null, sentCount: { decrement: 1 } } });
    return { ok: false, error: `Le lien n'a pas pu être envoyé : ${outcome.detail}` };
  }
  await recordAudit({ action: "billing.invite_sent", entityType: "SubscriptionInvite", entityId: invite.id, platformAdminId: params.adminId, metadata: { pharmacyId: pharmacy.id, planId: plan.id, contractId, sentTo } });
  return { ok: true, inviteId: invite.id, sentTo, emailStatus: outcome.status };
}

async function findInviteByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.subscriptionInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { plan: true, pharmacy: { select: { id: true, name: true, organizationId: true } }, contract: { select: { status: true, version: true, planId: true, monthlyPriceCents: true, trialDays: true } } },
  });
}

/**
 * Le lien, vu par le titulaire : ce qu'il va souscrire, avant d'aller chez
 * Stripe. Le tarif et l'essai montrés (`plan.monthlyPriceCents`,
 * `plan.trialDays`) sont ceux qu'il paiera : ceux du contrat signé quand le
 * lien en porte un ; le catalogue reste lisible dans `catalogMonthlyPriceCents`
 * et `catalogTrialDays`. Un contrat non signé n'est pas repris : ni son
 * tarif, ni son essai, ni son identifiant.
 */
export async function peekInvite(token: string) {
  const found = await findInviteByToken(token);
  if (!found) return null;
  // Un contrat portant sur une autre offre que celle du lien ne fonde rien.
  const terms = inviteTerms(found.plan, found.contract?.planId === found.planId ? found.contract : null);
  const invite = {
    ...found,
    contractId: terms.fromContract ? found.contractId : null,
    contract: terms.fromContract ? found.contract : null,
    plan: { ...found.plan, monthlyPriceCents: terms.monthlyPriceCents, trialDays: terms.trialDays },
    catalogMonthlyPriceCents: found.plan.monthlyPriceCents,
    catalogTrialDays: found.plan.trialDays,
    billedMonthlyPriceCents: terms.monthlyPriceCents,
    billedTrialDays: terms.trialDays,
  };
  if (invite.expiresAt < new Date() && !invite.completedAt) return { expired: true as const, invite };
  if (!invite.openedAt) await prisma.subscriptionInvite.update({ where: { id: invite.id }, data: { openedAt: new Date() } });
  return { expired: false as const, invite };
}

/**
 * Ouvre le Checkout Stripe pour ce lien : un client Stripe par officine
 * (réutilisé), une session fraîche à chaque clic, l'essai du contrat signé
 * (sinon de l'offre), et
 * toutes les métadonnées qui rattachent la future Subscription à l'officine,
 * à l'offre et au contrat.
 *
 * Le prix facturé est celui du CONTRAT SIGNÉ quand le lien en porte un dont
 * le tarif diffère du catalogue (prix créé à la volée sur le produit Stripe
 * de l'offre) ; sinon le prix Stripe de l'offre.
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

  // L'essai du contrat signé quand le lien en porte un (tel qu'imprimé), sinon celui de l'offre.
  const trialDays = invite.billedTrialDays;
  const trialEndsAt = trialEndDate(new Date(), trialDays);
  const metadata = { pharmacyId: invite.pharmacyId, organizationId: invite.organizationId, planId: invite.planId, contractId: invite.contractId ?? "", inviteId: invite.id };
  const billedCents = invite.billedMonthlyPriceCents;
  let lineItem: { price: string; quantity: number } | { price_data: { currency: string; product: string; unit_amount: number; recurring: { interval: "month" } }; quantity: number } = { price: price.priceId, quantity: 1 };
  if (invite.contractId && billedCents !== invite.catalogMonthlyPriceCents) {
    // Tarif contractuel : même produit Stripe que l'offre, montant du contrat.
    const plan = await prisma.plan.findUnique({ where: { id: invite.planId }, select: { stripeProductId: true, currency: true } });
    if (!plan?.stripeProductId) return { ok: false, error: "Le produit Stripe de l'offre est introuvable. Contactez-nous." };
    lineItem = { price_data: { currency: plan.currency, product: plan.stripeProductId, unit_amount: billedCents, recurring: { interval: "month" } }, quantity: 1 };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    customer_update: { address: "auto", name: "auto" },
    line_items: [lineItem],
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
      submit: { message: trialSentence({ monthlyPriceCents: billedCents, trialDays, trialEndsAt }) },
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

/**
 * Le contrat qui peut fonder un abonnement : signé des deux parties
 * (FINALIZED) et rattaché à cette organisation. Sinon rien : un brouillon,
 * un contrat refusé ou expiré ne fixe ni tarif ni « contrat d'origine ».
 */
async function signedContractOf(organizationId: string, contractId: string | null): Promise<{ id: string; version: number; monthlyPriceCents: number } | null> {
  if (!contractId) return null;
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { status: true, version: true, monthlyPriceCents: true, pharmacy: { select: { organizationId: true } }, prospect: { select: { pharmacy: { select: { organizationId: true } } } } },
  });
  const contractOrganization = contract?.pharmacy?.organizationId ?? contract?.prospect.pharmacy?.organizationId ?? null;
  if (!contract || contract.status !== SIGNED_CONTRACT_STATUS || contractOrganization !== organizationId) return null;
  return { id: contractId, version: contract.version, monthlyPriceCents: contract.monthlyPriceCents };
}

/** Un abonnement Stripe terminé : il ne prend jamais la place de celui d'une ligne. */
const ENDED_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Applique l'état d'un abonnement Stripe à notre ligne `Subscription`. Idempotent.
 *
 * NAISSANCE : la ligne est créée, ou un NOUVEL abonnement Stripe (identifiant
 * différent) est rattaché à une ligne existante — réabonnement après une
 * résiliation, ou premier abonnement Stripe d'une fiche qui n'en avait pas.
 * Le contrat fondateur et le tarif contractuel sont alors fixés à neuf : le
 * contrat signé du nouveau lien, sinon le tarif catalogue du moment — ce que
 * Stripe facture. Rien n'est hérité de l'ancien abonnement.
 *
 * Hors naissance (même abonnement Stripe), le tarif figé n'est jamais écrasé.
 * Un événement tardif d'un abonnement plus ancien, ou déjà terminé, ne touche
 * jamais une ligne reliée à un autre abonnement.
 */
export async function syncSubscriptionFromStripe(shape: SubscriptionShape): Promise<{ organizationId: string; subscriptionId: string; created: boolean; statusChanged: boolean } | null> {
  const organizationId = await resolveOrganizationForSubscription(shape);
  if (!organizationId || !shape.id) return null;
  const plan = shape.metadata.planId
    ? await prisma.plan.findUnique({ where: { id: shape.metadata.planId }, select: { id: true, monthlyPriceCents: true } })
    : shape.priceId
      ? await prisma.plan.findUnique({ where: { stripePriceId: shape.priceId }, select: { id: true, monthlyPriceCents: true } })
      : null;
  const existing = await prisma.subscription.findUnique({ where: { organizationId } });
  const otherSubscription = Boolean(existing) && existing!.stripeSubscriptionId !== shape.id;
  if (existing && otherSubscription) {
    // Un abonnement Stripe terminé ne remplace jamais celui d'une ligne.
    if (ENDED_STRIPE_STATUSES.has(shape.status)) return null;
    if (existing.stripeSubscriptionId) {
      // Un abonnement encore en cours n'est pas écrasé par un autre.
      if (existing.status !== "CANCELED" && existing.status !== "INCOMPLETE_EXPIRED") return null;
      // Un abonnement dont la période a commencé avant celle de la ligne est plus ancien : événement tardif.
      if (shape.currentPeriodStart && shape.currentPeriodStart.getTime() <= existing.currentPeriodStart.getTime()) return null;
    }
  }
  const born = !existing || otherSubscription;
  const status = subscriptionStatusFromStripe(shape.status, born ? "INCOMPLETE" : existing!.status);
  const planId = plan?.id ?? existing?.planId;
  if (!planId) return null;

  // Le contrat fondateur : à la naissance, celui du lien s'il est signé ; ensuite, celui déjà retenu.
  const keptContractId = !born ? existing!.contractId : null;
  const signed = keptContractId ? null : await signedContractOf(organizationId, shape.metadata.contractId || null);
  const contractId = keptContractId ?? signed?.id ?? null;

  // Le tarif contractuel se fige à la naissance (contrat signé, sinon offre du
  // moment) et ne suit plus jamais le catalogue. Une fiche ancienne sans tarif
  // le reçoit une fois, de la même façon.
  const freeze = born || existing!.contractPriceCents === null;
  let contractPriceCents = existing?.contractPriceCents ?? null;
  if (freeze) {
    const founding = keptContractId ? await signedContractOf(organizationId, keptContractId) : signed;
    const planMonthlyPriceCents = plan?.id === planId ? plan.monthlyPriceCents : (await prisma.plan.findUniqueOrThrow({ where: { id: planId }, select: { monthlyPriceCents: true } })).monthlyPriceCents;
    contractPriceCents = initialContractPriceCents({ contractMonthlyPriceCents: founding?.monthlyPriceCents ?? null, planMonthlyPriceCents });
  }

  const data = {
    planId,
    status: existing?.suspendedAt ? ("SUSPENDED" as const) : status,
    trialStartsAt: shape.trialStart,
    trialEndsAt: shape.trialEnd,
    currentPeriodStart: shape.currentPeriodStart ?? (born ? null : existing!.currentPeriodStart) ?? new Date(),
    currentPeriodEnd: shape.currentPeriodEnd,
    cancelAtPeriodEnd: shape.cancelAtPeriodEnd,
    cancelAt: shape.cancelAt,
    canceledAt: shape.canceledAt,
    endedAt: shape.endedAt,
    externalCustomerId: shape.customerId ?? existing?.externalCustomerId ?? null,
    stripeSubscriptionId: shape.id,
    stripePriceId: shape.priceId,
    nextInvoiceAt: status === "CANCELED" ? null : shape.currentPeriodEnd,
    contractId,
    ...(freeze ? { contractPriceCents } : {}),
    // Un nouvel abonnement n'hérite pas de l'échec de paiement de l'ancien.
    ...(existing && otherSubscription ? { lastPaymentFailedAt: null } : {}),
  };

  let row: { id: string; status: string };
  if (!existing) {
    row = await prisma.subscription.create({ data: { organizationId, ...data, contractPriceCents } });
  } else if (otherSubscription) {
    // Naissance sur une ligne existante. L'écriture est conditionnelle : la
    // ligne doit encore porter l'abonnement lu plus haut. Deux événements
    // simultanés du même nouvel abonnement (Checkout terminé, abonnement créé)
    // ne font qu'une naissance — un seul historique, une seule annonce.
    const priceChanged = existing.contractPriceCents !== null && existing.contractPriceCents !== contractPriceCents;
    const reason = `Réabonnement : nouvel abonnement Stripe, ${signed ? `contrat v${signed.version} signé` : "tarif catalogue de l'offre"}.`;
    const effectiveAt = shape.currentPeriodStart ?? new Date();
    const attached = await prisma.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({ where: { id: existing.id, stripeSubscriptionId: existing.stripeSubscriptionId }, data });
      if (count === 0) return null;
      // Réabonnement à un autre tarif : l'écart est inscrit à l'historique du tarif, avec la ligne.
      const change = priceChanged
        ? await tx.subscriptionPriceChange.create({
            data: { subscriptionId: existing.id, organizationId, previousCents: existing.contractPriceCents, nextCents: contractPriceCents!, reason, appliedToStripe: true, effectiveAt, changedByAdminId: null },
            select: { id: true },
          })
        : null;
      return { change };
    });
    if (!attached) {
      // Un autre événement a rattaché la ligne entre-temps : rien n'est réécrit ici.
      const current = await prisma.subscription.findUnique({ where: { organizationId }, select: { id: true, stripeSubscriptionId: true } });
      return current?.stripeSubscriptionId === shape.id ? { organizationId, subscriptionId: current.id, created: false, statusChanged: false } : null;
    }
    row = { id: existing.id, status: data.status };
    if (attached.change) {
      const pharmacy = await prisma.pharmacy.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } });
      await recordAudit({
        action: "billing.contract_price_changed",
        entityType: "Subscription",
        entityId: existing.id,
        pharmacyId: pharmacy?.id ?? null,
        platformAdminId: null,
        metadata: {
          before: { contractPriceCents: existing.contractPriceCents, contractId: existing.contractId, stripeSubscriptionId: existing.stripeSubscriptionId },
          after: { contractPriceCents, contractId, stripeSubscriptionId: shape.id },
          changes: { contractPriceCents: { from: existing.contractPriceCents, to: contractPriceCents } },
          reason,
          appliedToStripe: true,
          effectiveAt: effectiveAt.toISOString(),
          priceChangeId: attached.change.id,
        },
      });
    }
  } else {
    row = await prisma.subscription.update({ where: { organizationId }, data });
  }
  if (shape.metadata.inviteId) {
    await prisma.subscriptionInvite.updateMany({ where: { id: shape.metadata.inviteId, completedAt: null }, data: { completedAt: new Date(), stripeCustomerId: shape.customerId ?? undefined } });
  }
  return { organizationId, subscriptionId: row.id, created: born, statusChanged: existing?.status !== row.status };
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
  // Le tarif annoncé est le tarif contractuel de l'officine, jamais le catalogue du jour.
  const priceCents = contractualPrice(subscription, subscription.plan).cents;
  const owner = pharmacy.memberships[0]?.user;
  if (owner) {
    const message = buildSubscriptionStartedEmail({ ownerName: `${owner.firstName} ${owner.lastName}`, pharmacyName: pharmacy.name, planName: subscription.plan.name, monthlyPriceCents: priceCents, trialEndsAt: subscription.trialEndsAt, appUrl: publicUrl("/") });
    const outcome = await getMessagingProvider().sendEmail({ to: owner.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
    await traceDispatch({ kind: "SUBSCRIPTION_STARTED", recipient: owner.email, outcome, subject: message.subject, trigger: "SYSTEM", pharmacyId: pharmacy.id, organizationId });
    // Puis le guide : les cinq étapes pour mettre l'officine en service, sans visite.
    await sendInstallationGuide(pharmacy.id, { reason: "SUBSCRIPTION_STARTED" }).catch((error) => console.error("[abonnement] guide d'installation non envoyé", error));
  }
  await notifyAdmins({ type: "SUBSCRIPTION_STARTED", title: `${pharmacy.name} : abonnement démarré`, body: `${subscription.plan.name} — ${formatEuros(priceCents)}/mois${subscription.trialEndsAt ? `, essai jusqu'au ${formatFrenchDate(subscription.trialEndsAt)}` : ""}.`, linkUrl: `/admin/abonnements/${pharmacy.id}`, severity: "SUCCESS" });
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
  const subscription = await prisma.subscription.findUnique({ where: { organizationId }, select: { id: true, stripeSubscriptionId: true, cancelAtPeriodEnd: true } });
  if (!subscription?.stripeSubscriptionId) return { ok: false, error: "Aucun abonnement Stripe rattaché." };
  const state = stripeConfigState();
  if (!state.configured) return { ok: false, error: `Stripe n'est pas configuré : ${state.detail}` };
  const updated = await getStripe().subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: cancel });
  const shape = readSubscription(updated);
  await syncSubscriptionFromStripe(shape);
  // L'officine est retrouvée côté serveur : le geste apparaît dans son historique.
  const pharmacy = await prisma.pharmacy.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  await recordAudit({
    action: cancel ? "billing.cancel_scheduled" : "billing.cancel_revoked",
    entityType: "Subscription",
    entityId: subscription.stripeSubscriptionId,
    pharmacyId: pharmacy?.id ?? null,
    platformAdminId: adminId,
    metadata: {
      organizationId,
      subscriptionId: subscription.id,
      before: { cancelAtPeriodEnd: subscription.cancelAtPeriodEnd },
      after: { cancelAtPeriodEnd: shape.cancelAtPeriodEnd },
      changes: subscription.cancelAtPeriodEnd !== shape.cancelAtPeriodEnd ? { cancelAtPeriodEnd: { from: subscription.cancelAtPeriodEnd, to: shape.cancelAtPeriodEnd } } : {},
    },
  });
  return { ok: true };
}

const RESTORABLE_STATUSES = new Set<string>(SUBSCRIPTION_STATUSES.filter((status) => status !== "SUSPENDED"));

const RESTORE_NOTES: Record<"STRIPE" | "BEFORE_SUSPENSION" | "TRIAL_RUNNING" | "DEFAULT_ACTIVE", string> = {
  STRIPE: "Statut relu chez Stripe.",
  BEFORE_SUSPENSION: "Statut d'avant la suspension restauré.",
  TRIAL_RUNNING: "Aucun statut mémorisé à la suspension : remis en essai, l'essai court encore.",
  DEFAULT_ACTIVE: "Aucun statut mémorisé à la suspension : remis actif.",
};

/** Le statut d'abonnement mémorisé par la dernière suspension de l'officine (journal d'audit). */
async function statusBeforeSuspension(pharmacyId: string): Promise<SubscriptionStatusCode | null> {
  const last = await prisma.auditLog.findFirst({ where: { action: "billing.access_suspended", entityType: "Pharmacy", entityId: pharmacyId }, orderBy: { createdAt: "desc" }, select: { metadata: true } });
  const previous = (last?.metadata as { previousStatus?: unknown } | null)?.previousStatus;
  return typeof previous === "string" && RESTORABLE_STATUSES.has(previous) ? (previous as SubscriptionStatusCode) : null;
}

/**
 * Suspend ou rétablit l'accès : l'officine est désactivée, l'abonnement marqué. Stripe n'est pas touché.
 *
 * La suspension mémorise le statut d'abonnement qu'elle remplace (audit,
 * `previousStatus`). Le rétablissement le restaure — à défaut : en essai si
 * l'essai court encore, sinon actif —, puis relit Stripe quand l'abonnement y
 * est relié : l'état Stripe l'emporte quand la relecture réussit. L'audit dit
 * quel statut a été retenu, et d'où il vient.
 */
export async function setAccessSuspended(pharmacyId: string, suspended: boolean, reason: string | null, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, organizationId: true, name: true } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { id: true, stripeSubscriptionId: true, status: true, trialEndsAt: true } });
  const now = new Date();

  // Suspension : le statut remplacé (celui de la suspension précédente si l'abonnement l'était déjà).
  const previousStatus = suspended && subscription ? (subscription.status !== "SUSPENDED" ? subscription.status : await statusBeforeSuspension(pharmacy.id)) : null;
  // Rétablissement : le statut à remettre, sans attendre Stripe.
  let restored: { status: SubscriptionStatusCode; source: "BEFORE_SUSPENSION" | "TRIAL_RUNNING" | "DEFAULT_ACTIVE" } | null = null;
  if (!suspended && subscription?.status === "SUSPENDED") {
    const memorized = await statusBeforeSuspension(pharmacy.id);
    restored = memorized
      ? { status: memorized, source: "BEFORE_SUSPENSION" }
      : subscription.trialEndsAt && subscription.trialEndsAt.getTime() > now.getTime()
        ? { status: "TRIALING", source: "TRIAL_RUNNING" }
        : { status: "ACTIVE", source: "DEFAULT_ACTIVE" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.pharmacy.update({ where: { id: pharmacy.id }, data: { isActive: !suspended } });
    if (suspended) await tx.session.updateMany({ where: { pharmacyId: pharmacy.id, revokedAt: null }, data: { revokedAt: now } });
    if (subscription) {
      if (suspended) {
        await tx.subscription.update({ where: { id: subscription.id }, data: { suspendedAt: now, suspendedReason: reason, status: "SUSPENDED" } });
      } else {
        await tx.subscription.update({ where: { id: subscription.id }, data: { suspendedAt: null, suspendedReason: null, ...(restored ? { status: restored.status } : {}) } });
      }
    }
  });

  if (suspended) {
    await recordAudit({
      action: "billing.access_suspended",
      entityType: "Pharmacy",
      entityId: pharmacy.id,
      pharmacyId: pharmacy.id,
      platformAdminId: adminId,
      metadata: { reason, previousStatus, ...(subscription ? { changes: { status: { from: subscription.status, to: "SUSPENDED" } } } : {}) },
    });
    return { ok: true };
  }

  // Relecture Stripe : l'état réel l'emporte quand elle réussit ; son échec est dit, pas avalé.
  let finalStatus: string | null = restored?.status ?? subscription?.status ?? null;
  let stripeRefreshError: string | null = null;
  let readFromStripe = false;
  if (subscription?.stripeSubscriptionId) {
    const refreshed = await refreshSubscriptionFromStripe(pharmacy.organizationId).catch((error: unknown): { ok: false; error: string } => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    if (refreshed.ok) {
      finalStatus = refreshed.status;
      readFromStripe = true;
    } else {
      stripeRefreshError = refreshed.error;
    }
  }
  const statusSource = readFromStripe ? "STRIPE" : (restored?.source ?? null);
  const statusNote = [
    statusSource ? RESTORE_NOTES[statusSource] : null,
    stripeRefreshError ? `Relecture Stripe impossible : ${stripeRefreshError}` : null,
  ].filter(Boolean).join(" ") || null;
  await recordAudit({
    action: "billing.access_restored",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    pharmacyId: pharmacy.id,
    platformAdminId: adminId,
    metadata: {
      reason,
      statusSource,
      statusNote,
      stripeRefreshError,
      ...(subscription && finalStatus !== subscription.status ? { changes: { status: { from: subscription.status, to: finalStatus } } } : {}),
    },
  });
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
