import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le recalcul de la grille progressive sur les données d'un commercial :
 * verrou, activations créditées (posées une fois sur le dossier), premier
 * paiement, écritures conditionnées, bonus créé une seule fois, date de
 * passage à la grille, commercial sorti de la grille, traces et notifications
 * seulement pour ce qui a réellement été écrit. La base est simulée ; l'essai
 * `npm run essai:commissions` rejoue tout sur la vraie base, recalculs
 * simultanés et réaffectations compris.
 */

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  prospect: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  commission: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  billingPayment: { groupBy: vi.fn() },
  salesRep: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ recordProspectEvent: vi.fn(), notifySalesRep: vi.fn(), notifyAdmins: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("../events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("../notifications", () => ({ notifySalesRep: mocks.notifySalesRep, notifyAdmins: mocks.notifyAdmins }));

const service = await import("../progressive-commissions");

const day = (n: number) => new Date(Date.UTC(2026, 0, n, 9));
const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${String(index + 1).padStart(2, "0")}`);
/** Une activation créditée au commercial : le dossier, sa date de première activation, son officine. */
const activated = (id: string, at: Date) => ({ id, name: `Pharmacie ${id}`, activatedAt: at, pharmacy: { organizationId: `org_${id}` } });
const series = (list: string[]) => list.map((id, index) => activated(id, day(index + 1)));

type Facts = { activatedAt?: Date | null; activationSalesRepId?: string | null };
/** Une commission du commercial, avec ce que le recalcul lit de son dossier. */
const commission = (prospectId: string, overrides: Record<string, unknown> = {}, facts: Facts = {}) => ({
  id: `c_${prospectId}`,
  prospectId,
  type: "PROGRESSIVE",
  status: "EARNED",
  amountCents: 1,
  invoiceId: null,
  bonusTier: null,
  ...overrides,
  prospect: { name: `Pharmacie ${prospectId}`, activatedAt: facts.activatedAt ?? null, activationSalesRepId: facts.activationSalesRepId ?? null, pharmacy: { organizationId: `org_${prospectId}` } },
});
const bonus = (tier: number, prospectId: string, status = "FORECAST") => commission(prospectId, { id: `bonus_${tier}`, type: "BONUS", bonusTier: tier, status, amountCents: { 10: 20_000, 25: 35_000, 50: 50_000, 100: 75_000 }[tier] });

/** Le commercial (règle, date de passage à la grille), ses activations créditées, ses commissions, les organisations qui ont payé. */
function given(state: { type?: string; since?: Date | null; activations: ReturnType<typeof activated>[]; commissions?: object[]; paidOrgs?: string[] }) {
  db.$queryRaw.mockResolvedValue(state.type === "NONE" ? [] : [{ commissionType: state.type ?? "PROGRESSIVE", progressiveSince: state.since === undefined ? day(0) : state.since }]);
  db.prospect.findMany.mockResolvedValue(state.activations);
  db.commission.findMany.mockResolvedValue(state.commissions ?? []);
  db.billingPayment.groupBy.mockResolvedValue((state.paidOrgs ?? []).map((organizationId) => ({ organizationId, _count: { _all: 1 } })));
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.commission.updateMany.mockResolvedValue({ count: 1 });
  db.commission.createMany.mockResolvedValue({ count: 1 });
  db.commission.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { salesRepId_bonusTier: { bonusTier: number } } }) => ({ id: `bonus_${where.salesRepId_bonusTier.bonusTier}` }));
});

describe("verrou et périmètre", () => {
  it("tout se passe dans une transaction qui verrouille D'ABORD la ligne du commercial (FOR UPDATE) ; ne lit que SES activations et SES commissions", async () => {
    given({ activations: [] });
    await service.syncProgressiveCommissions("rep_1");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = db.$queryRaw.mock.calls[0];
    expect((strings as string[]).join("?")).toMatch(/"progressiveSince" FROM "sales_reps" WHERE "id" = \? FOR UPDATE/);
    expect(values).toEqual(["rep_1"]);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.prospect.findMany.mock.invocationCallOrder[0]);
    // Les activations CRÉDITÉES au commercial (pas les dossiers qu'il suit aujourd'hui) : une réaffectation ne les déplace pas.
    expect(db.prospect.findMany.mock.calls[0][0].where).toEqual({ activationSalesRepId: "rep_1", activatedAt: { not: null } });
    expect(db.commission.findMany.mock.calls[0][0].where).toEqual({ salesRepId: "rep_1" });
  });

  it("commercial inconnu : rien n'est lu ni écrit", async () => {
    given({ type: "NONE", activations: [] });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(report.skipped).toBe("NOT_FOUND");
    expect(db.prospect.findMany).not.toHaveBeenCalled();
    expect(db.commission.updateMany).not.toHaveBeenCalled();
  });

  it("commercial hors grille (pourcentage, mensuel, montant fixe) : ni montant recalculé, ni bonus créé", async () => {
    for (const type of ["PERCENT", "RECURRING", "FIXED"]) {
      vi.clearAllMocks();
      given({ type, since: null, activations: series(ids(10)), commissions: [commission("p01", { type: "PROGRESSIVE" })] });
      const report = await service.syncProgressiveCommissions("rep_1");
      expect(report.gridActive).toBe(false);
      expect(db.commission.updateMany).not.toHaveBeenCalled();
      expect(db.commission.createMany).not.toHaveBeenCalled();
      expect(db.salesRep.update).not.toHaveBeenCalled();
      expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    }
  });

  it("sorti de la grille : un bonus déjà débloqué devient quand même acquis au premier paiement de sa pharmacie", async () => {
    given({ type: "PERCENT", since: null, activations: series(ids(10)), commissions: [bonus(10, "p10")], paidOrgs: ["org_p10"] });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(report.bonusesEarned).toEqual(["Bronze"]);
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { id: "bonus_10", type: "BONUS", status: "FORECAST", invoiceId: null }, data: { status: "EARNED", dueAt: expect.any(Date), earnedAt: expect.any(Date) } });
  });

  it("à la grille sans date de passage (écriture directe en base) : la grille commence maintenant, les paliers d'avant ne créent rien", async () => {
    given({ since: null, activations: series(ids(10)) });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(db.salesRep.update).toHaveBeenCalledWith({ where: { id: "rep_1" }, data: { progressiveSince: expect.any(Date) } });
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(report.preGridBonuses).toEqual(["Bronze"]);
  });
});

describe("les montants", () => {
  it("le rang donne le montant ; la prévision d'un dossier pas encore activé est la commission de la prochaine", async () => {
    const list = ids(10);
    given({ activations: series(list), commissions: [commission("p10"), commission("p09"), commission("nouveau", { status: "FORECAST" })] });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(report.amountUpdates).toBe(3);
    const writes = db.commission.updateMany.mock.calls.map((call) => call[0]).filter((call) => call.data.amountCents !== undefined);
    expect(writes.map((write) => [write.where.id, write.data.amountCents])).toEqual([["c_p10", 25_000], ["c_p09", 20_000], ["c_nouveau", 25_000]]);
    // Écriture conditionnée : type de grille, montant relu, sans facture, statut encore modifiable.
    expect(writes[0].where).toEqual({ id: "c_p10", type: "PROGRESSIVE", amountCents: 1, invoiceId: null, status: { in: ["FORECAST", "EARNED", "PAYABLE"] } });
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "p10", type: "COMMISSION_UPDATED", summary: expect.stringContaining("10e pharmacie activée") }));
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "nouveau", summary: expect.stringContaining("prévision avant activation") }));
  });

  it("dossier réaffecté AVANT son activation, activé chez un autre commercial : sa commission restée ici garde son montant", async () => {
    given({ activations: series(ids(3)), commissions: [commission("parti", { amountCents: 30_000 }, { activatedAt: day(20), activationSalesRepId: "rep_2" })] });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(report.amountUpdates).toBe(0);
    expect(db.commission.updateMany).not.toHaveBeenCalled();
  });

  it("payée ou facturée : aucune écriture tentée ; une écriture refusée par la base (geste concurrent) ne laisse aucune trace", async () => {
    given({ activations: series(ids(3)), commissions: [commission("p01", { status: "PAID", amountCents: 12_345 }), commission("p02", { invoiceId: "inv_1", amountCents: 11_111 }), commission("p03")] });
    db.commission.updateMany.mockResolvedValue({ count: 0 });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.updateMany).toHaveBeenCalledTimes(1);
    expect(db.commission.updateMany.mock.calls[0][0].where.id).toBe("c_p03");
    expect(report.amountUpdates).toBe(0);
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
  });
});

describe("les bonus", () => {
  const ten = ids(10);

  it("10e activation : bonus Bronze créé une fois, protégé par l'index (commercial, palier), rattaché à la 10e, prévisionnel sans paiement ; notifié une fois", async () => {
    given({ activations: series(ten) });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.createMany).toHaveBeenCalledWith({
      data: [{ prospectId: "p10", salesRepId: "rep_1", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST", dueAt: null, earnedAt: null }],
      skipDuplicates: true,
    });
    expect(db.commission.findUniqueOrThrow).toHaveBeenCalledWith({ where: { salesRepId_bonusTier: { salesRepId: "rep_1", bonusTier: 10 } }, select: { id: true } });
    expect(report.bonusesCreated).toEqual(["Bronze"]);
    expect(mocks.notifySalesRep).toHaveBeenCalledTimes(1);
    expect(mocks.notifySalesRep.mock.calls[0][0]).toMatchObject({ salesRepId: "rep_1", type: "BONUS_UNLOCKED", linkUrl: "/extranet/commissions", severity: "SUCCESS" });
    expect(mocks.notifySalesRep.mock.calls[0][0].title.replace(/[\u00a0\u202f]/g, " ")).toBe("Bonus Bronze débloqué : +200 €");
    expect(mocks.notifySalesRep.mock.calls[0][0].body).toContain("premier paiement de Pharmacie p10");
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "p10", type: "COMMISSION_CREATED", metadata: expect.objectContaining({ bonusTier: 10, status: "FORECAST" }) }));
  });

  it("un autre recalcul l'a créé une fraction de seconde avant (rien d'inséré) : ni trace ni notification en double", async () => {
    given({ activations: series(ten) });
    db.commission.createMany.mockResolvedValue({ count: 0 });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(report.bonusesCreated).toEqual([]);
    expect(db.commission.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
  });

  it("palier atteint AVANT le passage à la grille : pas de bonus d'office ; sur demande explicite (rattrapage), si", async () => {
    given({ since: day(30), activations: series(ten) });
    let report = await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(report.preGridBonuses).toEqual(["Bronze"]);
    report = await service.syncProgressiveCommissions("rep_1", { includePreGridBonuses: true });
    expect(report.bonusesCreated).toEqual(["Bronze"]);
  });

  it("premier paiement : seules les factures PAYÉES, datées et d'un montant non nul comptent ; officine du palier payée → bonus acquis d'emblée", async () => {
    given({ activations: series(ten), paidOrgs: ["org_p10"] });
    await service.syncProgressiveCommissions("rep_1");
    expect(db.billingPayment.groupBy.mock.calls[0][0].where).toEqual({ organizationId: { in: ten.map((id) => `org_${id}`) }, status: "PAID", paidAt: { not: null }, amountCents: { gt: 0 } });
    const data = db.commission.createMany.mock.calls[0][0].data[0];
    expect(data.status).toBe("EARNED");
    expect(data.dueAt).toBeInstanceOf(Date);
    expect(data.earnedAt).toBeInstanceOf(Date);
    expect(mocks.notifySalesRep.mock.calls[0][0].body).toContain("Bonus acquis");
    // 200 € : sous le seuil des montants signalés à la console.
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it("une AUTRE officine a payé, pas celle du palier : le bonus attend", async () => {
    given({ activations: series(ten), paidOrgs: ["org_p03"] });
    await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.createMany.mock.calls[0][0].data[0].status).toBe("FORECAST");
  });

  it("bonus prévisionnel existant + premier paiement : il devient acquis (écriture conditionnée), notifié une fois", async () => {
    given({ activations: series(ten), paidOrgs: ["org_p10"], commissions: [bonus(10, "p10")] });
    const report = await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.createMany).not.toHaveBeenCalled();
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { id: "bonus_10", type: "BONUS", status: "FORECAST", invoiceId: null }, data: { status: "EARNED", dueAt: expect.any(Date), earnedAt: expect.any(Date) } });
    expect(report.bonusesEarned).toEqual(["Bronze"]);
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ type: "BONUS_EARNED" }));
  });

  it("bonus Or acquis (500 €) : la console est prévenue, comme pour une commission importante", async () => {
    given({ activations: series(ids(50)), paidOrgs: ["org_p50"], commissions: [bonus(10, "p10", "PAID"), bonus(25, "p25", "PAID")] });
    db.salesRep.findUnique.mockResolvedValue({ firstName: "Marie", lastName: "Dupont" });
    await service.syncProgressiveCommissions("rep_1");
    expect(db.commission.createMany).toHaveBeenCalledTimes(1);
    expect(db.commission.createMany.mock.calls[0][0].data[0]).toMatchObject({ bonusTier: 50, amountCents: 50_000, status: "EARNED", prospectId: "p50" });
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "COMMISSION_LARGE", body: "Marie Dupont — 50 pharmacies activées." }));
  });
});

describe("la première activation d'un dossier", () => {
  it("posée une fois, créditée au commercial lu, l'écriture conditionnée à ce commercial et à une date encore vide", async () => {
    db.prospect.findUnique.mockResolvedValue({ activatedAt: null, salesRepId: "rep_1" });
    db.prospect.updateMany.mockResolvedValue({ count: 1 });
    const at = day(3);
    expect(await service.stampActivation("pro_1", db as never, at)).toBe(true);
    expect(db.prospect.updateMany).toHaveBeenCalledWith({ where: { id: "pro_1", activatedAt: null, salesRepId: "rep_1" }, data: { activatedAt: at, activationSalesRepId: "rep_1" } });
  });

  it("déjà posée : rien n'est écrit (réactivation, second chemin d'activation)", async () => {
    db.prospect.findUnique.mockResolvedValue({ activatedAt: day(1), salesRepId: "rep_1" });
    expect(await service.stampActivation("pro_1", db as never)).toBe(false);
    expect(db.prospect.updateMany).not.toHaveBeenCalled();
  });

  it("une réaffectation glissée entre la lecture et l'écriture : on relit, et le commercial du moment est crédité", async () => {
    db.prospect.findUnique.mockResolvedValueOnce({ activatedAt: null, salesRepId: "rep_1" }).mockResolvedValueOnce({ activatedAt: null, salesRepId: "rep_2" });
    db.prospect.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await service.stampActivation("pro_1", db as never)).toBe(true);
    expect(db.prospect.updateMany.mock.calls[1][0].data.activationSalesRepId).toBe("rep_2");
  });

  it("« Activé » : le statut et la première activation d'un seul bloc (une transaction)", async () => {
    db.prospect.findUnique.mockResolvedValue({ activatedAt: null, salesRepId: "rep_1" });
    db.prospect.updateMany.mockResolvedValue({ count: 1 });
    await service.markProspectActivated("pro_1", { lastContactAt: day(4) });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.prospect.update).toHaveBeenCalledWith({ where: { id: "pro_1" }, data: { lastContactAt: day(4), status: "ACTIVATED" } });
    expect(db.prospect.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("autour du recalcul", () => {
  it("la version « sans échec » ne fait jamais échouer le geste qui l'appelle", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.$transaction.mockRejectedValue(new Error("base indisponible"));
    await expect(service.syncProgressiveCommissionsSafely("rep_1", "essai")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("(essai)"), "base indisponible");
    await expect(service.syncProgressiveCommissionsSafely(null, "essai")).resolves.toBeUndefined();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("le montant d'une commission de grille pour un contrat : le rang si activée, sinon la prochaine", async () => {
    db.prospect.findMany.mockResolvedValue(series(ids(9)));
    expect(await service.progressiveAmountFor("rep_1", "nouveau")).toBe(25_000);
    expect(await service.progressiveAmountFor("rep_1", "p03")).toBe(20_000);
  });

  it("un paiement retrouve les commerciaux qui suivent les dossiers de l'organisation ET ceux à qui l'activation est créditée", async () => {
    db.prospect.findMany.mockResolvedValue([{ salesRepId: "rep_2", activationSalesRepId: "rep_1" }, { salesRepId: null, activationSalesRepId: null }]);
    expect((await service.salesRepsOfOrganization("org_1")).sort()).toEqual(["rep_1", "rep_2"]);
    expect(db.prospect.findMany.mock.calls[0][0].where).toEqual({ pharmacy: { organizationId: "org_1" } });
  });

  it("le passage quotidien : chaque commercial à la grille ou avec un bonus en attente ; une erreur n'arrête pas les autres", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.salesRep.findMany.mockResolvedValue([{ id: "rep_1" }, { id: "rep_2" }]);
    given({ activations: series(ids(10)) });
    db.$transaction.mockRejectedValueOnce(new Error("verrou trop long")).mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    const totals = await service.syncAllProgressiveCommissions();
    expect(db.salesRep.findMany.mock.calls[0][0].where).toEqual({ OR: [{ commissionType: "PROGRESSIVE" }, { commissions: { some: { type: "BONUS", status: "FORECAST" } } }] });
    expect(totals).toMatchObject({ reps: 2, synced: 1, failed: 1, bonusesCreated: 1 });
    error.mockRestore();
  });
});
