import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Espace Facturation de la console : tarif contractuel de bout en bout,
 * résiliations, classement des abonnements. Ni base ni Stripe réels : tout
 * est simulé, aucun e-mail ne part.
 */

const mocks = vi.hoisted(() => {
  const prisma = {
    organization: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    contract: { findUnique: vi.fn() },
    pharmacy: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    subscriptionPriceChange: { create: vi.fn() },
    subscriptionInvite: { findFirst: vi.fn(), updateMany: vi.fn() },
    cancellationRequest: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    cancellationEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    recordAudit: vi.fn(),
    notifyAdmins: vi.fn(),
    stripeConfigState: vi.fn(),
    getStripe: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/billing/stripe-client", () => ({ stripeConfigState: mocks.stripeConfigState, getStripe: mocks.getStripe }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: vi.fn() }));
vi.mock("@/server/services/platform-onboarding", () => ({ sendInstallationGuide: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/billing/subscriptions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/billing/subscriptions")>();
  return {
    ...original,
    ensurePlanStripePrice: vi.fn(),
    setCancelAtPeriodEnd: vi.fn(),
    // La vraie synchronisation par défaut ; remplaçable test par test.
    syncSubscriptionFromStripe: vi.fn(original.syncSubscriptionFromStripe),
  };
});

const { syncSubscriptionFromStripe, ensurePlanStripePrice } = await import("@/server/billing/subscriptions");
const { changeContractPrice } = await import("../price-changes");
const cancellations = await import("../cancellations");
const billing = await import("../billing-admin");
const { readSubscription } = await import("@/core/billing/stripe-shapes");

const { prisma } = mocks;

/** `$transaction` : la forme fonction reçoit le client simulé ; la forme tableau attend les promesses. */
function wireTransaction() {
  prisma.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[])));
}

beforeEach(() => {
  vi.clearAllMocks();
  wireTransaction();
  mocks.stripeConfigState.mockReturnValue({ configured: false, mode: "test", keyMatchesMode: false, webhookConfigured: false, detail: "Aucune clé secrète Stripe (STRIPE_SECRET_KEY)." });
});

// ================================================================ Tarif figé à la souscription

const stripeSubscription = (metadata: Record<string, string>) =>
  readSubscription({ id: "sub_stripe_1", customer: "cus_1", status: "trialing", trial_start: 1_790_000_000, trial_end: 1_792_592_000, cancel_at_period_end: false, metadata, items: { data: [{ price: { id: "price_catalogue" }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] } });

describe("création d'abonnement : le tarif contractuel vient du contrat", () => {
  beforeEach(() => {
    prisma.organization.findUnique.mockResolvedValue({ id: "org_1" });
    prisma.plan.findUnique.mockResolvedValue({ id: "plan_1", monthlyPriceCents: 34_900 });
    prisma.subscription.create.mockResolvedValue({ id: "sub_1", status: "TRIALING" });
    prisma.subscriptionInvite.updateMany.mockResolvedValue({ count: 1 });
  });

  it("fige le prix du contrat désigné par l'abonnement Stripe, pas celui de l'offre", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.contract.findUnique.mockResolvedValue({ status: "FINALIZED", version: 1, monthlyPriceCents: 29_000, pharmacy: { organizationId: "org_1" }, prospect: { pharmacy: null } });
    const result = await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1", contractId: "contract_1", inviteId: "inv_1" }));
    expect(result?.created).toBe(true);
    expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
    expect(prisma.subscription.create.mock.calls[0][0].data).toMatchObject({ organizationId: "org_1", planId: "plan_1", contractId: "contract_1", contractPriceCents: 29_000 });
  });

  it("sans contrat, fige le tarif catalogue du moment", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1" }));
    expect(prisma.contract.findUnique).not.toHaveBeenCalled();
    expect(prisma.subscription.create.mock.calls[0][0].data.contractPriceCents).toBe(34_900);
  });

  it("ignore un contrat qui appartient à une autre organisation", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.contract.findUnique.mockResolvedValue({ status: "FINALIZED", version: 1, monthlyPriceCents: 9_900, pharmacy: { organizationId: "org_autre" }, prospect: { pharmacy: null } });
    await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1", contractId: "contract_x" }));
    expect(prisma.subscription.create.mock.calls[0][0].data.contractPriceCents).toBe(34_900);
  });

  it.each(["DRAFT", "SENT", "REFUSED", "EXPIRED"])("un contrat non signé (%s) ne fige ni son tarif ni son identifiant : catalogue du moment", async (status) => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.contract.findUnique.mockResolvedValue({ status, version: 1, monthlyPriceCents: 29_000, pharmacy: { organizationId: "org_1" }, prospect: { pharmacy: null } });
    await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1", contractId: "contract_1" }));
    expect(prisma.subscription.create.mock.calls[0][0].data).toMatchObject({ contractId: null, contractPriceCents: 34_900 });
  });
});

