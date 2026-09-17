import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/server/db/client";
import { Prisma } from "@/generated/prisma";
import { publicUrl } from "@/server/public-url";
import { getMessagingProvider } from "@/server/ai/registry";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { readCheckoutSession, readInvoice, readSubscription, paymentStatusFromInvoice } from "@/core/billing/stripe-shapes";
import { describeEvent } from "@/core/billing/webhook-summary";
import { buildPaymentFailedEmail, buildTrialEndingEmail } from "@/core/platform/billing-emails";
import { announceSubscriptionStarted, syncSubscriptionFromStripe } from "./subscriptions";
import { getStripe } from "./stripe-client";

/**
 * Les webhooks Stripe, appliqués une seule fois.
 *
 * L'identifiant d'événement est unique en base : un webhook rejoué est
 * reconnu et ignoré avant tout traitement. Chaque événement laisse une trace
 * lisible dans la console (type, résumé, officine), même quand il ne concerne
 * aucune officine connue.
 */

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "customer.updated",
  "customer.deleted",
] as const;

export type WebhookOutcome = { handled: boolean; duplicate: boolean; summary: string; organizationId: string | null };

async function organizationForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const subscription = await prisma.subscription.findUnique({ where: { externalCustomerId: customerId }, select: { organizationId: true } });
  if (subscription) return subscription.organizationId;
  const invite = await prisma.subscriptionInvite.findFirst({ where: { stripeCustomerId: customerId }, orderBy: { createdAt: "desc" }, select: { organizationId: true } });
  return invite?.organizationId ?? null;
}

async function ownerOfOrganization(organizationId: string) {
  const pharmacy = await prisma.pharmacy.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } } });
  return pharmacy ? { pharmacy, owner: pharmacy.memberships[0]?.user ?? null } : null;
}

async function recordInvoice(event: Stripe.Event): Promise<string | null> {
  const shape = readInvoice(event.data.object);
  if (!shape.id) return null;
  let subscription = shape.subscriptionId ? await prisma.subscription.findUnique({ where: { stripeSubscriptionId: shape.subscriptionId } }) : null;
  if (!subscription && shape.subscriptionId) {
    // L'abonnement n'est pas encore connu (facture arrivée avant l'abonnement) : on le relit.
    const stripeSubscription = await getStripe().subscriptions.retrieve(shape.subscriptionId).catch(() => null);
    if (stripeSubscription) {
      await syncSubscriptionFromStripe(readSubscription(stripeSubscription));
      subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: shape.subscriptionId } });
    }
  }
  if (!subscription) return null;
  const status = paymentStatusFromInvoice(shape.status, shape.amountPaidCents);
  const failed = event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required";
  const data = {
    subscriptionId: subscription.id,
    organizationId: subscription.organizationId,
    stripeInvoiceId: shape.id,
    status: failed && status !== "PAID" ? "FAILED" : status,
    amountCents: shape.amountPaidCents || shape.amountDueCents,
    currency: shape.currency,
    periodStart: shape.periodStart,
    periodEnd: shape.periodEnd,
    paidAt: shape.paidAt,
    failedAt: failed ? new Date(event.created * 1000) : undefined,
    attemptCount: shape.attemptCount,
    hostedInvoiceUrl: shape.hostedInvoiceUrl,
    invoicePdfUrl: shape.invoicePdfUrl,
  };
  await prisma.billingPayment.upsert({ where: { stripeInvoiceId: shape.id }, create: data, update: data });
  if (status === "PAID" && shape.amountPaidCents > 0) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { lastPaymentAt: shape.paidAt ?? new Date(event.created * 1000), lastPaymentCents: shape.amountPaidCents } });
  }
  if (failed) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { lastPaymentFailedAt: new Date(event.created * 1000) } });
    const found = await ownerOfOrganization(subscription.organizationId);
    if (found?.owner) {
      const message = buildPaymentFailedEmail({ ownerName: `${found.owner.firstName} ${found.owner.lastName}`, pharmacyName: found.pharmacy.name, amountCents: shape.amountDueCents, nextAttemptAt: shape.nextPaymentAttempt, manageUrl: publicUrl("/parametres?onglet=abonnement") });
      await getMessagingProvider().sendEmail({ to: found.owner.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
    }
    if (found) await notifyAdmins({ type: "PAYMENT_FAILED", title: `${found.pharmacy.name} : paiement échoué`, body: `${shape.amountDueCents / 100} € — tentative ${shape.attemptCount}.`, linkUrl: `/admin/abonnements/${found.pharmacy.id}`, severity: "WARNING" });
  }
  return subscription.organizationId;
}

