import { beforeEach, describe, expect, it, vi } from "vitest";

/** Après les signatures, l'espace (si besoin) et le lien de paiement partent seuls (fondateur, 5 nov. 2026). */
const db = vi.hoisted(() => ({ contract: { findUnique: vi.fn() }, plan: { findFirst: vi.fn() } }));
const pharmacies = vi.hoisted(() => ({ createPharmacyFromProspect: vi.fn() }));
const billing = vi.hoisted(() => ({ sendSubscriptionInvite: vi.fn() }));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/services/sales/client-pharmacies", () => pharmacies);
vi.mock("@/server/billing/subscriptions", () => billing);

const { afterContractFinalized } = await import("@/server/services/sales/auto-activation");

beforeEach(() => {
  vi.clearAllMocks();
  db.contract.findUnique.mockResolvedValue({ id: "c-1", planId: "plan-1", setupFeeCents: 20_000, prospect: { id: "p-1", name: "Pharmacie du Port", pharmacyId: null } });
  pharmacies.createPharmacyFromProspect.mockResolvedValue({ ok: true, pharmacyId: "ph-1", welcome: { status: "DEFERRED", detail: "" } });
  billing.sendSubscriptionInvite.mockResolvedValue({ ok: true, inviteId: "i-1", sentTo: "marc@port.fr", emailStatus: "SENT", token: "t" });
});

describe("après la signature du contrat", () => {
  it("souscription du site : l'espace naît sans accueil, logiciel bloqué ; le lien de paiement part aux conditions du contrat", async () => {
    await afterContractFinalized("c-1");
    expect(pharmacies.createPharmacyFromProspect).toHaveBeenCalledWith("p-1", expect.objectContaining({ type: "SYSTEM" }), { deferWelcome: true, softwareGate: true });
    expect(billing.sendSubscriptionInvite).toHaveBeenCalledWith({ pharmacyId: "ph-1", planId: "plan-1", contractId: "c-1", adminId: null, setupFeeCents: 20_000 });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "SUBSCRIPTION_INVITE" }));
  });

  it("après une démo, l'espace existe déjà : seul le lien de paiement part", async () => {
    db.contract.findUnique.mockResolvedValue({ id: "c-1", planId: "plan-1", setupFeeCents: null, prospect: { id: "p-1", name: "Pharmacie du Port", pharmacyId: "ph-9" } });
    await afterContractFinalized("c-1");
    expect(pharmacies.createPharmacyFromProspect).not.toHaveBeenCalled();
    expect(billing.sendSubscriptionInvite).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph-9" }));
  });

  it("Stripe absent : rien ne casse, la console est prévenue avec le geste à faire", async () => {
    billing.sendSubscriptionInvite.mockResolvedValue({ ok: false, error: "Stripe n'est pas configuré : clé absente." });
    await afterContractFinalized("c-1");
    const notice = notifications.notifyAdmins.mock.calls.at(-1)?.[0] as { type: string; body: string; severity: string };
    expect(notice).toMatchObject({ type: "DOSSIER_BLOCKED", severity: "CRITICAL" });
    expect(notice.body).toContain("Stripe n'est pas configuré");
    expect(notice.body).toContain("« Envoyer le lien d'abonnement »");
  });
});