describe("changement du catalogue : aucun effet sur un abonnement existant", () => {
  const existing = { id: "sub_1", organizationId: "org_1", planId: "plan_1", status: "ACTIVE", stripeSubscriptionId: "sub_stripe_1", suspendedAt: null, currentPeriodStart: new Date("2026-09-01"), externalCustomerId: "cus_1", contractId: "contract_1" };

  beforeEach(() => {
    prisma.organization.findUnique.mockResolvedValue({ id: "org_1" });
    // Le catalogue est passé de 290 € à 399 € depuis la souscription.
    prisma.plan.findUnique.mockResolvedValue({ id: "plan_1", monthlyPriceCents: 39_900 });
    prisma.subscription.update.mockResolvedValue({ id: "sub_1", status: "ACTIVE" });
  });

  it("une synchronisation n'écrase jamais un tarif contractuel déjà figé", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...existing, contractPriceCents: 29_000 });
    await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1", contractId: "contract_1" }));
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("contractPriceCents");
    expect(prisma.contract.findUnique).not.toHaveBeenCalled();
  });

  it("une fiche ancienne sans tarif le reçoit une fois, du contrat", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...existing, contractPriceCents: null });
    prisma.contract.findUnique.mockResolvedValue({ status: "FINALIZED", version: 1, monthlyPriceCents: 29_000, pharmacy: null, prospect: { pharmacy: { organizationId: "org_1" } } });
    await syncSubscriptionFromStripe(stripeSubscription({ organizationId: "org_1", planId: "plan_1", contractId: "contract_1" }));
    expect(prisma.subscription.update.mock.calls[0][0].data.contractPriceCents).toBe(29_000);
  });
});

// ================================================================ Modification explicite du tarif

