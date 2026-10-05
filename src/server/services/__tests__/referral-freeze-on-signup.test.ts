import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le montant qu'un filleul apporte à son parrain est figé à son inscription,
 * sur ses deux chemins de création : la création directe depuis la console
 * (`createClientPharmacy`) et l'espace né d'un dossier signé
 * (`createPharmacyFromProspect`). L'offre de parrainage en cours est lue pour
 * de vrai (table simulée) ; rien n'est écrit en base, aucun e-mail ne part.
 *
 * Le parrain vient du code de parrainage du dossier ; à défaut, du CONFRÈRE PROPOSÉ
 * à l'inscription : le dossier rapproché d'un confrère a pour parrain l'officine du
 * dossier qui l'a proposé. Un code déjà renseigné l'emporte toujours.
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
    pharmacy: { findFirst: vi.fn(async () => null), updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 })) },
    referralOffer: { findMany: vi.fn(async () => offers.rows) },
    // Le confrère proposé à l'inscription : aucun par défaut.
    referralLead: { findFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null), findUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null), updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 })) },
  };
  return { created, tx, prisma, offers };
});

const mocks = vi.hoisted(() => ({
  resolveReferralCode: vi.fn(),
}));
const events = vi.hoisted(() => ({ recordProspectEvent: vi.fn() }));

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
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: events.recordProspectEvent }));
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
  db.prisma.referralLead.findFirst.mockResolvedValue(null);
  db.prisma.referralLead.findUnique.mockResolvedValue(null);
  db.prisma.referralLead.updateMany.mockResolvedValue({ count: 1 });
  db.prisma.pharmacy.updateMany.mockResolvedValue({ count: 1 });
});

/** Ce que la base rend quand le dossier est celui d'un confrère proposé par un dossier dont l'officine existe (ou pas encore). */
const leadFrom = (pharmacy: { id: string; name: string } | null) => ({ referrerProspect: { id: "pr_parrain", pharmacy } });
const written = () => events.recordProspectEvent.mock.calls.map((c) => c[0] as { prospectId: string; summary: string });

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

describe("espace pharmacie né d'un dossier signé : le parrain vient du confrère proposé", () => {
  const noCode = () => {
    db.prisma.prospect.findUnique.mockResolvedValue({ ...prospect(), referralCode: null });
    mocks.resolveReferralCode.mockResolvedValue(null);
  };

  it("sans code, le dossier d'un confrère proposé a pour parrain l'officine du dossier qui l'a proposé ; le montant de l'offre en cours est figé", async () => {
    noCode();
    db.offers.rows = [offer(3000)];
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_parrain", name: "Pharmacie Marraine" }));
    const result = await createPharmacyFromProspect("pr_1", ADMIN);
    expect(result.ok).toBe(true);
    expect(db.prisma.referralLead.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { referredProspectId: "pr_1" } }));
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: 3000 });
  });

  it("hors offre, rien n'est figé : c'est la règle des 20 %", async () => {
    noCode();
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_parrain", name: "Pharmacie Marraine" }));
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain", referralAmountCents: null });
  });

  it("la trace est écrite sur les DEUX dossiers : le filleul et le parrain", async () => {
    noCode();
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_parrain", name: "Pharmacie Marraine" }));
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(written().find((e) => e.prospectId === "pr_1" && e.summary.startsWith("Parrainage rattaché"))?.summary).toContain("« Pharmacie Marraine »");
    expect(written().find((e) => e.prospectId === "pr_parrain")?.summary).toContain("20 % de moins");
  });

  it("un code de parrainage déjà renseigné l'emporte : le confrère proposé n'est même pas consulté, rien n'est changé", async () => {
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_autre", name: "Pharmacie Autre" }));
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain" });
    expect(db.prisma.referralLead.findUnique).not.toHaveBeenCalled();
    expect(written().some((e) => e.summary.startsWith("Parrainage rattaché"))).toBe(false);
  });

  it("si le dossier qui l'a proposé n'a pas encore d'officine, il n'y a pas encore de parrain", async () => {
    noCode();
    db.offers.rows = [offer(3000)];
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom(null));
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: null, referralAmountCents: null });
    expect(db.prisma.referralOffer.findMany).not.toHaveBeenCalled();
  });

  it("un dossier qui n'est le confrère de personne : pas de parrain", async () => {
    noCode();
    await createPharmacyFromProspect("pr_1", ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: null, referralAmountCents: null });
  });
});

describe("création directe d'une officine : le parrain vient du confrère proposé", () => {
  const proposedLead = { id: "lead_1", referrerProspectId: "pr_parrain", referrerProspect: { name: "Pharmacie Marraine" } };

  it("l'adresse du titulaire est celle d'un confrère proposé : le dossier ouvert lui est rattaché, et l'officine qui l'a proposé devient le parrain", async () => {
    db.prisma.referralLead.findFirst.mockResolvedValue(proposedLead);
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_parrain", name: "Pharmacie Marraine" }));
    const result = await createClientPharmacy(input(), ADMIN);
    expect(result.ok).toBe(true);
    // Rapprochement par l'adresse de connexion du titulaire, casse ignorée.
    expect(db.prisma.referralLead.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ email: { equals: "camille@marche.fr", mode: "insensitive" } }) }));
    expect(db.prisma.referralLead.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { referredProspectId: "pr_new", status: "LINKED" } }));
    // Le parrain est posé APRÈS la création, uniquement si l'officine n'en a pas.
    expect(db.prisma.pharmacy.updateMany).toHaveBeenCalledWith({ where: { id: "ph_new", referredById: null }, data: { referredById: "ph_parrain", referralAmountCents: null } });
    expect(written().find((e) => e.prospectId === "pr_new" && e.summary.startsWith("Parrainage rattaché"))).toBeTruthy();
  });

  it("le montant de l'offre en cours est figé, comme pour un code saisi", async () => {
    db.offers.rows = [offer(2500)];
    db.prisma.referralLead.findFirst.mockResolvedValue(proposedLead);
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_parrain", name: "Pharmacie Marraine" }));
    await createClientPharmacy(input(), ADMIN);
    expect(db.prisma.pharmacy.updateMany).toHaveBeenCalledWith({ where: { id: "ph_new", referredById: null }, data: { referredById: "ph_parrain", referralAmountCents: 2500 } });
  });

  it("un code de parrainage saisi l'emporte : l'officine garde son parrain, la base refuse l'écrasement et aucune trace de rattachement n'est écrite", async () => {
    db.prisma.referralLead.findFirst.mockResolvedValue(proposedLead);
    db.prisma.referralLead.findUnique.mockResolvedValue(leadFrom({ id: "ph_autre", name: "Pharmacie Autre" }));
    db.prisma.pharmacy.updateMany.mockResolvedValue({ count: 0 });
    await createClientPharmacy(input({ referredById: "ph_parrain" }), ADMIN);
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: "ph_parrain" });
    expect(written().some((e) => e.summary.startsWith("Parrainage rattaché"))).toBe(false);
  });

  it("une adresse inconnue des confrères proposés : aucun parrain, l'officine est créée normalement", async () => {
    const result = await createClientPharmacy(input(), ADMIN);
    expect(result.ok).toBe(true);
    expect(db.prisma.pharmacy.updateMany).not.toHaveBeenCalled();
    expect(db.created.pharmacy[0]).toMatchObject({ referredById: null });
  });
});
