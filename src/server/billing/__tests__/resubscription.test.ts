import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'abonnement côté serveur, sur les cas où le tarif ou l'état pouvaient
 * mentir : réabonnement après une résiliation, lien d'activation adossé à un
 * contrat non signé, essai du contrat, rétablissement d'un accès suspendu,
 * traces des gestes et des e-mails. Ni base ni Stripe réels : tout est
 * simulé, aucun e-mail ne part.
 */

const mocks = vi.hoisted(() => {
  const prisma = {
    organization: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contract: { findUnique: vi.fn(), findFirst: vi.fn() },
    pharmacy: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    subscriptionPriceChange: { create: vi.fn() },
    subscriptionInvite: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    session: { updateMany: vi.fn() },
    auditLog: { findFirst: vi.fn() },
    companyProfile: { findUnique: vi.fn() },
    stockConnection: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    recordAudit: vi.fn(),
    notifyAdmins: vi.fn(),
    traceDispatch: vi.fn(),
    sendEmail: vi.fn(),
    stripeConfigState: vi.fn(),
    getStripe: vi.fn(),
    requirePlatformSession: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/billing/stripe-client", () => ({ stripeConfigState: mocks.stripeConfigState, getStripe: mocks.getStripe }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/security/tokens", () => ({ generateToken: () => "jeton-de-test-0123456789abcdef", hashToken: (token: string) => `hash:${token}` }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));
vi.mock("@/server/services/site-leads", () => ({ DEFAULT_CONTACT_EMAIL: "contact@pharmaboost.test" }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/sales/pharmacy-dossier", () => ({ ensureDossierForPharmacy: vi.fn(), refreshDossierFromPharmacy: vi.fn() }));
vi.mock("@/server/services/sales/contracts", () => ({ generateContract: vi.fn(), sendContract: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/app/(public)/abonnement/activer/[token]/activate-button", () => ({ ActivateButton: () => null }));

const subscriptions = await import("../subscriptions");
const { sendInstallationGuide } = await import("@/server/services/platform-onboarding");
const { sendSubscriptionInviteAction } = await import("@/server/actions/platform-billing");
const { readSubscription } = await import("@/core/billing/stripe-shapes");

const { prisma } = mocks;

const NOT_CONFIGURED = { configured: false, mode: "test", keyMatchesMode: false, webhookConfigured: false, detail: "Aucune clé secrète Stripe (STRIPE_SECRET_KEY)." };
const CONFIGURED = { configured: true, mode: "test", keyMatchesMode: true, webhookConfigured: true, detail: "Clé de test présente." };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[])));
  mocks.stripeConfigState.mockReturnValue(NOT_CONFIGURED);
  mocks.traceDispatch.mockResolvedValue({ id: "dispatch_1" });
});

// ================================================================ Réabonnement

const DAY = 86_400;
const NEW_START = Math.floor(new Date("2026-10-03T08:00:00Z").getTime() / 1000);

function stripeSub(input: { id: string; status?: string; start?: number; metadata?: Record<string, string> }) {
  const start = input.start ?? NEW_START;
  return readSubscription({
    id: input.id,
    customer: "cus_1",
    status: input.status ?? "trialing",
    trial_start: start,
    trial_end: start + 30 * DAY,
    cancel_at_period_end: false,
    metadata: input.metadata ?? {},
    items: { data: [{ price: { id: "price_x" }, current_period_start: start, current_period_end: start + 30 * DAY }] },
  });
}

/** Une officine résiliée : ancien abonnement Stripe sub_old, tarif figé à 290 € sur le contrat v1. */
const canceledRow = {
  id: "row_1",
  organizationId: "org_1",
  planId: "plan_1",
  status: "CANCELED",
  stripeSubscriptionId: "sub_old" as string | null,
  suspendedAt: null,
  currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
  externalCustomerId: "cus_1",
  contractId: "contract_v1" as string | null,
  contractPriceCents: 29_000 as number | null,
  lastPaymentFailedAt: new Date("2026-07-20T00:00:00Z") as Date | null,
};

const signedV2 = { status: "FINALIZED", version: 2, monthlyPriceCents: 32_000, pharmacy: { organizationId: "org_1" }, prospect: { pharmacy: null } };

describe("réabonnement : un nouvel abonnement Stripe est une naissance", () => {
  beforeEach(() => {
    prisma.organization.findUnique.mockResolvedValue({ id: "org_1" });
    prisma.plan.findUnique.mockResolvedValue({ id: "plan_1", monthlyPriceCents: 34_900 });
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.update.mockResolvedValue({ id: "row_1", status: "TRIALING" });
    prisma.subscriptionPriceChange.create.mockResolvedValue({ id: "chg_1" });
    prisma.pharmacy.findFirst.mockResolvedValue({ id: "ph_1" });
    prisma.subscriptionInvite.updateMany.mockResolvedValue({ count: 1 });
  });

  it("après une résiliation, le tarif et le contrat du nouveau lien remplacent les anciens ; l'écart est inscrit et l'abonnement annoncé", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);
    prisma.contract.findUnique.mockResolvedValue(signedV2);

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1", contractId: "contract_v2", inviteId: "inv_2" } }));

    expect(result).toMatchObject({ organizationId: "org_1", subscriptionId: "row_1", created: true, statusChanged: true });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    const write = prisma.subscription.updateMany.mock.calls[0][0];
    expect(write.where).toEqual({ id: "row_1", stripeSubscriptionId: "sub_old" });
    expect(write.data).toMatchObject({ stripeSubscriptionId: "sub_new", contractId: "contract_v2", contractPriceCents: 32_000, status: "TRIALING", lastPaymentFailedAt: null });
    expect(prisma.subscriptionPriceChange.create).toHaveBeenCalledTimes(1);
    const change = prisma.subscriptionPriceChange.create.mock.calls[0][0].data;
    expect(change).toMatchObject({ subscriptionId: "row_1", organizationId: "org_1", previousCents: 29_000, nextCents: 32_000, appliedToStripe: true, changedByAdminId: null });
    expect(change.reason).toMatch(/Réabonnement.*contrat v2 signé/);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({
      action: "billing.contract_price_changed",
      entityId: "row_1",
      pharmacyId: "ph_1",
      metadata: { changes: { contractPriceCents: { from: 29_000, to: 32_000 } }, before: { contractId: "contract_v1", stripeSubscriptionId: "sub_old" }, after: { contractId: "contract_v2", stripeSubscriptionId: "sub_new" }, priceChangeId: "chg_1" },
    });
  });

  it("un nouveau lien sans contrat n'hérite pas de l'ancien contrat : tarif catalogue du moment, ce que Stripe facture", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1" } }));

    expect(result?.created).toBe(true);
    expect(prisma.contract.findUnique).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany.mock.calls[0][0].data).toMatchObject({ contractId: null, contractPriceCents: 34_900 });
    const change = prisma.subscriptionPriceChange.create.mock.calls[0][0].data;
    expect(change).toMatchObject({ previousCents: 29_000, nextCents: 34_900 });
    expect(change.reason).toMatch(/tarif catalogue/);
  });

  it("un contrat non signé sur le nouveau lien ne fonde rien : catalogue, aucun contrat d'origine", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);
    prisma.contract.findUnique.mockResolvedValue({ ...signedV2, status: "REFUSED" });

    await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1", contractId: "contract_v2" } }));

    expect(prisma.subscription.updateMany.mock.calls[0][0].data).toMatchObject({ contractId: null, contractPriceCents: 34_900 });
  });

  it("une fiche sans abonnement Stripe (tarif posé sur la fiche) qui en reçoit un à un autre montant : nouveau tarif, écart inscrit", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...canceledRow, status: "ACTIVE", stripeSubscriptionId: null, contractId: null, lastPaymentFailedAt: null });

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1" } }));

    expect(result?.created).toBe(true);
    expect(prisma.subscription.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "row_1", stripeSubscriptionId: null }, data: { stripeSubscriptionId: "sub_new", contractPriceCents: 34_900 } });
    expect(prisma.subscriptionPriceChange.create.mock.calls[0][0].data).toMatchObject({ previousCents: 29_000, nextCents: 34_900 });
  });

  it("réabonnement au même tarif : nouveau contrat retenu, aucun écart inscrit", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);
    prisma.contract.findUnique.mockResolvedValue({ ...signedV2, monthlyPriceCents: 29_000 });

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1", contractId: "contract_v2" } }));

    expect(result?.created).toBe(true);
    expect(prisma.subscription.updateMany.mock.calls[0][0].data).toMatchObject({ contractId: "contract_v2", contractPriceCents: 29_000 });
    expect(prisma.subscriptionPriceChange.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("la synchronisation suivante du même abonnement n'est plus une naissance : rien n'est réécrit, rien n'est annoncé", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...canceledRow, status: "TRIALING", stripeSubscriptionId: "sub_new", contractId: "contract_v2", contractPriceCents: 32_000, currentPeriodStart: new Date(NEW_START * 1000) });
    prisma.plan.findUnique.mockResolvedValue({ id: "plan_1", monthlyPriceCents: 39_900 });

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1", contractId: "contract_v2" } }));

    expect(result?.created).toBe(false);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("contractPriceCents");
    expect(data.contractId).toBe("contract_v2");
    expect(prisma.subscriptionPriceChange.create).not.toHaveBeenCalled();
  });

  it("deux événements simultanés du même nouvel abonnement : une seule naissance", async () => {
    // Le second lit encore l'ancienne ligne, mais le premier l'a déjà rattachée.
    prisma.subscription.findUnique.mockResolvedValueOnce(canceledRow).mockResolvedValueOnce({ id: "row_1", stripeSubscriptionId: "sub_new" });
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    prisma.contract.findUnique.mockResolvedValue(signedV2);

    const result = await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_new", metadata: { organizationId: "org_1", planId: "plan_1", contractId: "contract_v2" } }));

    expect(result).toEqual({ organizationId: "org_1", subscriptionId: "row_1", created: false, statusChanged: false });
    expect(prisma.subscriptionPriceChange.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("un événement tardif d'un abonnement plus ancien ne réinitialise jamais la ligne", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);
    // sub_older a précédé sub_old : sa période a commencé avant celle de la ligne.
    const late = stripeSub({ id: "sub_older", status: "past_due", start: Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000), metadata: { organizationId: "org_1", planId: "plan_1" } });

    expect(await subscriptions.syncSubscriptionFromStripe(late)).toBeNull();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.subscriptionPriceChange.create).not.toHaveBeenCalled();
  });

  it("un autre abonnement déjà terminé ne prend jamais la place de celui de la ligne", async () => {
    prisma.subscription.findUnique.mockResolvedValue(canceledRow);
    expect(await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_other", status: "canceled", metadata: { organizationId: "org_1", planId: "plan_1" } }))).toBeNull();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("un abonnement en cours n'est pas écrasé par l'événement tardif de l'ancien", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ ...canceledRow, status: "ACTIVE", stripeSubscriptionId: "sub_new", currentPeriodStart: new Date(NEW_START * 1000) });
    expect(await subscriptions.syncSubscriptionFromStripe(stripeSub({ id: "sub_old", status: "active", metadata: { organizationId: "org_1", planId: "plan_1" } }))).toBeNull();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

// ================================================================ Lien d'activation : contrat signé seulement

describe("lien d'activation : seul un contrat signé fonde le tarif, l'essai et l'identifiant", () => {
  const plan = { id: "plan_1", code: "PB", name: "PharmaBoost", description: "", isActive: true, monthlyPriceCents: 34_900, currency: "eur", trialDays: 0, stripeProductId: "prod_1", stripePriceId: "price_catalogue" };
  const pharmacy = { id: "ph_1", name: "Pharmacie du Port", organizationId: "org_1", email: "contact@pharmacie-du-port.test", addressLine1: "1 quai", postalCode: "13002", city: "Marseille", siret: null, memberships: [{ user: { firstName: "Claire", lastName: "Martin", email: "claire@pharmacie-du-port.test" } }] };
  const contract = (patch: Record<string, unknown> = {}) => ({ pharmacyId: "ph_1", planId: "plan_1", status: "FINALIZED", version: 1, monthlyPriceCents: 29_000, trialDays: 30, prospect: { pharmacyId: "ph_1" }, ...patch });

  function stripeForPlan() {
    const stripe = {
      products: { retrieve: vi.fn().mockResolvedValue({ name: plan.name, description: undefined }), update: vi.fn(), create: vi.fn() },
      prices: { retrieve: vi.fn().mockResolvedValue({ unit_amount: plan.monthlyPriceCents, currency: "eur", recurring: { interval: "month" }, active: true, product: "prod_1" }), update: vi.fn(), create: vi.fn() },
      customers: { retrieve: vi.fn(), create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
      checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }) } },
    };
    mocks.getStripe.mockReturnValue(stripe);
    return stripe;
  }

  beforeEach(() => {
    prisma.pharmacy.findUnique.mockResolvedValue(pharmacy);
    prisma.plan.findUnique.mockResolvedValue(plan);
    prisma.plan.update.mockResolvedValue(plan);
  });

  it("inviteTerms : contrat signé → son tarif et son essai ; sinon le catalogue", () => {
    expect(subscriptions.inviteTerms(plan, { status: "FINALIZED", monthlyPriceCents: 29_000, trialDays: 30 })).toEqual({ monthlyPriceCents: 29_000, trialDays: 30, fromContract: true });
    for (const status of ["DRAFT", "SENT", "OPENED", "SIGNED_PHARMACY", "REFUSED", "EXPIRED"]) {
      expect(subscriptions.inviteTerms(plan, { status, monthlyPriceCents: 29_000, trialDays: 30 })).toEqual({ monthlyPriceCents: 34_900, trialDays: 0, fromContract: false });
    }
    expect(subscriptions.inviteTerms(plan, null)).toEqual({ monthlyPriceCents: 34_900, trialDays: 0, fromContract: false });
  });

  it.each(["DRAFT", "SENT", "OPENED", "REFUSED", "EXPIRED"])("refuse d'envoyer un lien adossé à un contrat %s", async (status) => {
    prisma.contract.findUnique.mockResolvedValueOnce(contract({ status }));
    const result = await subscriptions.sendSubscriptionInvite({ pharmacyId: "ph_1", planId: "plan_1", contractId: "contract_1", adminId: "adm_1" });
    expect(result).toEqual({ ok: false, error: "Le contrat v1 n'est pas signé : le lien ne peut pas reprendre ses conditions." });
    expect(prisma.subscriptionInvite.create).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse un contrat signé portant sur une autre offre que celle du lien", async () => {
    prisma.contract.findUnique.mockResolvedValueOnce(contract({ planId: "plan_autre" }));
    const otherPlan = await subscriptions.sendSubscriptionInvite({ pharmacyId: "ph_1", planId: "plan_1", contractId: "contract_1", adminId: "adm_1" });
    expect(otherPlan.ok).toBe(false);
    if (!otherPlan.ok) expect(otherPlan.error).toMatch(/autre offre/);

    expect(prisma.subscriptionInvite.create).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("contrat signé : l'e-mail annonce l'essai et le tarif du contrat, et l'envoi est tracé dans l'historique", async () => {
    mocks.stripeConfigState.mockReturnValue(CONFIGURED);
    stripeForPlan();
    prisma.contract.findUnique.mockResolvedValue(contract());
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvite.findFirst.mockResolvedValue(null);
    prisma.subscriptionInvite.create.mockResolvedValue({ id: "inv_1" });
    mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "Envoyé.", messageId: "msg_1" });

    const result = await subscriptions.sendSubscriptionInvite({ pharmacyId: "ph_1", planId: "plan_1", contractId: "contract_1", adminId: "adm_1" });

    expect(result).toMatchObject({ ok: true, inviteId: "inv_1", sentTo: "claire@pharmacie-du-port.test" });
    // L'offre est passée à 0 jour d'essai depuis la signature : le contrat (30 jours) l'emporte.
    expect(mocks.sendEmail.mock.calls[0][0].text).toMatch(/Premier mois offert, puis 290\s€ HT par mois/);
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "SUBSCRIPTION_INVITE", trigger: "SYSTEM", recipient: "claire@pharmacie-du-port.test", pharmacyId: "ph_1", organizationId: "org_1", contractId: "contract_1", sentByAdminId: "adm_1" }));
  });

  it("un envoi en échec est tracé lui aussi", async () => {
    mocks.stripeConfigState.mockReturnValue(CONFIGURED);
    stripeForPlan();
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvite.findFirst.mockResolvedValue(null);
    prisma.subscriptionInvite.create.mockResolvedValue({ id: "inv_1" });
    prisma.subscriptionInvite.update.mockResolvedValue({ id: "inv_1" });
    mocks.sendEmail.mockResolvedValue({ status: "FAILED", provider: "resend", detail: "Adresse refusée." });

    const result = await subscriptions.sendSubscriptionInvite({ pharmacyId: "ph_1", planId: "plan_1", contractId: null, adminId: "adm_1" });

    expect(result.ok).toBe(false);
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "SUBSCRIPTION_INVITE", pharmacyId: "ph_1", organizationId: "org_1", outcome: expect.objectContaining({ status: "FAILED" }) }));
  });

  const inviteRow = (contractPatch: Record<string, unknown> | null, planPatch: Record<string, unknown> = {}) => ({
    id: "inv_1",
    pharmacyId: "ph_1",
    organizationId: "org_1",
    planId: "plan_1",
    contractId: contractPatch ? "contract_1" : null,
    sentTo: "claire@pharmacie-du-port.test",
    stripeCustomerId: null,
    expiresAt: new Date(Date.now() + 10 * DAY * 1000),
    openedAt: new Date(),
    completedAt: null,
    plan: { ...plan, ...planPatch },
    pharmacy: { id: "ph_1", name: "Pharmacie du Port", organizationId: "org_1" },
    contract: contractPatch ? { status: "FINALIZED", version: 1, planId: "plan_1", monthlyPriceCents: 29_000, trialDays: 30, ...contractPatch } : null,
  });

  it("le lien vu par le titulaire : contrat non signé → tarif et essai catalogue, aucun contrat repris", async () => {
    prisma.subscriptionInvite.findUnique.mockResolvedValue(inviteRow({ status: "SENT" }, { trialDays: 14 }));
    const peeked = await subscriptions.peekInvite("jeton-de-test-0123456789abcdef");
    expect(peeked?.invite).toMatchObject({ contractId: null, contract: null, billedMonthlyPriceCents: 34_900, billedTrialDays: 14 });
  });

  it("le lien vu par le titulaire : contrat signé → l'essai du contrat, pas celui du catalogue du jour", async () => {
    prisma.subscriptionInvite.findUnique.mockResolvedValue(inviteRow({}));
    const peeked = await subscriptions.peekInvite("jeton-de-test-0123456789abcdef");
    expect(peeked?.invite).toMatchObject({ contractId: "contract_1", billedMonthlyPriceCents: 29_000, billedTrialDays: 30, catalogMonthlyPriceCents: 34_900, catalogTrialDays: 0 });
  });

  it("le lien vu par le titulaire : un contrat portant sur une autre offre ne fonde rien", async () => {
    prisma.subscriptionInvite.findUnique.mockResolvedValue(inviteRow({ planId: "plan_autre" }));
    const peeked = await subscriptions.peekInvite("jeton-de-test-0123456789abcdef");
    expect(peeked?.invite).toMatchObject({ contractId: null, billedMonthlyPriceCents: 34_900, billedTrialDays: 0 });
  });

  it("le Checkout facture le tarif ET l'essai du contrat signé", async () => {
    mocks.stripeConfigState.mockReturnValue(CONFIGURED);
    const stripe = stripeForPlan();
    prisma.subscriptionInvite.findUnique.mockResolvedValue(inviteRow({}));
    prisma.pharmacy.findUniqueOrThrow.mockResolvedValue({ ...pharmacy, addressLine2: null, country: "FR" });
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvite.update.mockResolvedValue({ id: "inv_1" });

    const result = await subscriptions.startCheckoutForInvite("jeton-de-test-0123456789abcdef");

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_1" });
    const session = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(session.subscription_data.trial_period_days).toBe(30);
    expect(session.line_items[0]).toEqual({ price_data: { currency: "eur", product: "prod_1", unit_amount: 29_000, recurring: { interval: "month" } }, quantity: 1 });
    expect(session.metadata.contractId).toBe("contract_1");
  });

  it("le Checkout d'un lien adossé à un contrat refusé : prix et essai catalogue, aucun contrat dans les métadonnées", async () => {
    mocks.stripeConfigState.mockReturnValue(CONFIGURED);
    const stripe = stripeForPlan();
    prisma.subscriptionInvite.findUnique.mockResolvedValue(inviteRow({ status: "REFUSED" }));
    prisma.pharmacy.findUniqueOrThrow.mockResolvedValue({ ...pharmacy, addressLine2: null, country: "FR" });
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvite.update.mockResolvedValue({ id: "inv_1" });

    await subscriptions.startCheckoutForInvite("jeton-de-test-0123456789abcdef");

    const session = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(session.line_items[0]).toEqual({ price: "price_catalogue", quantity: 1 });
    expect(session.subscription_data).not.toHaveProperty("trial_period_days");
    expect(session.metadata.contractId).toBe("");
  });

  it("console : le dernier contrat ne fonde le lien que s'il est signé", async () => {
    mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1", fullName: "Adam Bavard" } });

    // Contrat v1 refusé : son offre au tarif catalogue, sans identifiant de contrat.
    prisma.contract.findFirst.mockResolvedValueOnce({ id: "contract_v1", planId: "plan_1", status: "REFUSED", plan: { isActive: true } });
    const refused = await sendSubscriptionInviteAction({ pharmacyId: "ph_1" });
    expect(refused.ok).toBe(false); // Stripe n'est pas configuré : l'envoi s'arrête là.
    expect(prisma.contract.findUnique).not.toHaveBeenCalled();
    expect(prisma.plan.findUnique).toHaveBeenCalledWith({ where: { id: "plan_1" } });

    // Contrat v2 signé : son identifiant accompagne le lien.
    prisma.contract.findFirst.mockResolvedValueOnce({ id: "contract_v2", planId: "plan_1", status: "FINALIZED", plan: { isActive: true } });
    prisma.contract.findUnique.mockResolvedValueOnce(contract({ version: 2 }));
    await sendSubscriptionInviteAction({ pharmacyId: "ph_1" });
    expect(prisma.contract.findUnique.mock.calls[0][0].where).toEqual({ id: "contract_v2" });
  });
});