describe("changeContractPrice", () => {
  const base = {
    id: "sub_1",
    organizationId: "org_1",
    planId: "plan_1",
    status: "ACTIVE",
    contractPriceCents: 29_000,
    currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    stripeSubscriptionId: null as string | null,
    plan: { id: "plan_1", monthlyPriceCents: 34_900, currency: "eur", name: "PharmaBoost" },
    organization: { pharmacies: [{ id: "ph_1", name: "Pharmacie du Port" }] },
  };

  beforeEach(() => {
    prisma.subscription.update.mockResolvedValue({});
    prisma.subscriptionPriceChange.create.mockResolvedValue({ id: "chg_1" });
  });

  const priceChangeCreate = () => prisma.subscriptionPriceChange.create;

  it("refuse sans motif, et n'écrit rien", async () => {
    prisma.subscription.findUnique.mockResolvedValue(base);
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "  ", adminId: "adm_1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/motif/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse un abonnement Stripe quand Stripe n'est pas configuré : la fiche ne diverge pas de la facturation", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...base, stripeSubscriptionId: "sub_stripe_1" });
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Avenant signé le 02/10", adminId: "adm_1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Stripe n'est pas configuré/);
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(priceChangeCreate()).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("sans abonnement Stripe : seule la fiche change, historique et audit écrits", async () => {
    prisma.subscription.findUnique.mockResolvedValue(base);
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Geste commercial validé", adminId: "adm_1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.appliedToStripe).toBe(false);
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { contractPriceCents: 31_000 } });
    expect(priceChangeCreate().mock.calls[0][0].data).toMatchObject({ subscriptionId: "sub_1", organizationId: "org_1", previousCents: 29_000, nextCents: 31_000, reason: "Geste commercial validé", appliedToStripe: false, changedByAdminId: "adm_1" });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "billing.contract_price_changed", entityType: "Subscription", entityId: "sub_1", platformAdminId: "adm_1", pharmacyId: "ph_1" });
    expect(audit.metadata.changes).toEqual({ contractPriceCents: { from: 29_000, to: 31_000 } });
    expect(audit.metadata.before.contractPriceCents).toBe(29_000);
    expect(audit.metadata.after.contractPriceCents).toBe(31_000);
  });

  it("avec Stripe : nouveau prix sur le produit de l'offre, ligne remplacée sans prorata", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...base, stripeSubscriptionId: "sub_stripe_1" });
    mocks.stripeConfigState.mockReturnValue({ configured: true, mode: "test", keyMatchesMode: true, webhookConfigured: true, detail: "Clé de test présente." });
    vi.mocked(ensurePlanStripePrice).mockResolvedValue({ ok: true, priceId: "price_catalogue", created: false });
    vi.mocked(syncSubscriptionFromStripe).mockResolvedValueOnce(null);
    prisma.plan.findUnique.mockResolvedValue({ stripeProductId: "prod_1", currency: "eur", name: "PharmaBoost" });
    const stripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ id: "sub_stripe_1", items: { data: [{ id: "si_1" }] } }),
        update: vi.fn().mockResolvedValue({ id: "sub_stripe_1", status: "active", metadata: {}, items: { data: [{ id: "si_1", price: { id: "price_contrat" }, current_period_end: 1_793_491_200 }] } }),
      },
      prices: { create: vi.fn().mockResolvedValue({ id: "price_contrat" }) },
    };
    mocks.getStripe.mockReturnValue(stripe);
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Avenant signé le 02/10", adminId: "adm_1" });
    expect(result.ok).toBe(true);
    expect(stripe.prices.create.mock.calls[0][0]).toMatchObject({ product: "prod_1", unit_amount: 31_000, currency: "eur", recurring: { interval: "month" } });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_stripe_1", { items: [{ id: "si_1", price: "price_contrat" }], proration_behavior: "none" });
    expect(priceChangeCreate().mock.calls[0][0].data).toMatchObject({ appliedToStripe: true, nextCents: 31_000 });
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { contractPriceCents: 31_000, stripePriceId: "price_contrat" } });
  });

  it("Stripe modifié puis base en échec : erreur explicite, alerte CRITIQUE à l'équipe, audit de l'écart — rien n'est caché", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...base, stripeSubscriptionId: "sub_stripe_1" });
    mocks.stripeConfigState.mockReturnValue({ configured: true, mode: "test", keyMatchesMode: true, webhookConfigured: true, detail: "Clé de test présente." });
    vi.mocked(ensurePlanStripePrice).mockResolvedValue({ ok: true, priceId: "price_catalogue", created: false });
    vi.mocked(syncSubscriptionFromStripe).mockResolvedValueOnce(null);
    prisma.plan.findUnique.mockResolvedValue({ stripeProductId: "prod_1", currency: "eur", name: "PharmaBoost" });
    const stripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ id: "sub_stripe_1", items: { data: [{ id: "si_1" }] } }),
        update: vi.fn().mockResolvedValue({ id: "sub_stripe_1", status: "active", metadata: {}, items: { data: [{ id: "si_1", price: { id: "price_contrat" }, current_period_end: 1_793_491_200 }] } }),
      },
      prices: { create: vi.fn().mockResolvedValue({ id: "price_contrat" }) },
    };
    mocks.getStripe.mockReturnValue(stripe);
    prisma.$transaction.mockRejectedValueOnce(new Error("Connexion à la base perdue"));

    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Avenant signé le 02/10", adminId: "adm_1" });

    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Stripe facturera 310\s€ HT\/mois/);
      expect(result.error).toMatch(/la fiche n'a pas pu être mise à jour \(Connexion à la base perdue\)/);
      expect(result.error).toMatch(/affiche toujours 290\s€/);
    }
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
    const alert = mocks.notifyAdmins.mock.calls[0][0];
    expect(alert).toMatchObject({ severity: "CRITICAL", linkUrl: "/admin/abonnements/ph_1" });
    expect(alert.body).toMatch(/sub_stripe_1/);
    expect(alert.body).toMatch(/price_contrat/);
    expect(alert.body).toMatch(/À corriger/);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.contract_price_changed", entityId: "sub_1", pharmacyId: "ph_1", platformAdminId: "adm_1", metadata: { appliedToStripe: true, savedOnRecord: false, error: "Connexion à la base perdue", after: { stripeCents: 31_000, contractPriceCents: 29_000 } } });
  });

  it("base en échec sans abonnement Stripe : erreur simple, aucune alerte (rien n'a divergé)", async () => {
    prisma.subscription.findUnique.mockResolvedValue(base);
    prisma.$transaction.mockRejectedValueOnce(new Error("timeout"));
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Geste commercial validé", adminId: "adm_1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Rien n'a été modifié/);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse un abonnement terminé", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...base, status: "CANCELED" });
    const result = await changeContractPrice({ subscriptionId: "sub_1", nextCents: 31_000, reason: "Avenant signé", adminId: "adm_1" });
    expect(result.ok).toBe(false);
  });
});

