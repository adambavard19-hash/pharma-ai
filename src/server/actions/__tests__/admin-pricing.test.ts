import { beforeEach, describe, expect, it, vi } from "vitest";

// Ni base, ni Stripe : seul le catalogue (Plan) est lisible. Toucher à un abonnement ferait échouer le test.
const db = vi.hoisted(() => ({
  plan: { findUnique: vi.fn(), findFirst: vi.fn() },
  platformSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const session = vi.hoisted(() => ({ requirePlatformSession: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const billing = vi.hoisted(() => ({ savePlanAction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/platform-session", () => session);
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/server/actions/platform-billing", () => billing);

const { publishOfficialOfferAction, saveStandardCommissionAction } = await import("../admin-pricing");

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePlatformSession.mockResolvedValue({ admin: { id: "admin-1" } });
  db.plan.findUnique.mockResolvedValue(null);
  db.plan.findFirst.mockResolvedValue({ id: "plan-old", name: "Offre à 69 €" });
  db.platformSetting.findUnique.mockResolvedValue(null);
  billing.savePlanAction.mockResolvedValue({ ok: true, data: { planId: "plan-official", stripe: "ok" }, message: "ok" });
});

describe("publier l'offre officielle", () => {
  it("l'enregistre en offre par défaut : un seul abonnement, 126 € HT par mois, mise en service 290 € HT, aucun essai, aucun prix annuel", async () => {
    const result = await publishOfficialOfferAction();

    expect(result.ok).toBe(true);
    expect(billing.savePlanAction).toHaveBeenCalledWith(expect.objectContaining({ code: "PHARMABOOST_OFFICINE", monthlyPriceCents: 12_600, setupFeeCents: 29_000, annualPriceCents: null, annualSetupFeeCents: null, trialDays: 0, isDefault: true, isActive: true }));
  });

  it("trace l'avant et l'après, l'offre remplacée, et le rappel qu'aucun abonnement n'est touché", async () => {
    await publishOfficialOfferAction();
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.public_offer_published", platformAdminId: "admin-1", metadata: expect.objectContaining({ previousDefault: "Offre à 69 €", note: expect.stringContaining("aucun abonnement existant") }) }));
  });

  it("ne lit ni n'écrit aucun abonnement : le prix contractuel d'une officine cliente est intouchable", async () => {
    // `prisma.subscription` n'existe pas dans ce décor : l'action y accéderait et échouerait.
    await expect(publishOfficialOfferAction()).resolves.toMatchObject({ ok: true });
    expect(Object.keys(db)).not.toContain("subscription");
  });

  it("garde le contenu (description, fonctionnalités) d'une offre officielle déjà créée", async () => {
    db.plan.findUnique.mockResolvedValue({ id: "plan-official", name: "PharmaBoost Officine", description: "Texte de la console", features: ["Poste inclus", "Pilotage"], options: [], maxUsers: null, discountPercent: null, discountLabel: null, foundingPriceCents: null, sortOrder: 2, monthlyPriceCents: 6_900, setupFeeCents: null, trialDays: 30, isDefault: false, isActive: true });
    await publishOfficialOfferAction();
    expect(billing.savePlanAction).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan-official", description: "Texte de la console", features: ["Poste inclus", "Pilotage"], sortOrder: 2 }));
  });

  it("exige la session de la console avant tout", async () => {
    session.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(publishOfficialOfferAction()).rejects.toThrow();
    expect(billing.savePlanAction).not.toHaveBeenCalled();
  });
});

describe("commission standard d'un commercial", () => {
  it("enregistre 250 € (virgule française acceptée) en centimes, et trace avant/après", async () => {
    const result = await saveStandardCommissionAction({ amountEuros: "250" });
    expect(result).toMatchObject({ ok: true, data: { amountCents: 25_000 } });
    expect(db.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ key: "sales.standard_commission", value: { amountCents: 25_000 } }) }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.standard_commission_updated", metadata: { before: { amountCents: 25_000 }, after: { amountCents: 25_000 } } }));

    expect(await saveStandardCommissionAction({ amountEuros: "312,50" })).toMatchObject({ ok: true, data: { amountCents: 31_250 } });
  });

  it("refuse un montant absurde, négatif, nul ou illisible", async () => {
    for (const bad of ["0", "-5", "abc", "5001", ""]) {
      expect((await saveStandardCommissionAction({ amountEuros: bad })).ok).toBe(false);
    }
    expect(db.platformSetting.upsert).not.toHaveBeenCalled();
  });
});