// ================================================================ Suspension et rétablissement

describe("rétablir l'accès : l'abonnement ne reste pas « suspendu »", () => {
  const pharmacy = { id: "ph_1", organizationId: "org_1", name: "Pharmacie du Port" };
  const future = new Date(Date.now() + 10 * DAY * 1000);
  const past = new Date(Date.now() - 10 * DAY * 1000);

  beforeEach(() => {
    prisma.pharmacy.findUnique.mockResolvedValue(pharmacy);
    prisma.pharmacy.update.mockResolvedValue({});
    prisma.session.updateMany.mockResolvedValue({ count: 2 });
    prisma.subscription.update.mockResolvedValue({});
  });

  it("la suspension mémorise le statut qu'elle remplace", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "row_1", stripeSubscriptionId: null, status: "TRIALING", trialEndsAt: future });
    await subscriptions.setAccessSuspended("ph_1", true, "Impayé depuis deux mois", "adm_1");
    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({ status: "SUSPENDED", suspendedReason: "Impayé depuis deux mois" });
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.access_suspended", pharmacyId: "ph_1", metadata: { previousStatus: "TRIALING", changes: { status: { from: "TRIALING", to: "SUSPENDED" } } } });
  });

  it("sans Stripe : le statut d'avant la suspension est restauré, et l'audit le dit", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "row_1", stripeSubscriptionId: null, status: "SUSPENDED", trialEndsAt: past });
    prisma.auditLog.findFirst.mockResolvedValue({ metadata: { reason: "Impayé", previousStatus: "PAST_DUE" } });
    await subscriptions.setAccessSuspended("ph_1", false, null, "adm_1");
    expect(prisma.subscription.update.mock.calls[0][0].data).toEqual({ suspendedAt: null, suspendedReason: null, status: "PAST_DUE" });
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.access_restored", metadata: { statusSource: "BEFORE_SUSPENSION", changes: { status: { from: "SUSPENDED", to: "PAST_DUE" } } } });
  });

  it("sans statut mémorisé : en essai si l'essai court encore, sinon actif", async () => {
    prisma.auditLog.findFirst.mockResolvedValue(null);
    prisma.subscription.findUnique.mockResolvedValueOnce({ id: "row_1", stripeSubscriptionId: null, status: "SUSPENDED", trialEndsAt: future });
    await subscriptions.setAccessSuspended("ph_1", false, null, "adm_1");
    expect(prisma.subscription.update.mock.calls[0][0].data.status).toBe("TRIALING");
    expect(mocks.recordAudit.mock.calls[0][0].metadata.statusSource).toBe("TRIAL_RUNNING");

    prisma.subscription.findUnique.mockResolvedValueOnce({ id: "row_1", stripeSubscriptionId: null, status: "SUSPENDED", trialEndsAt: past });
    await subscriptions.setAccessSuspended("ph_1", false, null, "adm_1");
    expect(prisma.subscription.update.mock.calls[1][0].data.status).toBe("ACTIVE");
    expect(mocks.recordAudit.mock.calls[1][0].metadata.statusSource).toBe("DEFAULT_ACTIVE");
  });

  it("relecture Stripe impossible : le statut restauré reste, l'échec est dit dans l'audit", async () => {
    prisma.subscription.findUnique
      .mockResolvedValueOnce({ id: "row_1", stripeSubscriptionId: "sub_1", status: "SUSPENDED", trialEndsAt: past })
      .mockResolvedValueOnce({ stripeSubscriptionId: "sub_1" });
    prisma.auditLog.findFirst.mockResolvedValue({ metadata: { previousStatus: "ACTIVE" } });
    await subscriptions.setAccessSuspended("ph_1", false, null, "adm_1");
    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({ status: "ACTIVE", suspendedAt: null });
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit.metadata.statusSource).toBe("BEFORE_SUSPENSION");
    expect(audit.metadata.stripeRefreshError).toMatch(/Stripe n'est pas configuré/);
    expect(audit.metadata.statusNote).toMatch(/Relecture Stripe impossible/);
  });
});