// ================================================================ Résiliations

describe("résiliations : transitions", () => {
  const actor = { adminId: "adm_1", label: "Adam Bavard" };

  it("RECEIVED → CONFIRMED : date de confirmation posée, événement et audit écrits", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "RECEIVED", pharmacyId: "ph_1", plannedEndAt: null, stripeScheduled: false });
    prisma.cancellationRequest.updateMany.mockResolvedValue({ count: 1 });
    const end = new Date("2026-12-31T12:00:00Z");
    const result = await cancellations.moveCancellation("req_1", "CONFIRMED", actor, { plannedEndAt: end });
    expect(result.ok).toBe(true);
    const update = prisma.cancellationRequest.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "req_1", status: "RECEIVED" });
    expect(update.data.status).toBe("CONFIRMED");
    expect(update.data.confirmedAt).toBeInstanceOf(Date);
    expect(update.data.plannedEndAt).toEqual(end);
    expect(prisma.cancellationEvent.create.mock.calls[0][0].data).toMatchObject({ requestId: "req_1", type: "STATUS_CHANGED", fromStatus: "RECEIVED", toStatus: "CONFIRMED", actorAdminId: "adm_1" });
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.cancellation_status_changed", entityId: "req_1", metadata: { changes: { status: { from: "RECEIVED", to: "CONFIRMED" } } } });
  });

  it("refuse une fin prévue antérieure à la demande", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "IN_PROGRESS", pharmacyId: "ph_1", requestedAt: new Date("2026-10-02T12:00:00Z"), plannedEndAt: null, stripeScheduled: false });
    const result = await cancellations.moveCancellation("req_1", "CONFIRMED", actor, { plannedEndAt: new Date("2026-09-30T12:00:00Z") });
    expect(result.ok).toBe(false);
    expect(prisma.cancellationRequest.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une transition interdite (une demande terminée ne rouvre pas)", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "COMPLETED", pharmacyId: "ph_1", plannedEndAt: null, stripeScheduled: false });
    const result = await cancellations.moveCancellation("req_1", "IN_PROGRESS", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Passage impossible/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse de sauter de « reçue » à « terminée »", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "RECEIVED", pharmacyId: "ph_1", plannedEndAt: null, stripeScheduled: false });
    const result = await cancellations.moveCancellation("req_1", "COMPLETED", actor);
    expect(result.ok).toBe(false);
  });

  it("une annulation exige un motif", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "IN_PROGRESS", pharmacyId: "ph_1", plannedEndAt: null, stripeScheduled: false });
    const result = await cancellations.moveCancellation("req_1", "CANCELED", actor, { note: "" });
    expect(result.ok).toBe(false);
  });

  it("deux gestes simultanés : le second est refusé sans rien écraser", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "RECEIVED", pharmacyId: "ph_1", plannedEndAt: null, stripeScheduled: false });
    prisma.cancellationRequest.updateMany.mockResolvedValue({ count: 0 });
    const result = await cancellations.moveCancellation("req_1", "IN_PROGRESS", actor);
    expect(result.ok).toBe(false);
    expect(prisma.cancellationEvent.create).not.toHaveBeenCalled();
  });

  it("statusDates : chaque statut pose sa seule date", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    expect(cancellations.statusDates("CONFIRMED", now)).toEqual({ confirmedAt: now });
    expect(cancellations.statusDates("COMPLETED", now)).toEqual({ completedAt: now });
    expect(cancellations.statusDates("CANCELED", now)).toEqual({ canceledAt: now });
    expect(cancellations.statusDates("IN_PROGRESS", now)).toEqual({});
  });

  it("création : organisation et abonnement retrouvés côté serveur", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_1", name: "Pharmacie du Port", isDemo: false, organizationId: "org_1" });
    prisma.cancellationRequest.findFirst.mockResolvedValue(null);
    prisma.subscription.findUnique.mockResolvedValue({ id: "sub_1" });
    prisma.cancellationRequest.create.mockResolvedValue({ id: "req_1" });
    const result = await cancellations.createCancellationRequest({ pharmacyId: "ph_1", reason: "PRICE", channel: "PHONE", requestedAt: new Date("2026-10-02T12:00:00Z"), actor });
    expect(result.ok).toBe(true);
    expect(prisma.cancellationRequest.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph_1", organizationId: "org_1", subscriptionId: "sub_1", status: "RECEIVED", reason: "PRICE", channel: "PHONE", createdByAdminId: "adm_1" });
    expect(prisma.cancellationEvent.create.mock.calls[0][0].data).toMatchObject({ requestId: "req_1", type: "CREATED", toStatus: "RECEIVED" });
    expect(mocks.recordAudit.mock.calls[0][0].action).toBe("billing.cancellation_created");
  });

  it("création : refusée si une demande est déjà ouverte", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_1", name: "Pharmacie du Port", isDemo: false, organizationId: "org_1" });
    prisma.cancellationRequest.findFirst.mockResolvedValue({ id: "req_0" });
    const result = await cancellations.createCancellationRequest({ pharmacyId: "ph_1", reason: "PRICE", channel: "PHONE", requestedAt: new Date("2026-10-02T12:00:00Z"), actor });
    expect(result.ok).toBe(false);
    expect(prisma.cancellationRequest.create).not.toHaveBeenCalled();
  });

  it("fin chez Stripe : refus explicite quand Stripe n'est pas configuré, rien n'est simulé", async () => {
    prisma.cancellationRequest.findUnique.mockResolvedValue({ id: "req_1", status: "CONFIRMED", pharmacyId: "ph_1", organizationId: "org_1", stripeScheduled: false, plannedEndAt: null });
    const result = await cancellations.scheduleStripeEnd("req_1", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/À faire chez Stripe/);
    expect(prisma.cancellationRequest.update).not.toHaveBeenCalled();
  });
});

