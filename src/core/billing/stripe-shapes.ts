/**
 * Lire un objet Stripe sans dépendre de la version d'API.
 *
 * Stripe a déplacé certains champs au fil des versions : la période en cours
 * d'un abonnement vit sur l'abonnement (anciennes versions) ou sur ses
 * lignes (versions 2025+) ; la facture pointe vers l'abonnement par
 * `subscription` (ancien) ou `parent.subscription_details.subscription`
 * (nouveau). Ces lecteurs acceptent les deux formes, et rendent `null` plutôt
 * qu'une valeur devinée quand aucune n'est présente.
 */

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose | null {
  return value && typeof value === "object" ? (value as Loose) : null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return record && typeof record.id === "string" ? record.id : null;
}

/** Un horodatage Stripe (secondes UNIX) en Date. */
export function stripeDate(seconds: unknown): Date | null {
  return typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

export type SubscriptionShape = {
  id: string | null;
  customerId: string | null;
  status: string;
  priceId: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  metadata: Record<string, string>;
};

export function readSubscription(subscription: unknown): SubscriptionShape {
  const sub = asRecord(subscription) ?? {};
  const items = asRecord(sub.items);
  const firstItem = Array.isArray(items?.data) ? asRecord(items!.data[0]) : null;
  const price = firstItem ? asRecord(firstItem.price) : null;
  const metadata = asRecord(sub.metadata) ?? {};
  return {
    id: typeof sub.id === "string" ? sub.id : null,
    customerId: idOf(sub.customer),
    status: typeof sub.status === "string" ? sub.status : "unknown",
    priceId: price && typeof price.id === "string" ? price.id : null,
    trialStart: stripeDate(sub.trial_start),
    trialEnd: stripeDate(sub.trial_end),
    currentPeriodStart: stripeDate(sub.current_period_start) ?? stripeDate(firstItem?.current_period_start),
    currentPeriodEnd: stripeDate(sub.current_period_end) ?? stripeDate(firstItem?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    cancelAt: stripeDate(sub.cancel_at),
    canceledAt: stripeDate(sub.canceled_at),
    endedAt: stripeDate(sub.ended_at),
    metadata: Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  };
}

export type InvoiceShape = {
  id: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  attemptCount: number;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  nextPaymentAttempt: Date | null;
};

export function readInvoice(invoice: unknown): InvoiceShape {
  const inv = asRecord(invoice) ?? {};
  const parent = asRecord(inv.parent);
  const details = parent ? asRecord(parent.subscription_details) : null;
  const lines = asRecord(inv.lines);
  const firstLine = Array.isArray(lines?.data) ? asRecord(lines!.data[0]) : null;
  const linePeriod = firstLine ? asRecord(firstLine.period) : null;
  const statusTransitions = asRecord(inv.status_transitions);
  return {
    id: typeof inv.id === "string" ? inv.id : null,
    customerId: idOf(inv.customer),
    subscriptionId: idOf(inv.subscription) ?? (details ? idOf(details.subscription) : null),
    status: typeof inv.status === "string" ? inv.status : "unknown",
    amountPaidCents: typeof inv.amount_paid === "number" ? inv.amount_paid : 0,
    amountDueCents: typeof inv.amount_due === "number" ? inv.amount_due : 0,
    currency: typeof inv.currency === "string" ? inv.currency : "eur",
    periodStart: stripeDate(inv.period_start) ?? stripeDate(linePeriod?.start),
    periodEnd: stripeDate(inv.period_end) ?? stripeDate(linePeriod?.end),
    paidAt: stripeDate(statusTransitions?.paid_at),
    attemptCount: typeof inv.attempt_count === "number" ? inv.attempt_count : 0,
    hostedInvoiceUrl: typeof inv.hosted_invoice_url === "string" ? inv.hosted_invoice_url : null,
    invoicePdfUrl: typeof inv.invoice_pdf === "string" ? inv.invoice_pdf : null,
    nextPaymentAttempt: stripeDate(inv.next_payment_attempt),
  };
}

export type CheckoutSessionShape = {
  id: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  clientReferenceId: string | null;
  status: string;
  metadata: Record<string, string>;
};

export function readCheckoutSession(session: unknown): CheckoutSessionShape {
  const s = asRecord(session) ?? {};
  const metadata = asRecord(s.metadata) ?? {};
  return {
    id: typeof s.id === "string" ? s.id : null,
    customerId: idOf(s.customer),
    subscriptionId: idOf(s.subscription),
    clientReferenceId: typeof s.client_reference_id === "string" ? s.client_reference_id : null,
    status: typeof s.status === "string" ? s.status : "unknown",
    metadata: Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  };
}

/** Le statut d'une facture Stripe, dans notre vocabulaire. */
export function paymentStatusFromInvoice(status: string, amountPaidCents: number): "PAID" | "FAILED" | "OPEN" | "VOID" | "UNCOLLECTIBLE" | "DRAFT" {
  switch (status) {
    case "paid":
      return "PAID";
    case "void":
      return "VOID";
    case "uncollectible":
      return "UNCOLLECTIBLE";
    case "draft":
      return "DRAFT";
    case "open":
      return amountPaidCents > 0 ? "PAID" : "OPEN";
    default:
      return "OPEN";
  }
}
