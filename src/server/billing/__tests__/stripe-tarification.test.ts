import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stripe branché sur la tarification : la remise du parrain posée chez Stripe
 * (idempotente), la souscription en ligne qui crée l'espace une seule fois, et
 * les webhooks qui enchaînent dans le bon ordre (espace, abonnement, factures)
 * et ne comptent un paiement qu'une fois. Ni base ni Stripe réels.
 */

const mocks = vi.hoisted(() => {
  const prisma = {
    pharmacy: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    prospect: { findUnique: vi.fn() },
    billingEvent: { create: vi.fn(), update: vi.fn() },
    billingPayment: { upsert: vi.fn() },
    subscriptionInvite: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  return {
    prisma,
    referralState: vi.fn(),
    recordAudit: vi.fn(),
    notifyAdmins: vi.fn(),
    recordProspectEvent: vi.fn(),
    createPharmacyFromProspect: vi.fn(),
    getStripe: vi.fn(),
    stripeConfigState: vi.fn(() => ({ configured: true, mode: "test", keyMatchesMode: true, webhookConfigured: true, detail: "" })),
    syncSubscriptionFromStripe: vi.fn(),
    announceSubscriptionStarted: vi.fn(),
    salesRepsOfOrganization: vi.fn(),
    syncProgressiveCommissionsSafely: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/referral", () => ({ referralState: mocks.referralState }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: vi.fn() }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/client-pharmacies", () => ({ createPharmacyFromProspect: mocks.createPharmacyFromProspect }));
vi.mock("@/server/services/public-pricing", () => ({ loadPublicPricing: vi.fn() }));
vi.mock("@/server/billing/stripe-client", () => ({ getStripe: mocks.getStripe, stripeConfigState: mocks.stripeConfigState }));
vi.mock("@/server/billing/stripe-setup", () => ({ ensureVatTaxRate: vi.fn(), setupLineFor: vi.fn(), ensurePortalConfiguration: vi.fn() }));
vi.mock("@/server/billing/subscriptions", () => ({ syncSubscriptionFromStripe: mocks.syncSubscriptionFromStripe, announceSubscriptionStarted: mocks.announceSubscriptionStarted, ensurePlanStripePrice: vi.fn(), ensureStripeCustomer: vi.fn() }));
vi.mock("@/server/services/sales/progressive-commissions", () => ({ salesRepsOfOrganization: mocks.salesRepsOfOrganization, syncProgressiveCommissionsSafely: mocks.syncProgressiveCommissionsSafely }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: vi.fn() }) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));

const { syncReferralDiscount } = await import("../referral-discount");
const { completeSelfServiceCheckout } = await import("../self-service");
const { handleStripeEvent } = await import("../webhooks");
const { Prisma } = await import("@/generated/prisma");

const { prisma } = mocks;

function fakeStripe(discounts: unknown[] = []) {
  return {
    subscriptions: { retrieve: vi.fn().mockResolvedValue({ id: "sub_parrain", discounts, items: { data: [] }, metadata: {} }), update: vi.fn().mockResolvedValue({}) },
    coupons: { retrieve: vi.fn().mockRejectedValue(new Error("No such coupon")), create: vi.fn().mockResolvedValue({}) },
    invoices: { list: vi.fn().mockResolvedValue({ data: [] }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_parrain", organization: { subscription: { id: "row_parrain", status: "ACTIVE", stripeSubscriptionId: "sub_parrain", referralDiscountCents: null } } });
  prisma.subscription.update.mockResolvedValue({});
  prisma.billingEvent.create.mockResolvedValue({});
  prisma.billingEvent.update.mockResolvedValue({});
  prisma.pharmacy.findMany.mockResolvedValue([]);
});

describe("la remise du parrain chez Stripe", () => {
  it("un filleul actif : coupon de 20 % du tarif contractuel (25,20 €) créé et posé, l'audit garde l'avant/après", async () => {
    mocks.referralState.mockResolvedValue({ benefit: { discountCents: 2_520, basis: "PERCENT" } });
    const stripe = fakeStripe();
    const outcome = await syncReferralDiscount("ph_parrain", stripe as never);
    expect(outcome).toEqual({ status: "UPDATED", previousCents: 0, discountCents: 2_520 });
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ id: "pb-parrainage-2520", amount_off: 2_520, currency: "eur", duration: "forever" }));
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_parrain", { discounts: [{ coupon: "pb-parrainage-2520" }] });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ referralDiscountCents: 2_520, referralCouponId: "pb-parrainage-2520" }) }));
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.referral_discount_synced", metadata: { changes: { discountCents: { from: 0, to: 2_520 } } } });
  });

  it("rejouée : la remise est déjà la bonne, rien n'est envoyé à Stripe", async () => {
    mocks.referralState.mockResolvedValue({ benefit: { discountCents: 2_520, basis: "PERCENT" } });
    const stripe = fakeStripe([{ id: "di_1", source: { coupon: "pb-parrainage-2520" } }]);
    expect(await syncReferralDiscount("ph_parrain", stripe as never)).toEqual({ status: "UNCHANGED", discountCents: 2_520 });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("le filleul résilie : la remise est retirée, une autre remise de l'abonnement est gardée", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_parrain", organization: { subscription: { id: "row_parrain", status: "ACTIVE", stripeSubscriptionId: "sub_parrain", referralDiscountCents: 2_520 } } });
    mocks.referralState.mockResolvedValue({ benefit: { discountCents: 0, basis: null } });
    const stripe = fakeStripe([{ id: "di_1", source: { coupon: "pb-parrainage-2520" } }, { id: "di_geste", source: { coupon: { id: "GESTE" } } }]);
    expect(await syncReferralDiscount("ph_parrain", stripe as never)).toEqual({ status: "UPDATED", previousCents: 2_520, discountCents: 0 });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_parrain", { discounts: [{ discount: "di_geste" }] });
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });

  it("dernière remise retirée : la liste vide est envoyée telle que Stripe l'attend", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_parrain", organization: { subscription: { id: "row_parrain", status: "ACTIVE", stripeSubscriptionId: "sub_parrain", referralDiscountCents: 2_520 } } });
    mocks.referralState.mockResolvedValue({ benefit: { discountCents: 0, basis: null } });
    const stripe = fakeStripe([{ id: "di_1", source: { coupon: "pb-parrainage-2520" } }]);
    await syncReferralDiscount("ph_parrain", stripe as never);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_parrain", { discounts: "" });
  });

  it("un parrain sans abonnement Stripe (règlement hors Stripe) ou résilié : rien n'est touché", async () => {
    prisma.pharmacy.findUnique.mockResolvedValueOnce({ id: "ph_x", organization: { subscription: null } });
    expect(await syncReferralDiscount("ph_x", fakeStripe() as never)).toMatchObject({ status: "SKIPPED" });
    prisma.pharmacy.findUnique.mockResolvedValueOnce({ id: "ph_x", organization: { subscription: { id: "r", status: "CANCELED", stripeSubscriptionId: "sub_x", referralDiscountCents: 0 } } });
    expect(await syncReferralDiscount("ph_x", fakeStripe() as never)).toMatchObject({ status: "SKIPPED" });
    expect(mocks.referralState).not.toHaveBeenCalled();
  });
});