// ================================================================ Classement des abonnements

describe("filtres d'abonnements", () => {
  const now = new Date("2026-10-03T10:00:00Z");
  const base: import("../billing-admin").SubscriptionClassInput = {
    status: "ACTIVE",
    trialEndsAt: null,
    lastPaymentAt: new Date("2026-09-01"),
    lastPaymentFailedAt: null,
    suspendedAt: null,
    cancelAtPeriodEnd: false,
    hasOpenCancellation: false,
    contractStatus: "FINALIZED",
    inviteSentAt: null,
    inviteCompletedAt: null,
  };
  const classify = (patch: Partial<typeof base>) => billing.classifySubscription({ ...base, ...patch }, now);

  it("actif à jour", () => {
    expect(classify({})).toEqual(["actifs"]);
  });

  it("essai, et fin d'essai sous 7 jours", () => {
    expect(classify({ status: "TRIALING", trialEndsAt: new Date("2026-10-20") })).toEqual(["essai"]);
    expect(classify({ status: "TRIALING", trialEndsAt: new Date("2026-10-08") })).toEqual(["essai", "fin-essai"]);
  });

  it("retard : statut d'impayé, ou échec non suivi d'un paiement réussi", () => {
    expect(classify({ status: "PAST_DUE" })).toContain("retard");
    expect(classify({ status: "UNPAID" })).toContain("retard");
    expect(classify({ lastPaymentFailedAt: new Date("2026-09-20") })).toEqual(["actifs", "retard"]);
    expect(classify({ lastPaymentFailedAt: new Date("2026-08-20") })).toEqual(["actifs"]);
  });

  it("résiliation : demande ouverte ou fin programmée, mais pas un abonnement déjà terminé", () => {
    expect(classify({ hasOpenCancellation: true })).toContain("resiliation");
    expect(classify({ cancelAtPeriodEnd: true })).toContain("resiliation");
    expect(classify({ status: "CANCELED", cancelAtPeriodEnd: true })).toEqual(["resilies"]);
  });

  it("résiliés, suspendus", () => {
    expect(classify({ status: "INCOMPLETE_EXPIRED" })).toEqual(["resilies"]);
    expect(classify({ status: "SUSPENDED", suspendedAt: new Date("2026-10-01") })).toEqual(["suspendus"]);
    expect(classify({ suspendedAt: new Date("2026-10-01") })).toContain("suspendus");
  });

  it("sans abonnement : dans aucun filtre d'abonnement", () => {
    expect(classify({ status: null, lastPaymentAt: null })).toEqual([]);
  });

  it("anciennes valeurs d'adresse : toujours acceptées", () => {
    expect(billing.resolveSubscriptionFilter("impayes")).toEqual({ key: "retard", label: "En retard de paiement", legacy: false });
    expect(billing.resolveSubscriptionFilter("contrats-envoyes")?.legacy).toBe(true);
    expect(billing.resolveSubscriptionFilter("inconnu")).toBeNull();
    expect(billing.matchesSubscriptionFilter("impayes", { ...base, status: "PAST_DUE" }, now)).toBe(true);
    expect(billing.matchesSubscriptionFilter("contrats-envoyes", { ...base, contractStatus: "OPENED" }, now)).toBe(true);
    expect(billing.matchesSubscriptionFilter("contrats-signes", { ...base, contractStatus: "SENT" }, now)).toBe(false);
    expect(billing.matchesSubscriptionFilter("contrats-attente", { ...base, status: null, contractStatus: null }, now)).toBe(true);
    expect(billing.matchesSubscriptionFilter("invites", { ...base, status: null, inviteSentAt: new Date("2026-09-30") }, now)).toBe(true);
    expect(billing.matchesSubscriptionFilter("invites", { ...base, status: null, inviteSentAt: new Date("2026-09-30"), inviteCompletedAt: new Date("2026-10-01") }, now)).toBe(false);
  });

  it("compteurs par filtre", () => {
    const counts = billing.countSubscriptionFilters([base, { ...base, status: "TRIALING", trialEndsAt: new Date("2026-10-05") }, { ...base, status: "PAST_DUE" }], now);
    expect(counts).toMatchObject({ actifs: 1, essai: 1, "fin-essai": 1, retard: 1, resilies: 0 });
  });

  it("état du paiement, recherche, totaux, écart de prix", () => {
    expect(billing.paymentState({ status: "ACTIVE", lastPaymentAt: new Date("2026-09-01"), lastPaymentCents: 29_000, lastPaymentFailedAt: new Date("2026-09-20") }).label).toBe("Échec non régularisé");
    expect(billing.paymentState({ status: "ACTIVE", lastPaymentAt: new Date("2026-09-01"), lastPaymentCents: 29_000, lastPaymentFailedAt: null }).tone).toBe("success");
    expect(billing.paymentState({ status: "TRIALING", lastPaymentAt: null, lastPaymentCents: null, lastPaymentFailedAt: null }).label).toBe("Aucun paiement");
    expect(billing.matchesQuery("pharmacie eglise", ["Pharmacie de l'Église", "Lyon"])).toBe(true);
    expect(billing.matchesQuery("marseille", ["Pharmacie de l'Église", "Lyon"])).toBe(false);
    expect(billing.paymentTotals([{ status: "PAID", amountCents: 29_000 }, { status: "FAILED", amountCents: 29_000 }, { status: "OPEN", amountCents: 100 }])).toMatchObject({ paidCents: 29_000, failedCents: 29_000, openCents: 100 });
    expect(billing.priceGap(29_000, 34_900)).toEqual({ diffCents: -5_900, percent: -16.9 });
    expect(billing.cancellationFilterStatuses("ouvertes")).toEqual(["RECEIVED", "IN_PROGRESS", "CONFIRMED"]);
    expect(billing.paymentFilterStatuses("echoue")).toEqual(["FAILED", "UNCOLLECTIBLE"]);
  });
});
