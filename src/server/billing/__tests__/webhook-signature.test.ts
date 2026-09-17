import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { describeEvent } from "@/core/billing/webhook-summary";

/**
 * La signature des webhooks et la lecture des événements, sans réseau ni
 * base : on signe un corps comme Stripe le ferait, et l'on vérifie qu'une
 * signature fausse est refusée.
 */
const SECRET = "whsec_test_secret_for_unit_tests_only";

const body = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "customer.subscription.updated",
  created: 1_760_000_000,
  data: { object: { id: "sub_1", object: "subscription", status: "trialing", customer: "cus_1", cancel_at_period_end: false, trial_end: 1_762_592_000, items: { data: [{ price: { id: "price_1" }, current_period_end: 1_762_592_000 }] }, metadata: { organizationId: "org_1", pharmacyId: "ph_1" } } },
});

describe("webhook Stripe — signature", () => {
  it("accepte un corps signé avec le bon secret", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
    const event = Stripe.webhooks.constructEvent(body, header, SECRET);
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("refuse un mauvais secret, un corps modifié, ou une signature absente", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
    expect(() => Stripe.webhooks.constructEvent(body, header, "whsec_other")).toThrow();
    expect(() => Stripe.webhooks.constructEvent(body.replace("trialing", "active"), header, SECRET)).toThrow();
    expect(() => Stripe.webhooks.constructEvent(body, "", SECRET)).toThrow();
  });
});

describe("webhook Stripe — résumé pour le journal", () => {
  it("résume un abonnement, une facture et un Checkout sans recopier tout l'objet", () => {
    const parsed = JSON.parse(body);
    const sub = describeEvent(parsed);
    expect(sub.summary).toBe("Abonnement sub_1 : trialing");
    expect(sub.payload).toMatchObject({ id: "sub_1", status: "trialing", metadata: { organizationId: "org_1" } });
    expect(Object.keys(sub.payload)).not.toContain("items");
    const invoice = describeEvent({ type: "invoice.payment_failed", data: { object: { id: "in_1", status: "open", amount_due: 12900, amount_paid: 0, currency: "eur", attempt_count: 2, parent: { subscription_details: { subscription: "sub_1" } } } } });
    expect(invoice.summary).toBe("Facture in_1 : open, 129 EUR");
    expect(invoice.payload).toMatchObject({ subscription: "sub_1", attempt_count: 2 });
    const checkout = describeEvent({ type: "checkout.session.completed", data: { object: { id: "cs_1", status: "complete", client_reference_id: "inv_1" } } });
    expect(checkout.summary).toBe("Checkout cs_1 : complete");
  });
});
