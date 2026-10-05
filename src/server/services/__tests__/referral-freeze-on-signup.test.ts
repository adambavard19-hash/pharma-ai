import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le montant qu'un filleul apporte à son parrain est figé à son inscription,
 * sur ses deux chemins de création : la création directe depuis la console
 * (`createClientPharmacy`) et l'espace né d'un dossier signé
 * (`createPharmacyFromProspect`). L'offre de parrainage en cours est lue pour
 * de vrai (table simulée) ; rien n'est écrit en base, aucun e-mail ne part.
 */

const db = vi.hoisted(() => {
  const created: { pharmacy: Record<string, unknown>[] } = { pharmacy: [] };
  const tx = {
    organization: { create: vi.fn(async () => ({ id: "org_new" })) },
    pharmacy: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.pharmacy.push(data);
        return { id: "ph_new", name: data.name };
      }),
    },
    user: { create: vi.fn(async () => ({ id: "usr_new" })) },
    membership: { create: vi.fn(async () => ({})) },
    stockConnection: { create: vi.fn(async () => ({})) },
    pharmacyPostCountChange: { create: vi.fn(async () => ({})) },
    prospect: { update: vi.fn(async () => ({})) },
  };
  const offers = { rows: [] as { id: string; label: string; amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null }[] };
  const prisma = {
    $transaction: vi.fn(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
    user: { findFirst: vi.fn(async () => null) },
    prospect: { findFirst: vi.fn(async () => null), findUnique: vi.fn() },
    pharmacy: { findFirst: vi.fn(async () => null) },
    referralOffer: { findMany: vi.fn(async () => offers.rows) },
  };
  return { created, tx, prisma, offers };
});

const mocks = vi.hoisted(() => ({
  resolveReferralCode: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/security/password", () => ({ hashPassword: vi.fn(async () => "hash") }));
vi.mock("@/server/security/tokens", () => ({ generateToken: vi.fn(() => "jeton") }));
vi.mock("@/server/services/slugs", () => ({ uniqueSlug: vi.fn(async (name: string) => name.toLowerCase().replace(/\W+/g, "-")) }));
vi.mock("@/server/services/stock-sync", () => ({ isLgoId: vi.fn(() => false) }));
vi.mock("@/server/services/user-password", () => ({ sendUserPasswordLink: vi.fn(async () => ({ status: "SENT", detail: "Remis.", url: "" })) }));
vi.mock("@/server/services/email-dispatch", () => ({ lastDispatchFor: vi.fn() }));
vi.mock("@/server/services/sales/pharmacy-dossier", () => ({ ensureDossierForPharmacy: vi.fn(async () => ({ ok: true, prospectId: "pr_new" })) }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: vi.fn(), notifySalesRep: vi.fn() }));
vi.mock("@/server/services/referral", () => ({ resolveReferralCode: mocks.resolveReferralCode }));

const { createClientPharmacy } = await import("../pharmacy-admin");
const { createPharmacyFromProspect } = await import("../sales/client-pharmacies");

const ADMIN = { type: "ADMIN" as const, id: "adm_1", label: "Administrateur" };
const input = (overrides: Record<string, unknown> = {}) => ({ name: "Pharmacie du Marché", postCount: 2, ownerFirstName: "Camille", ownerLastName: "Martin", ownerEmail: "camille@marche.fr", ...overrides });
const prospect = () => ({
  id: "pr_1",
  name: "Pharmacie du Marché",
  pharmacyId: null,
  blockedAt: null,
  email: "camille@marche.fr",
  contactEmail: null,
  ownerName: "Camille Martin",
  phone: null,
  addressLine1: null,
  postalCode: null,
  city: null,
  finessNumber: null,
  siret: null,
  postCount: 2,
  lgo: null,
  referralCode: "PB-ABC234",
  contracts: [{ status: "FINALIZED", version: 1 }],
  salesRep: null,
});
const offer = (amountCents: number, overrides: Partial<(typeof db.offers.rows)[number]> = {}) => ({ id: "ro_1", label: "Offre", amountCents, startsAt: new Date("2020-01-01T00:00:00Z"), endsAt: null, canceledAt: null, ...overrides });

beforeEach(() => {
  db.created.pharmacy = [];
  db.offers.rows = [];
  vi.clearAllMocks();
  db.prisma.prospect.findUnique.mockResolvedValue(prospect());
  mocks.resolveReferralCode.mockResolvedValue({ id: "ph_parrain", name: "Pharmacie Marraine" });
});

describe("création directe d'une officine par la console", () => {
  it("un filleul inscrit pendant une offre en porte le montant, figé sur sa fiche", async () => {
    db.offers.rows = [offer(2500)];
    const result = await createClientPharmacy(input({ referredById: "ph_parrain" }), ADMIN);
    expect(result.ok).toBe(true);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: 2500 });
  });

  it("sans offre en cours, rien n'est figé : le montant standard s'applique (`null`)", async () => {
    await createClientPharmacy(input({ referredById: "ph_parrain" }), ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: null });
  });

  it("une offre échue ou annulée n'est pas figée", async () => {
    db.offers.rows = [offer(2500, { endsAt: new Date("2020-06-01T00:00:00Z") }), offer(3000, { canceledAt: new Date("2026-01-01T00:00:00Z") })];
    await createClientPharmacy(input({ referredById: "ph_parrain" }), ADMIN);
    expect(db.created.pharmacy[0].referralAmountCents).toBeNull();
  });

  it("une officine qui n'est le filleul de personne ne porte aucun montant, offre ou non, et l'offre n'est même pas lue", async () => {
    db.offers.rows = [offer(2500)];
    await createClientPharmacy(input(), ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: null, referralAmountCents: null });
    expect(db.prisma.referralOffer.findMany).not.toHaveBeenCalled();
  });
});

describe("espace pharmacie né d'un dossier signé", () => {
  it("un filleul inscrit pendant une offre en porte le montant, figé sur sa fiche", async () => {
    db.offers.rows = [offer(4000)];
    const result = await createPharmacyFromProspect("pr_1", ADMIN);
    expect(result.ok).toBe(true);
    expect(mocks.resolveReferralCode).toHaveBeenCalledWith("PB-ABC234");
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: 4000 });
  });

  it("sans offre en cours, rien n'est figé", async () => {
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: null });
  });

  it("un dossier sans code de parrainage valide : pas de parrain, pas de montant, l'offre n'est pas lue", async () => {
    db.offers.rows = [offer(4000)];
    mocks.resolveReferralCode.mockResolvedValue(null);
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: null, referralAmountCents: null });
    expect(db.prisma.referralOffer.findMany).not.toHaveBeenCalled();
  });
});
