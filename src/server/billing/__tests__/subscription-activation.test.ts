import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le démarrage d'un abonnement active l'officine ET le dit au dossier : sans
 * l'événement « activée », ni les challenges, ni le tableau de bord du directeur,
 * ni le classement ne la compteraient. Ni base, ni Stripe, ni e-mail réels.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    prospect: { findUnique: vi.fn(), update: vi.fn() },
    prospectEvent: { findFirst: vi.fn() },
  },
  recordProspectEvent: vi.fn(),
  notifySalesRep: vi.fn(),
  notifyAdmins: vi.fn(),
  sendEmail: vi.fn(),
  traceDispatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/billing/stripe-client", () => ({ stripeConfigState: vi.fn(), getStripe: vi.fn() }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins, notifySalesRep: mocks.notifySalesRep }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));
vi.mock("@/server/services/platform-onboarding", () => ({ sendInstallationGuide: vi.fn().mockResolvedValue(undefined) }));

const { announceSubscriptionStarted } = await import("../subscriptions");

const { prisma } = mocks;

const subscription = {
  organizationId: "org_1",
  trialEndsAt: null,
  contractPriceCents: 9_900,
  plan: { name: "Officine", priceCents: 9_900 },
  organization: { pharmacies: [{ id: "ph_1", name: "Pharmacie du Parc", memberships: [] }] },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prisma.subscription.findUnique.mockResolvedValue(subscription);
  prisma.prospect.findUnique.mockResolvedValue({ id: "pro_1", name: "Pharmacie du Parc", status: "PHARMACY_CREATED", salesRepId: "rep_1" });
  prisma.prospectEvent.findFirst.mockResolvedValue(null);
});

describe("announceSubscriptionStarted : le dossier", () => {
  it("passe le dossier en activé, écrit l'événement « activée » une fois et prévient le commercial", async () => {
    await announceSubscriptionStarted("org_1");
    expect(prisma.prospect.update).toHaveBeenCalledWith({ where: { id: "pro_1" }, data: { status: "ACTIVATED" } });
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", type: "STATUS_CHANGED", actor: { type: "SYSTEM", label: "Abonnement démarré" }, metadata: expect.objectContaining({ to: "ACTIVATED" }) }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "PHARMACY_ACTIVATED", linkUrl: "/extranet/dossiers/pro_1" }));
  });

  it("un événement « activée » existe déjà (connexion du titulaire) : aucun doublon, aucune seconde notification", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "pro_1", name: "Pharmacie du Parc", status: "ACTIVATED", salesRepId: "rep_1" });
    prisma.prospectEvent.findFirst.mockResolvedValue({ id: "evt_1" });
    await announceSubscriptionStarted("org_1");
    expect(prisma.prospect.update).not.toHaveBeenCalled();
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("dossier déjà activé mais sans événement (ancien cas) : l'événement manquant est écrit", async () => {
    prisma.prospect.findUnique.mockResolvedValue({ id: "pro_1", name: "Pharmacie du Parc", status: "ACTIVATED", salesRepId: null });
    await announceSubscriptionStarted("org_1");
    expect(prisma.prospect.update).not.toHaveBeenCalled();
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(1);
    // Pas de commercial : personne à prévenir.
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("une panne de la trace ne fait pas échouer l'annonce (le webhook ne rejoue pas les e-mails)", async () => {
    mocks.recordProspectEvent.mockRejectedValue(new Error("base indisponible"));
    await expect(announceSubscriptionStarted("org_1")).resolves.toBeUndefined();
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("officine sans dossier commercial : rien à activer", async () => {
    prisma.prospect.findUnique.mockResolvedValue(null);
    await announceSubscriptionStarted("org_1");
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
  });
});