// ================================================================ Fin programmée : l'audit retrouve l'officine

describe("programmer ou annuler la fin d'abonnement", () => {
  it("l'audit porte l'officine (retrouvée côté serveur) et l'avant/après", async () => {
    mocks.stripeConfigState.mockReturnValue(CONFIGURED);
    const updated = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: true, metadata: { organizationId: "org_1", planId: "plan_1" }, items: { data: [{ price: { id: "price_x" }, current_period_start: NEW_START, current_period_end: NEW_START + 30 * DAY }] } };
    mocks.getStripe.mockReturnValue({ subscriptions: { update: vi.fn().mockResolvedValue(updated) } });
    prisma.subscription.findUnique
      .mockResolvedValueOnce({ id: "row_1", stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: false })
      .mockResolvedValueOnce({ ...canceledRow, status: "ACTIVE", stripeSubscriptionId: "sub_1", currentPeriodStart: new Date(NEW_START * 1000) });
    prisma.organization.findUnique.mockResolvedValue({ id: "org_1" });
    prisma.plan.findUnique.mockResolvedValue({ id: "plan_1", monthlyPriceCents: 34_900 });
    prisma.subscription.update.mockResolvedValue({ id: "row_1", status: "ACTIVE" });
    prisma.pharmacy.findFirst.mockResolvedValue({ id: "ph_1" });

    const result = await subscriptions.setCancelAtPeriodEnd("org_1", true, "adm_1");

    expect(result).toEqual({ ok: true });
    expect(prisma.pharmacy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_1" } }));
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "billing.cancel_scheduled", pharmacyId: "ph_1", platformAdminId: "adm_1", metadata: { organizationId: "org_1", subscriptionId: "row_1", changes: { cancelAtPeriodEnd: { from: false, to: true } } } });
  });
});