const selfSession = (patch: Record<string, unknown> = {}) => ({ id: "cs_1", customerId: "cus_1", subscriptionId: "sub_new", clientReferenceId: "p_1", status: "complete", paymentStatus: "unpaid", metadata: { source: "SELF_SERVICE", prospectId: "p_1", setupFeeCents: "29000", termsVersion: "v1" }, ...patch });

describe("la souscription en ligne crée l'espace une seule fois", () => {
  it("paiement validé (SEPA en cours) : l'espace naît du dossier, tracé", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "p_1", name: "Pharmacie du Port", pharmacyId: null, termsAcceptedAt: new Date("2026-10-11T10:00:00Z"), selfCheckoutSessionId: "cs_1" });
    mocks.createPharmacyFromProspect.mockResolvedValue({ ok: true, pharmacyId: "ph_new", welcome: { status: "SENT", detail: "" } });
    expect(await completeSelfServiceCheckout(selfSession())).toEqual({ pharmacyId: "ph_new", created: true });
    expect(mocks.createPharmacyFromProspect).toHaveBeenCalledWith("p_1", expect.objectContaining({ type: "SYSTEM" }), { paidCheckout: true });
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.self_checkout_completed", entityId: "ph_new", metadata: { paymentStatus: "unpaid", termsVersion: "v1" } });
  });

  it("rejouée : l'espace existe déjà, rien n'est recréé", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "p_1", name: "Pharmacie du Port", pharmacyId: "ph_new", termsAcceptedAt: new Date(), selfCheckoutSessionId: "cs_1" });
    expect(await completeSelfServiceCheckout(selfSession())).toEqual({ pharmacyId: "ph_new", created: false });
    expect(mocks.createPharmacyFromProspect).not.toHaveBeenCalled();
  });

  it("session non terminée, ou d'un lien d'activation : rien", async () => {
    expect(await completeSelfServiceCheckout(selfSession({ status: "open" }))).toBeNull();
    expect(await completeSelfServiceCheckout(selfSession({ metadata: { source: "INVITE" } }))).toBeNull();
    expect(prisma.prospect.findUnique).not.toHaveBeenCalled();
  });

  it("paiement validé mais espace impossible (adresse prise) : l'équipe est alertée, rien n'est perdu", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "p_1", name: "Pharmacie du Port", pharmacyId: null, termsAcceptedAt: new Date(), selfCheckoutSessionId: "cs_1" });
    mocks.createPharmacyFromProspect.mockResolvedValue({ ok: false, error: "Un compte utilisateur existe déjà avec l'adresse e-mail du titulaire." });
    expect(await completeSelfServiceCheckout(selfSession())).toBeNull();
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ severity: "CRITICAL", linkUrl: "/admin/dossiers/p_1" }));
  });
});

