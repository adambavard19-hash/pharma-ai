import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le passage mensuel de l'affiliation sur des données simulées : qui est commissionné (affilié actif, pharmacie
 * apportée et abonnée à la fin du mois écoulé), combien (le taux du palier de l'affilié, 10 à 20 % de l'abonnement
 * facturé, selon ses pharmacies actives à la fin du mois), une seule fois par pharmacie
 * et par mois (index unique + `skipDuplicates`), et jamais une ancienne commission touchée. L'essai sur la vraie base
 * locale (`.live/affiliation-essai.mts`) rejoue le tout, passages simultanés compris.
 */

const db = vi.hoisted(() => ({
  salesRep: { findMany: vi.fn() },
  salesDirector: { findMany: vi.fn() },
  directorBonus: { createMany: vi.fn() },
  prospect: { findMany: vi.fn() },
  commission: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ recordProspectEvent: vi.fn(), notifySalesRep: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("../events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("../notifications", () => ({ notifySalesRep: mocks.notifySalesRep }));

const service = await import("../affiliate-commissions");

/** Le 1er novembre 2026, 8 h 15 à Paris : le passage commissionne octobre. */
const NOV_1 = new Date("2026-11-01T07:15:00Z");

const subscription = (overrides: Record<string, unknown> = {}) => ({ status: "ACTIVE", createdAt: new Date("2026-06-01T10:00:00Z"), trialEndsAt: null, endedAt: null, canceledAt: null, contractPriceCents: 12_600, referralDiscountCents: null, plan: { monthlyPriceCents: 14_900 }, ...overrides });
const brought = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Pharmacie ${id}`,
  salesRepId: "rep_a",
  activatedAt: new Date("2026-07-01T10:00:00Z"),
  activationSalesRepId: "rep_a",
  pharmacy: { isDemo: false, organization: { subscription: subscription() } },
  commissions: [],
  ...overrides,
});

/** La base simulée : l'index unique (dossier, mois) refuse une seconde ligne, comme PostgreSQL. */
let stored: { prospectId: string; periodMonth: string }[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  stored = [];
  db.salesRep.findMany.mockResolvedValue([{ id: "rep_a" }]);
  db.commission.findMany.mockImplementation(async ({ where }: { where: { periodMonth: string } }) => stored.filter((row) => row.periodMonth === where.periodMonth).map((row) => ({ prospectId: row.prospectId })));
  db.commission.createMany.mockImplementation(async ({ data, skipDuplicates }: { data: { prospectId: string; periodMonth: string }[]; skipDuplicates: boolean }) => {
    expect(skipDuplicates).toBe(true);
    let count = 0;
    for (const row of data) {
      if (stored.some((existing) => existing.prospectId === row.prospectId && existing.periodMonth === row.periodMonth)) continue;
      stored.push(row);
      count += 1;
    }
    return { count };
  });
  mocks.recordProspectEvent.mockResolvedValue(undefined);
  mocks.notifySalesRep.mockResolvedValue(undefined);
});

describe("la règle", () => {
  it("chaque pharmacie apportée et abonnée : 10 % de son abonnement, au mois écoulé, au statut « Acquise »", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1"), brought("p2", { pharmacy: { isDemo: false, organization: { subscription: subscription({ referralDiscountCents: 2_520 }) } } })]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);

    expect(run).toMatchObject({ month: "2026-10", affiliates: 1, created: 2, alreadyThere: 0, totalCreatedCents: 1_260 + 1_008 });
    // Seuls les affiliés ACTIFS à la règle d'affiliation sont lus.
    expect(db.salesRep.findMany).toHaveBeenCalledWith({ where: { commissionType: "AFFILIATE", isActive: true }, select: { id: true } });
    const first = db.commission.createMany.mock.calls[0][0].data[0];
    expect(first).toMatchObject({ prospectId: "p1", salesRepId: "rep_a", type: "AFFILIATE", periodMonth: "2026-10", amountCents: 1_260, ratePercent: 10, status: "EARNED", earnedAt: NOV_1 });
    expect(run.ratePercentByRep).toEqual({ rep_a: 10 });
    // Échéance : fin novembre, le mois qui suit le mois commissionné.
    expect(first.dueAt.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "p1", type: "COMMISSION_CREATED", metadata: expect.objectContaining({ periodMonth: "2026-10", amountCents: 1_260 }) }));
    // Une notification par affilié, avec le total du mois.
    expect(mocks.notifySalesRep).toHaveBeenCalledTimes(1);
    expect(mocks.notifySalesRep.mock.calls[0][0]).toMatchObject({ salesRepId: "rep_a", type: "AFFILIATE_MONTH", linkUrl: "/extranet/commissions" });
    expect(mocks.notifySalesRep.mock.calls[0][0].title.replace(/\s/g, " ")).toContain("octobre 2026 : 22,68 €");
  });

  it("idempotent : un second passage (le lendemain, ou rejoué) ne crée rien et ne notifie personne", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1")]);
    await service.createMonthlyAffiliateCommissions(NOV_1);
    vi.clearAllMocks();
    const again = await service.createMonthlyAffiliateCommissions(new Date("2026-11-02T07:15:00Z"));
    expect(again).toMatchObject({ month: "2026-10", created: 0, alreadyThere: 1 });
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
    expect(stored).toHaveLength(1);
  });

  it("deux passages simultanés : l'index unique laisse passer une seule ligne, le perdant ne trace ni ne notifie rien", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1")]);
    // Les deux passages lisent « rien encore pour octobre » avant que l'un n'écrive.
    db.commission.findMany.mockResolvedValue([]);
    const [a, b] = await Promise.all([service.createMonthlyAffiliateCommissions(NOV_1), service.createMonthlyAffiliateCommissions(NOV_1)]);
    expect(a.created + b.created).toBe(1);
    expect(a.alreadyThere + b.alreadyThere).toBe(1);
    expect(stored).toEqual([expect.objectContaining({ prospectId: "p1", periodMonth: "2026-10" })]);
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifySalesRep).toHaveBeenCalledTimes(1);
  });

  it("une seule par pharmacie et par mois, mais chaque mois la sienne", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1")]);
    await service.createMonthlyAffiliateCommissions(NOV_1);
    await service.createMonthlyAffiliateCommissions(new Date("2026-12-01T07:15:00Z"));
    expect(stored.map((row) => row.periodMonth)).toEqual(["2026-10", "2026-11"]);
  });

  it("aucune rétroactivité : seul le mois écoulé est commissionné, jamais les précédents", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1", { activatedAt: new Date("2026-01-05T10:00:00Z") })]);
    await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(stored.map((row) => row.periodMonth)).toEqual(["2026-10"]);
  });
});

describe("les paliers", () => {
  const many = (count: number, prefix = "p", overrides: Record<string, unknown> = {}) => Array.from({ length: count }, (_, index) => brought(`${prefix}${String(index).padStart(3, "0")}`, overrides));

  it("9 pharmacies actives : 10 % ; la 10e fait passer TOUTES les pharmacies à 12 %", async () => {
    db.prospect.findMany.mockResolvedValue(many(9));
    const nine = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(nine.ratePercentByRep).toEqual({ rep_a: 10 });
    expect(nine.totalCreatedCents).toBe(9 * 1_260);

    stored = [];
    vi.clearAllMocks();
    db.prospect.findMany.mockResolvedValue(many(10));
    const ten = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(ten.ratePercentByRep).toEqual({ rep_a: 12 });
    // 12 % de 126 € = 15,12 €, sur chacune des 10.
    expect(ten.totalCreatedCents).toBe(10 * 1_512);
    for (const call of db.commission.createMany.mock.calls) expect(call[0].data[0]).toMatchObject({ amountCents: 1_512, ratePercent: 12, note: expect.stringContaining("12") });
  });

  it("25 → 15 %, 49 → 15 %, 50 → 20 %, et 20 % reste le plafond (200 pharmacies)", async () => {
    for (const [count, rate] of [[24, 12], [25, 15], [49, 15], [50, 20], [200, 20]] as const) {
      stored = [];
      vi.clearAllMocks();
      db.prospect.findMany.mockResolvedValue(many(count));
      const run = await service.createMonthlyAffiliateCommissions(NOV_1);
      expect(run.ratePercentByRep.rep_a).toBe(rate);
      expect(run.totalCreatedCents).toBe(count * Math.round(12_600 * rate / 100));
    }
  });

  it("le palier compte les pharmacies ACTIVES à la fin du mois : résiliées, en essai ou de démonstration ne comptent pas", async () => {
    const inactive = { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "CANCELED", endedAt: new Date("2026-10-15T10:00:00Z") }) } } };
    db.prospect.findMany.mockResolvedValue([...many(9), ...many(5, "r", inactive), brought("demo", { pharmacy: { isDemo: true, organization: { subscription: subscription() } } })]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run.ratePercentByRep).toEqual({ rep_a: 10 });
    expect(run.created).toBe(9);
  });

  it("chaque affilié a son propre palier", async () => {
    db.salesRep.findMany.mockResolvedValue([{ id: "rep_a" }, { id: "rep_b" }]);
    db.prospect.findMany.mockResolvedValue([...many(10), ...many(2, "b", { salesRepId: "rep_b", activationSalesRepId: "rep_b" })]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run.ratePercentByRep).toEqual({ rep_a: 12, rep_b: 10 });
    expect(run.totalCreatedCents).toBe(10 * 1_512 + 2 * 1_260);
  });

  it("idempotent avec palier : rejoué, le passage retrouve le même taux et ne crée rien", async () => {
    db.prospect.findMany.mockResolvedValue(many(30));
    const first = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(first).toMatchObject({ created: 30, ratePercentByRep: { rep_a: 15 } });
    vi.clearAllMocks();
    const again = await service.createMonthlyAffiliateCommissions(new Date("2026-11-02T07:15:00Z"));
    expect(again).toMatchObject({ created: 0, alreadyThere: 30, ratePercentByRep: { rep_a: 15 } });
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(stored).toHaveLength(30);
  });
});

describe("qui n'est pas commissionné", () => {
  it("pharmacie désabonnée pendant le mois, encore en essai, impayée ou sans abonnement : rien", async () => {
    db.prospect.findMany.mockResolvedValue([
      brought("resiliee", { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "CANCELED", endedAt: new Date("2026-10-15T10:00:00Z") }) } } }),
      brought("essai", { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "TRIALING", trialEndsAt: new Date("2026-11-20T10:00:00Z") }) } } }),
      brought("impayee", { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "PAST_DUE" }) } } }),
      brought("sans", { pharmacy: { isDemo: false, organization: { subscription: null } } }),
    ]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run).toMatchObject({ created: 0, skipped: { notSubscribed: 4, oldRule: 0, demo: 0, otherRep: 0 } });
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("le mois suivant une résiliation : plus de commission", async () => {
    db.prospect.findMany.mockResolvedValue([brought("p1", { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "CANCELED", endedAt: new Date("2026-11-10T10:00:00Z") }) } } })]);
    // Octobre : encore abonnée à la fin du mois.
    expect((await service.createMonthlyAffiliateCommissions(NOV_1)).created).toBe(1);
    // Novembre : résiliée le 10, rien.
    expect((await service.createMonthlyAffiliateCommissions(new Date("2026-12-01T07:15:00Z"))).created).toBe(0);
    expect(stored.map((row) => row.periodMonth)).toEqual(["2026-10"]);
  });

  it("affilié désactivé (ou commercial resté à l'ancienne règle) : ses pharmacies ne sont même pas lues", async () => {
    db.salesRep.findMany.mockResolvedValue([]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run).toMatchObject({ affiliates: 0, created: 0 });
    expect(db.prospect.findMany).not.toHaveBeenCalled();
  });

  it("pharmacie de démonstration : rien", async () => {
    db.prospect.findMany.mockResolvedValue([brought("demo", { pharmacy: { isDemo: true, organization: { subscription: subscription() } } })]);
    expect(await service.createMonthlyAffiliateCommissions(NOV_1)).toMatchObject({ created: 0, skipped: expect.objectContaining({ demo: 1 }) });
  });

  it("pharmacie déjà payée par l'ancienne règle : pas de double rémunération, et l'ancienne commission n'est jamais touchée", async () => {
    db.prospect.findMany.mockResolvedValue([brought("ancienne", { commissions: [{ id: "com_grille" }] })]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run).toMatchObject({ created: 0, skipped: expect.objectContaining({ oldRule: 1 }) });
    // Le service ne modifie ni ne supprime aucune commission : il ne sait qu'en créer d'AFFILIATE neuves.
    expect(db.commission.update).not.toHaveBeenCalled();
    expect(db.commission.updateMany).not.toHaveBeenCalled();
    expect(db.commission.delete).not.toHaveBeenCalled();
    expect(db.commission.deleteMany).not.toHaveBeenCalled();
    // La recherche de l'ancienne règle ignore les annulées et les bonus de palier.
    const select = db.prospect.findMany.mock.calls[0][0].select;
    expect(select.commissions.where).toEqual({ type: { in: ["FIXED", "PERCENT", "RECURRING", "PROGRESSIVE"] }, status: { not: "CANCELLED" } });
  });

  it("activée pour un autre : la pharmacie reste à celui à qui l'activation est créditée, même si un affilié la suit aujourd'hui", async () => {
    db.prospect.findMany.mockResolvedValue([brought("reaffectee", { salesRepId: "rep_a", activationSalesRepId: null })]);
    const run = await service.createMonthlyAffiliateCommissions(NOV_1);
    expect(run).toMatchObject({ created: 0, skipped: expect.objectContaining({ otherRep: 1 }) });
  });

  it("pas encore activée : créditée à l'affilié qui suit le dossier", async () => {
    db.prospect.findMany.mockResolvedValue([brought("neuve", { activatedAt: null, activationSalesRepId: null, salesRepId: "rep_a" })]);
    expect((await service.createMonthlyAffiliateCommissions(NOV_1)).created).toBe(1);
    expect(db.prospect.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: { not: null }, OR: [{ activationSalesRepId: { in: ["rep_a"] } }, { activatedAt: null, salesRepId: { in: ["rep_a"] } }] });
  });
});

describe("l'aperçu de l'extranet", () => {
  it("revenus récurrents actuels = somme des pharmacies abonnées × 10 % ; les autres listées sans montant", async () => {
    db.prospect.findMany.mockResolvedValue([
      brought("p1"),
      brought("p2", { pharmacy: { isDemo: false, organization: { subscription: subscription({ contractPriceCents: 10_000 }) } } }),
      brought("fermee", { pharmacy: { isDemo: false, organization: { subscription: subscription({ status: "CANCELED", endedAt: new Date("2026-10-01T10:00:00Z") }) } } }),
      brought("ancienne", { commissions: [{ id: "c" }] }),
      brought("autre", { activationSalesRepId: "rep_b" }),
    ]);
    const overview = await service.affiliateOverviewFor("rep_a", new Date("2026-10-18T10:00:00Z"));
    expect(overview.recurringCents).toBe(1_260 + 1_000);
    expect(overview.activeCount).toBe(2);
    // Le palier compte aussi la pharmacie payée par l'ancienne règle (3 actives) : 10 %.
    expect(overview).toMatchObject({ tierCount: 3, ratePercent: 10 });
    expect(overview.pharmacies.map((pharmacy) => pharmacy.prospectId)).not.toContain("autre");
    expect(overview.pharmacies.find((pharmacy) => pharmacy.prospectId === "fermee")).toMatchObject({ active: false, monthlyCommissionCents: 0 });
    expect(overview.pharmacies.find((pharmacy) => pharmacy.prospectId === "ancienne")).toMatchObject({ active: true, oldRule: true, monthlyCommissionCents: 0 });
  });

  it("au-delà de 10 pharmacies actives, l'aperçu applique le taux du palier", async () => {
    db.prospect.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, index) => brought(`p${index}`)));
    const overview = await service.affiliateOverviewFor("rep_a", new Date("2026-10-18T10:00:00Z"));
    expect(overview).toMatchObject({ tierCount: 12, ratePercent: 12, activeCount: 12, recurringCents: 12 * 1_512 });
  });
});

describe("les primes uniques (mise en service réglée)", () => {
  const SETUP = 29_000;
  const paidSetup = { setupFeeCents: SETUP, payments: [{ status: "PAID", paidAt: new Date("2026-10-25T10:00:00Z"), amountCents: SETUP + 12_600 }] };
  const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Pharmacie ${id}`,
    salesRepId: "rep_a",
    activatedAt: new Date("2026-10-20T10:00:00Z"),
    activationSalesRepId: "rep_a",
    directorBonus: null,
    pharmacy: { organization: { subscription: paidSetup } },
    commissions: [],
    ...overrides,
  });
  let primes: string[] = [];
  let directorPrimes: string[] = [];

  beforeEach(() => {
    primes = [];
    directorPrimes = [];
    db.salesDirector.findMany.mockResolvedValue([{ id: "dir_1" }]);
    db.commission.createMany.mockImplementation(async ({ data }: { data: { prospectId: string; type: string; periodMonth: string; amountCents: number }[] }) => {
      const row = data[0];
      expect(row).toMatchObject({ type: "AFFILIATE_SIGNUP", periodMonth: "PRIME", amountCents: 10_000, status: "EARNED" });
      if (primes.includes(row.prospectId)) return { count: 0 };
      primes.push(row.prospectId);
      return { count: 1 };
    });
    db.directorBonus.createMany.mockImplementation(async ({ data, skipDuplicates }: { data: { prospectId: string; amountCents: number; salesDirectorId: string }[]; skipDuplicates: boolean }) => {
      expect(skipDuplicates).toBe(true);
      const row = data[0];
      expect(row).toMatchObject({ salesDirectorId: "dir_1", amountCents: 5_000, status: "EARNED" });
      if (directorPrimes.includes(row.prospectId)) return { count: 0 };
      directorPrimes.push(row.prospectId);
      return { count: 1 };
    });
  });

  it("mise en service réglée : 100 € à l'affilié, 50 € au directeur, une seule fois chacune même rejoué ou en parallèle", async () => {
    db.prospect.findMany.mockResolvedValue([candidate("p1")]);
    const [a, b] = await Promise.all([service.createSignupBonuses(NOV_1), service.createSignupBonuses(NOV_1)]);
    expect(a.affiliateBonuses + b.affiliateBonuses).toBe(1);
    expect(a.directorBonuses + b.directorBonuses).toBe(1);
    expect(primes).toEqual(["p1"]);
    expect(directorPrimes).toEqual(["p1"]);
    expect(mocks.notifySalesRep).toHaveBeenCalledTimes(1);
  });

  it("mise en service pas encore réglée (ou offerte) : aucune prime", async () => {
    db.prospect.findMany.mockResolvedValue([
      candidate("impayee", { pharmacy: { organization: { subscription: { setupFeeCents: SETUP, payments: [{ status: "OPEN", paidAt: null, amountCents: 41_600 }] } } } }),
      candidate("offerte", { pharmacy: { organization: { subscription: { setupFeeCents: 0, payments: paidSetup.payments } } } }),
    ]);
    const run = await service.createSignupBonuses(NOV_1);
    expect(run).toMatchObject({ affiliateBonuses: 0, directorBonuses: 0 });
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(db.directorBonus.createMany).not.toHaveBeenCalled();
  });

  it("pharmacie d'un commercial à l'ancienne règle : pas de prime d'affilié, mais la prime du directeur (signée par l'équipe)", async () => {
    db.salesRep.findMany.mockResolvedValue([]);
    db.prospect.findMany.mockResolvedValue([candidate("p1", { salesRepId: "rep_ancien", activationSalesRepId: "rep_ancien" })]);
    const run = await service.createSignupBonuses(NOV_1);
    expect(run).toMatchObject({ affiliateBonuses: 0, directorBonuses: 1 });
  });

  it("déjà payée par l'ancienne règle : pas de prime d'affilié", async () => {
    db.prospect.findMany.mockResolvedValue([candidate("p1", { commissions: [{ type: "PROGRESSIVE" }] })]);
    expect(await service.createSignupBonuses(NOV_1)).toMatchObject({ affiliateBonuses: 0, directorBonuses: 1 });
  });

  it("aucun ou plusieurs directeurs actifs : la prime du directeur attend (rien de créé au hasard)", async () => {
    db.salesDirector.findMany.mockResolvedValue([{ id: "dir_1" }, { id: "dir_2" }]);
    db.prospect.findMany.mockResolvedValue([candidate("p1")]);
    const run = await service.createSignupBonuses(NOV_1);
    expect(run).toMatchObject({ affiliateBonuses: 1, directorBonuses: 0, directorUnassigned: 1 });
    expect(db.directorBonus.createMany).not.toHaveBeenCalled();
  });

  it("déjà les deux primes : rien n'est réécrit ; et la recherche exclut les mises en service réglées avant le programme", async () => {
    db.prospect.findMany.mockResolvedValue([candidate("p1", { directorBonus: { id: "b" }, commissions: [{ type: "AFFILIATE_SIGNUP" }] })]);
    expect(await service.createSignupBonuses(NOV_1)).toMatchObject({ affiliateBonuses: 0, directorBonuses: 0 });
    const where = db.prospect.findMany.mock.calls[0][0].where;
    expect(where.pharmacy.organization.subscription.payments.some.paidAt.gte.toISOString()).toBe("2026-10-17T22:00:00.000Z");
  });
});