// ================================================================ Guide d'installation : tracé dans l'historique

describe("guide d'installation", () => {
  it("chaque envoi laisse sa trace (officine et organisation)", async () => {
    prisma.pharmacy.findUnique.mockResolvedValue({ id: "ph_1", name: "Pharmacie du Port", email: null, organizationId: "org_1", memberships: [{ user: { firstName: "Claire", lastName: "Martin", email: "claire@pharmacie-du-port.test" } }] });
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.stockConnection.findUnique.mockResolvedValue(null);
    mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "Envoyé.", messageId: "msg_2" });

    const result = await sendInstallationGuide("ph_1", { adminId: "adm_1", reason: "ADMIN" });

    expect(result).toMatchObject({ status: "SENT", sentTo: "claire@pharmacie-du-port.test" });
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "INSTALL_GUIDE", trigger: "SYSTEM", recipient: "claire@pharmacie-du-port.test", pharmacyId: "ph_1", organizationId: "org_1", sentByAdminId: "adm_1" }));
  });
});

// ================================================================ Page d'activation : ce qui s'affiche est ce qui s'applique

describe("page d'activation", () => {
  const plan = { id: "plan_1", code: "PB", name: "PharmaBoost", description: "", isActive: true, monthlyPriceCents: 34_900, currency: "eur", trialDays: 0, stripeProductId: "prod_1", stripePriceId: "price_catalogue" };
  const row = (patch: Record<string, unknown>) => ({
    id: "inv_1",
    pharmacyId: "ph_1",
    organizationId: "org_1",
    planId: "plan_1",
    contractId: "contract_1",
    sentTo: "claire@pharmacie-du-port.test",
    stripeCustomerId: null,
    expiresAt: new Date(Date.now() + 10 * DAY * 1000),
    openedAt: new Date(),
    completedAt: null,
    plan,
    pharmacy: { id: "ph_1", name: "Pharmacie du Port", organizationId: "org_1" },
    contract: { status: "FINALIZED", version: 1, planId: "plan_1", monthlyPriceCents: 29_000, trialDays: 30 },
    ...patch,
  });

  async function render() {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Page } = await import("@/app/(public)/abonnement/activer/[token]/page");
    return renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "jeton-de-test-0123456789abcdef" }) })).replace(/ /g, " ");
  }

  it("lien neuf adossé à un contrat signé : le tarif et l'essai du contrat", async () => {
    prisma.subscriptionInvite.findUnique.mockResolvedValue(row({}));
    const html = await render();
    expect(html).toContain("290 € HT / mois");
    expect(html).toContain("Premier mois offert");
    expect(html).not.toContain("349");
  });

  it("lien déjà utilisé : aucun prix réaffiché (ni le catalogue du jour, ni l'essai)", async () => {
    prisma.subscriptionInvite.findUnique.mockResolvedValue(row({ contractId: null, contract: null, completedAt: new Date() }));
    const html = await render();
    expect(html).toContain("Cet abonnement a déjà été activé");
    expect(html).not.toContain("349");
    expect(html).not.toContain("HT / mois");
  });
});
