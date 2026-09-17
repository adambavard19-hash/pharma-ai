import { describe, expect, it } from "vitest";
import { paymentStatusFromInvoice, readCheckoutSession, readInvoice, readSubscription } from "../stripe-shapes";

describe("lecture des objets Stripe", () => {
  it("lit la période sur l'abonnement (ancienne API) ou sur ses lignes (nouvelle API)", () => {
    const legacy = readSubscription({ id: "sub_1", customer: "cus_1", status: "trialing", current_period_start: 1_760_000_000, current_period_end: 1_762_592_000, trial_end: 1_762_592_000, items: { data: [{ price: { id: "price_1" } }] }, metadata: { pharmacyId: "p1" } });
    expect(legacy.currentPeriodEnd?.toISOString()).toBe("2025-11-08T08:53:20.000Z");
    expect(legacy.priceId).toBe("price_1");
    expect(legacy.metadata.pharmacyId).toBe("p1");
    const modern = readSubscription({ id: "sub_2", customer: { id: "cus_2" }, status: "active", items: { data: [{ price: { id: "price_2" }, current_period_start: 1_760_000_000, current_period_end: 1_762_592_000 }] }, cancel_at_period_end: true });
    expect(modern.customerId).toBe("cus_2");
    expect(modern.currentPeriodEnd?.toISOString()).toBe("2025-11-08T08:53:20.000Z");
    expect(modern.cancelAtPeriodEnd).toBe(true);
    expect(readSubscription({}).currentPeriodEnd).toBeNull();
  });

  it("retrouve l'abonnement d'une facture dans les deux formes", () => {
    expect(readInvoice({ id: "in_1", subscription: "sub_1", status: "paid", amount_paid: 12900, status_transitions: { paid_at: 1_760_000_000 } }).subscriptionId).toBe("sub_1");
    const modern = readInvoice({ id: "in_2", parent: { subscription_details: { subscription: "sub_2" } }, status: "open", amount_due: 12900, attempt_count: 2, next_payment_attempt: 1_760_000_000, lines: { data: [{ period: { start: 1_760_000_000, end: 1_762_592_000 } }] } });
    expect(modern.subscriptionId).toBe("sub_2");
    expect(modern.periodEnd?.toISOString()).toBe("2025-11-08T08:53:20.000Z");
    expect(modern.attemptCount).toBe(2);
  });

  it("traduit le statut d'une facture", () => {
    expect(paymentStatusFromInvoice("paid", 12900)).toBe("PAID");
    expect(paymentStatusFromInvoice("open", 0)).toBe("OPEN");
    expect(paymentStatusFromInvoice("void", 0)).toBe("VOID");
  });

  it("lit une session Checkout", () => {
    const session = readCheckoutSession({ id: "cs_1", customer: "cus_1", subscription: "sub_1", client_reference_id: "invite_1", status: "complete", metadata: { organizationId: "o1" } });
    expect(session.clientReferenceId).toBe("invite_1");
    expect(session.metadata.organizationId).toBe("o1");
  });
});
