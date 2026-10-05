import { beforeEach, describe, expect, it, vi } from "vitest";

// La formule choisie sur le site : elle suit le dossier, et la formule mensuelle ne déclenche pas
// un contrat automatique qui tairait la mise en service. Ni base, ni envoi réel.
const db = vi.hoisted(() => ({
  prospect: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  pharmacy: { findFirst: vi.fn() },
  plan: { findFirst: vi.fn(), findUnique: vi.fn() },
  emailTemplate: { findUnique: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
}));
const messaging = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
const tokens = vi.hoisted(() => ({ signPayload: vi.fn(() => "jeton-signe"), verifyPayload: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => ({}) }));
vi.mock("@/server/db/advisory-lock", () => ({ withAdvisoryLock: (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/server/security/tokens", () => tokens);
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => messaging, getStorageProvider: vi.fn() }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.invalid${path}` }));
vi.mock("@/server/services/email-context", () => ({ platformEmailContext: async () => ({ baseUrl: "https://exemple.invalid", company: { legalName: "PharmaBoost SAS", address: null, siren: null, contactEmail: "contact@pharmaboost.app" } }) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: vi.fn() }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/services/sales/contracts", () => ({ startContracting: vi.fn() }));
vi.mock("@/server/services/referral", () => ({ resolveReferralCode: async () => null }));

const events = await import("@/server/services/sales/events");
const subscriptions = await import("@/server/services/subscription-requests");

const SENT = { status: "SENT" as const, provider: "resend", detail: "Message transmis.", messageId: "msg-1" };
const request = { pharmacyName: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", siret: "73282932000074", addressLine1: "1 quai du Port", postalCode: "13002", city: "Marseille", ownerFirstName: "Marc", ownerLastName: "Delaunay", ownerTitle: "Pharmacien titulaire", ownerEmail: "marc@port.fr" };

beforeEach(() => {
  vi.clearAllMocks();
  messaging.sendEmail.mockResolvedValue(SENT);
  db.plan.findFirst.mockResolvedValue(null); // aucune offre publiée : l'offre officielle s'affiche
  db.pharmacy.findFirst.mockResolvedValue(null);
  db.prospect.findMany.mockResolvedValue([]);
  db.prospect.create.mockResolvedValue({ id: "p-new" });
  db.companyProfile.findUnique.mockResolvedValue(null);
  db.emailTemplate.findUnique.mockResolvedValue(null);
});

const createdData = () => (db.prospect.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

describe("souscription depuis le site : la formule choisie", () => {
  it("formule ANNUELLE : le dossier la garde, fige 99 € HT par mois (1 188 € / 12) et la confirmation d'adresse part", async () => {
    const result = await subscriptions.requestSubscription({ ...request, formula: "ANNUAL" });

    expect(result).toMatchObject({ ok: true, outcome: { status: "CONFIRMATION_SENT", prospectId: "p-new" } });
    expect(createdData()).toMatchObject({ subscriptionFormula: "ANNUAL", monthlyPriceCents: 9_900 });
    const summary = vi.mocked(events.recordProspectEvent).mock.calls.map((call) => (call[0] as { summary: string }).summary).join(" ");
    expect(summary).toContain("formule annuelle");
    expect(summary).toContain("1\u00a0188\u00a0€ HT / an");
  });

  it("formule MENSUELLE : prix figé 99 €, mais le contrat ne part PAS tout seul (la mise en service de 390 € n'est pas au contrat automatique)", async () => {
    const result = await subscriptions.requestSubscription({ ...request, formula: "MONTHLY" });

    expect(result).toMatchObject({ ok: true, outcome: { status: "RECEIVED", prospectId: "p-new" } });
    expect(createdData()).toMatchObject({ subscriptionFormula: "MONTHLY", monthlyPriceCents: 9_900 });
    expect(tokens.signPayload).not.toHaveBeenCalled(); // aucun lien de confirmation, donc aucun contrat
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "DOSSIER_BLOCKED", body: expect.stringContaining("390\u00a0€ HT") }));
  });

  it("le prix du dossier est celui que le visiteur a VU, pas celui d'une offre plus ancienne de la console", async () => {
    // Offre par défaut INCOMPLÈTE (ancien tarif, pas de prix annuel) : le site affichait l'offre officielle, le dossier fige 99 €.
    db.plan.findFirst.mockResolvedValue({ id: "plan-old", name: "Ancienne offre", monthlyPriceCents: 12_900, annualPriceCents: null, setupFeeCents: null, annualSetupFeeCents: null });
    await subscriptions.requestSubscription({ ...request, formula: "ANNUAL" });
    expect(createdData().monthlyPriceCents).toBe(9_900);
  });

  it("sans formule (ancien parcours) : le comportement d'avant, le tarif de l'offre retenue", async () => {
    db.plan.findFirst.mockResolvedValue({ id: "plan-old", name: "Ancienne offre", monthlyPriceCents: 12_900, annualPriceCents: null, setupFeeCents: null, annualSetupFeeCents: null, trialDays: 0, isActive: true });
    await subscriptions.requestSubscription({ ...request });
    expect(createdData()).toMatchObject({ subscriptionFormula: null, monthlyPriceCents: 12_900 });
  });
});