/**
 * Traite un événement déjà authentifié. Rend `duplicate: true` s'il a déjà
 * été reçu : rien n'est rejoué.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const description = describeEvent(event);
  try {
    await prisma.billingEvent.create({ data: { stripeEventId: event.id, type: event.type, summary: description.summary, payload: description.payload as Prisma.InputJsonValue } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { handled: false, duplicate: true, summary: description.summary, organizationId: null };
    }
    throw error;
  }

  let organizationId: string | null = null;
  let handled = true;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = readCheckoutSession(event.data.object);
        if (session.subscriptionId) {
          const stripeSubscription = await getStripe().subscriptions.retrieve(session.subscriptionId);
          const synced = await syncSubscriptionFromStripe(readSubscription(stripeSubscription));
          organizationId = synced?.organizationId ?? null;
          if (synced?.created) await announceSubscriptionStarted(synced.organizationId);
        }
        if (session.clientReferenceId) await prisma.subscriptionInvite.updateMany({ where: { id: session.clientReferenceId, completedAt: null }, data: { completedAt: new Date(), checkoutSessionId: session.id ?? undefined } });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const synced = await syncSubscriptionFromStripe(readSubscription(event.data.object));
        organizationId = synced?.organizationId ?? null;
        if (synced?.created) await announceSubscriptionStarted(synced.organizationId);
        if (event.type === "customer.subscription.deleted" && organizationId) {
          const found = await ownerOfOrganization(organizationId);
          if (found) await notifyAdmins({ type: "SUBSCRIPTION_CANCELED", title: `${found.pharmacy.name} : abonnement résilié`, body: "L'abonnement Stripe est terminé.", linkUrl: `/admin/abonnements/${found.pharmacy.id}`, severity: "WARNING" });
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        const shape = readSubscription(event.data.object);
        const synced = await syncSubscriptionFromStripe(shape);
        organizationId = synced?.organizationId ?? null;
        if (organizationId && shape.trialEnd) {
          const [found, subscription] = await Promise.all([ownerOfOrganization(organizationId), prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } })]);
          if (found?.owner && subscription) {
            const message = buildTrialEndingEmail({ ownerName: `${found.owner.firstName} ${found.owner.lastName}`, pharmacyName: found.pharmacy.name, monthlyPriceCents: subscription.plan.monthlyPriceCents, trialEndsAt: shape.trialEnd, manageUrl: publicUrl("/parametres?onglet=abonnement") });
            await getMessagingProvider().sendEmail({ to: found.owner.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
          }
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.payment_action_required":
        organizationId = await recordInvoice(event);
        break;
      case "invoice.upcoming": {
        const shape = readInvoice(event.data.object);
        if (shape.subscriptionId && shape.periodEnd) {
          await prisma.subscription.updateMany({ where: { stripeSubscriptionId: shape.subscriptionId }, data: { nextInvoiceAt: shape.periodEnd } });
        }
        organizationId = await organizationForCustomer(shape.customerId);
        break;
      }
      case "customer.updated":
      case "customer.deleted": {
        const customer = event.data.object as { id?: string };
        organizationId = await organizationForCustomer(customer.id ?? null);
        break;
      }
      default:
        handled = false;
    }
    const pharmacy = organizationId ? await prisma.pharmacy.findFirst({ where: { organizationId }, select: { id: true } }) : null;
    await prisma.billingEvent.update({ where: { stripeEventId: event.id }, data: { organizationId, pharmacyId: pharmacy?.id ?? null, processedAt: new Date() } });
    return { handled, duplicate: false, summary: description.summary, organizationId };
  } catch (error) {
    await prisma.billingEvent.update({ where: { stripeEventId: event.id }, data: { error: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}
