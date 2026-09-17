import { readCheckoutSession, readInvoice, readSubscription } from "./stripe-shapes";

/**
 * Le résumé d'un événement Stripe pour le journal de la console : une phrase
 * et un objet allégé (identifiants, statuts, montants, dates) — jamais
 * l'objet complet, qui porte des détails de paiement inutiles ici.
 */
/** Un résumé lisible et un objet allégé, pour le journal. */
export function describeEvent(event: { type: string; data: { object: unknown } }): { summary: string; payload: Record<string, unknown> } {
  const object = (event.data.object ?? {}) as Record<string, unknown>;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
  if (event.type.startsWith("customer.subscription.")) {
    const shape = readSubscription(object);
    return { summary: `Abonnement ${shape.id ?? "?"} : ${shape.status}${shape.cancelAtPeriodEnd ? " (résiliation programmée)" : ""}`, payload: { ...pick(["id", "status", "customer", "cancel_at_period_end", "trial_end", "cancel_at", "canceled_at", "ended_at"]), metadata: shape.metadata } };
  }
  if (event.type.startsWith("invoice.")) {
    const shape = readInvoice(object);
    return { summary: `Facture ${shape.id ?? "?"} : ${shape.status}, ${(shape.amountPaidCents || shape.amountDueCents) / 100} ${shape.currency.toUpperCase()}`, payload: { ...pick(["id", "status", "customer", "amount_paid", "amount_due", "attempt_count", "hosted_invoice_url", "next_payment_attempt"]), subscription: shape.subscriptionId } };
  }
  if (event.type.startsWith("checkout.session.")) {
    const shape = readCheckoutSession(object);
    return { summary: `Checkout ${shape.id ?? "?"} : ${shape.status}`, payload: { ...pick(["id", "status", "customer", "subscription", "client_reference_id"]), metadata: shape.metadata } };
  }
  return { summary: `${event.type}`, payload: pick(["id", "status", "customer", "email", "name"]) };
}