describe("les webhooks", () => {
  it("checkout terminé en libre-service : espace, puis abonnement, annonce et reprise des factures", async () => {
    const order: string[] = [];
    prisma.prospect.findUnique.mockImplementation(async () => {
      order.push("espace");
      return { id: "p_1", name: "Pharmacie du Port", pharmacyId: "ph_new", termsAcceptedAt: new Date(), selfCheckoutSessionId: "cs_1" };
    });
    const stripe = fakeStripe();
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_new", status: "active", metadata: { prospectId: "p_1" }, items: { data: [] } });
    mocks.getStripe.mockReturnValue(stripe);
    mocks.syncSubscriptionFromStripe.mockImplementation(async () => {
      order.push("abonnement");
      return { organizationId: "org_new", subscriptionId: "row_new", created: true, statusChanged: true };
    });
    prisma.pharmacy.findFirst.mockResolvedValue({ id: "ph_new" });

    const outcome = await handleStripeEvent({ id: "evt_1", type: "checkout.session.completed", created: 1_800_000_000, data: { object: { id: "cs_1", customer: "cus_1", subscription: "sub_new", client_reference_id: "p_1", status: "complete", payment_status: "unpaid", metadata: { source: "SELF_SERVICE", prospectId: "p_1" } } } } as never);

    expect(order).toEqual(["espace", "abonnement"]);
    expect(mocks.announceSubscriptionStarted).toHaveBeenCalledWith("org_new");
    expect(stripe.invoices.list).toHaveBeenCalledWith({ subscription: "sub_new", limit: 10 });
    expect(prisma.subscriptionInvite.updateMany).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ handled: true, organizationId: "org_new" });
  });

  it("première facture payée (416 € HT = 499,20 € TTC) : la commission du commercial est recalculée et le parrain resynchronisé", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "row_new", organizationId: "org_new" });
    prisma.billingPayment.upsert.mockResolvedValue({});
    mocks.salesRepsOfOrganization.mockResolvedValue(["rep_1"]);
    prisma.pharmacy.findMany.mockResolvedValue([{ referredById: "ph_parrain" }]);
    mocks.referralState.mockResolvedValue({ benefit: { discountCents: 2_520, basis: "PERCENT" } });
    mocks.getStripe.mockReturnValue(fakeStripe());
    prisma.pharmacy.findFirst.mockResolvedValue({ id: "ph_new" });

    await handleStripeEvent({ id: "evt_paid", type: "invoice.paid", created: 1_800_000_000, data: { object: { id: "in_1", customer: "cus_1", subscription: "sub_new", status: "paid", amount_paid: 49_920, amount_due: 49_920, currency: "eur", status_transitions: { paid_at: 1_800_000_000 } } } } as never);

    expect(prisma.billingPayment.upsert.mock.calls[0][0].create).toMatchObject({ status: "PAID", amountCents: 49_920 });
    expect(mocks.syncProgressiveCommissionsSafely).toHaveBeenCalledTimes(1);
    expect(mocks.syncProgressiveCommissionsSafely).toHaveBeenCalledWith("rep_1", "paiement reçu");
    expect(prisma.pharmacy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_new", referredById: { not: null } } }));
  });

  it("le même événement rejoué : reconnu, rien n'est recompté", async () => {
    prisma.billingEvent.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }));
    const outcome = await handleStripeEvent({ id: "evt_paid", type: "invoice.paid", created: 1_800_000_000, data: { object: { id: "in_1" } } } as never);
    expect(outcome).toMatchObject({ duplicate: true });
    expect(mocks.syncProgressiveCommissionsSafely).not.toHaveBeenCalled();
    expect(prisma.billingPayment.upsert).not.toHaveBeenCalled();
  });
});
