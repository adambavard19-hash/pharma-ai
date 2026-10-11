import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `updateCommission` accepte un administrateur (forme historique de la console)
 * ou le directeur commercial ; `listInvoicesFor` ne rend que les factures du
 * commercial de la session, et seulement ce que sa page affiche.
 */

const db = vi.hoisted(() => ({
  commission: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  contract: { findUniqueOrThrow: vi.fn() },
  salesInvoice: { findMany: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), recordProspectEvent: vi.fn(), notifySalesRep: vi.fn(), notifyAdmins: vi.fn(), progressiveAmountFor: vi.fn(), syncSafely: vi.fn(), activatedPharmaciesOf: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/notifications", () => ({ notifySalesRep: mocks.notifySalesRep, notifyAdmins: mocks.notifyAdmins }));
vi.mock("@/server/services/sales/progressive-commissions", () => ({ progressiveAmountFor: mocks.progressiveAmountFor, syncProgressiveCommissionsSafely: mocks.syncSafely, activatedPharmaciesOf: mocks.activatedPharmaciesOf }));

const commissions = await import("../commissions");

const before = { id: "com_1", prospectId: "pro_1", salesRepId: "rep_1", amountCents: 25_000, status: "PAYABLE", prospect: { name: "Pharmacie du Parc" } };

beforeEach(() => {
  vi.resetAllMocks();
  // Première lecture : l'état d'avant ; relecture après l'écriture : l'état d'après.
  let written: Record<string, unknown> = {};
  db.commission.findUniqueOrThrow.mockImplementation(async () => ({ ...before, ...written }));
  db.commission.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    written = data;
    return { count: 1 };
  });
});

describe("updateCommission : l'acteur", () => {
  it("forme historique (identifiant et nom d'un administrateur) : inchangée pour la console", async () => {
    await commissions.updateCommission("com_1", { status: "PAID" }, "adm_1", "Alice Admin");
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", type: "COMMISSION_PAID", actor: { type: "ADMIN", id: "adm_1", label: "Alice Admin" } }));
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "sales.commission_updated", entityId: "com_1", platformAdminId: "adm_1" });
    expect(audit).not.toHaveProperty("salesDirectorId");
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "COMMISSION_PAID" }));
  });

  it("acteur administrateur sous forme d'objet : même comportement", async () => {
    await commissions.updateCommission("com_1", { note: "Prime" }, { type: "ADMIN", id: "adm_1", label: "Alice Admin" });
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "COMMISSION_UPDATED", actor: { type: "ADMIN", id: "adm_1", label: "Alice Admin" } }));
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ platformAdminId: "adm_1" });
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("acteur directeur : l'événement du dossier et l'audit portent le directeur, jamais un administrateur", async () => {
    await commissions.updateCommission("com_1", { status: "PAID" }, { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" });
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "COMMISSION_PAID", actor: { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" } }));
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "sales.commission_updated", salesDirectorId: "dir_1" });
    expect(audit).not.toHaveProperty("platformAdminId");
    // Le commercial est prévenu du paiement comme avant.
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "COMMISSION_PAID", body: "Pharmacie du Parc" }));
  });

  it("le paiement date la commission ; un autre geste ne touche pas à la date", async () => {
    await commissions.updateCommission("com_1", { status: "PAID" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[0][0].data).toEqual({ status: "PAID", paidAt: expect.any(Date) });
    await commissions.updateCommission("com_1", { status: "PAYABLE" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[1][0].data).toEqual({ status: "PAYABLE" });
  });

  it("l'écriture est conditionnée au statut relu : deux gestes simultanés ne s'écrasent pas", async () => {
    await commissions.updateCommission("com_1", { status: "PAID" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[0][0].where).toEqual({ id: "com_1", status: "PAYABLE" });
    // Le second geste arrive après que le statut a changé : zéro ligne écrite, donc refusé, sans trace ni notification.
    vi.clearAllMocks();
    db.commission.findUniqueOrThrow.mockResolvedValue(before);
    db.commission.updateMany.mockResolvedValue({ count: 0 });
    await expect(commissions.updateCommission("com_1", { status: "PAID" }, { type: "DIRECTOR", id: "dir_1", label: "D" })).rejects.toMatchObject({ name: "CommissionChangedError", message: expect.stringContaining("changé entre-temps") });
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("une commission réclamée par une facture ne change ni de statut ni de montant hors du flux de la facture", async () => {
    db.commission.findUniqueOrThrow.mockResolvedValue({ ...before, invoiceId: "inv_1" });
    const director = { type: "DIRECTOR", id: "dir_1", label: "D" } as const;
    await expect(commissions.updateCommission("com_1", { status: "PAID" }, director)).rejects.toMatchObject({ name: "CommissionInvoicedError", message: expect.stringContaining("gérez-la depuis la facture") });
    await expect(commissions.updateCommission("com_1", { amountCents: 1 }, director)).rejects.toMatchObject({ name: "CommissionInvoicedError" });
    // La console aussi (forme historique).
    await expect(commissions.updateCommission("com_1", { status: "CANCELLED" }, "adm_1", "Alice")).rejects.toMatchObject({ name: "CommissionInvoicedError" });
    expect(db.commission.updateMany).not.toHaveBeenCalled();
    // Une note reste possible, et le flux de la facture passe.
    await commissions.updateCommission("com_1", { note: "À vérifier" }, director);
    await commissions.updateCommission("com_1", { status: "PAID" }, director, { viaInvoice: true });
    expect(db.commission.updateMany).toHaveBeenCalledTimes(2);
  });

  it("une commission inconnue lève, comme avant (les services du directeur la vérifient d'abord)", async () => {
    db.commission.findUniqueOrThrow.mockRejectedValue(new Error("No Commission found"));
    await expect(commissions.updateCommission("nope", { status: "PAID" }, { type: "DIRECTOR", id: "dir_1", label: "D" })).rejects.toThrow();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("listInvoicesFor", () => {
  it("ne lit que les factures du commercial donné, et rien d'autre que numéro, date, montant, statut", async () => {
    db.salesInvoice.findMany.mockResolvedValue([{ id: "inv_1", number: "FA-014", issuedAt: new Date("2026-10-01T12:00:00Z"), amountCents: 75_000, status: "APPROVED" }]);
    const rows = await commissions.listInvoicesFor("rep_1");
    const query = db.salesInvoice.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ salesRepId: "rep_1" });
    expect(query.select).toEqual({ id: true, number: true, issuedAt: true, amountCents: true, status: true });
    expect(rows).toHaveLength(1);
  });
});

describe("updateCommission : la grille progressive", () => {
  it("un montant saisi à la main sur une commission de la grille la fait passer en montant fixe : le recalcul ne l'écrasera pas", async () => {
    db.commission.findUniqueOrThrow.mockImplementation(async () => ({ ...before, status: "EARNED", type: "PROGRESSIVE", amountCents: 25_000 }));
    await commissions.updateCommission("com_1", { amountCents: 27_000 }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[0][0].data).toEqual({ amountCents: 27_000, type: "FIXED" });
    expect(mocks.recordProspectEvent.mock.calls[0][0].summary).toContain("montant fixé à la main");
  });

  it("une note, un statut ou le même montant ne changent pas le type", async () => {
    db.commission.findUniqueOrThrow.mockImplementation(async () => ({ ...before, status: "EARNED", type: "PROGRESSIVE", amountCents: 25_000 }));
    await commissions.updateCommission("com_1", { note: "ok", amountCents: 25_000, status: "PAYABLE" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[0][0].data).not.toHaveProperty("type");
  });
});

describe("updateCommission : la date d'acquisition (« Acquis ce mois »)", () => {
  it("posée quand une prévisionnelle devient acquise, à payer ou payée ; retirée si elle redevient prévisionnelle ; inchangée sinon", async () => {
    db.commission.findUniqueOrThrow.mockImplementation(async () => ({ ...before, status: "FORECAST" }));
    await commissions.updateCommission("com_1", { status: "EARNED" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[0][0].data).toEqual({ status: "EARNED", earnedAt: expect.any(Date) });

    db.commission.findUniqueOrThrow.mockImplementation(async () => ({ ...before, status: "EARNED" }));
    await commissions.updateCommission("com_1", { status: "FORECAST" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[1][0].data).toEqual({ status: "FORECAST", earnedAt: null });

    await commissions.updateCommission("com_1", { status: "PAYABLE" }, { type: "DIRECTOR", id: "dir_1", label: "D" });
    expect(db.commission.updateMany.mock.calls[2][0].data).toEqual({ status: "PAYABLE" });
  });
});

describe("listCommissionsFor", () => {
  it("« Ce mois » compte ce qui est devenu ACQUIS ce mois-ci (heure de Paris), par la date d'acquisition, pas la création de la ligne", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    try {
      const row = (amountCents: number, status: string, createdAt: string, earnedAt: string | null) => ({ id: `c${amountCents}`, amountCents, status, createdAt: new Date(createdAt), earnedAt: earnedAt ? new Date(earnedAt) : null, prospect: { id: "p", name: "P", activatedAt: null, contracts: [] } });
      db.commission.findMany.mockResolvedValue([
        row(100, "EARNED", "2026-09-28T10:00:00Z", "2026-10-02T10:00:00Z"), // créée en septembre, acquise en octobre : comptée
        row(200, "PAID", "2026-10-01T10:00:00Z", "2026-09-30T21:30:00Z"), // acquise le 30/09 à 23 h 30 (Paris) : septembre
        row(400, "PAYABLE", "2026-09-01T10:00:00Z", "2026-09-30T22:30:00Z"), // acquise le 1er octobre à 0 h 30 (Paris) : comptée
        row(800, "FORECAST", "2026-10-03T10:00:00Z", null), // prévisionnelle : jamais
        row(1600, "CANCELLED", "2026-10-03T10:00:00Z", "2026-10-03T10:00:00Z"), // annulée : jamais
      ]);
      const data = await commissions.listCommissionsFor("rep_1");
      expect(data.thisMonthCents).toBe(500);
      const query = db.commission.findMany.mock.calls[0][0];
      expect(query.where).toEqual({ salesRepId: "rep_1" });
      // Les plus récentes d'abord ; des bonus créés ensemble, le palier le plus haut d'abord.
      expect(query.orderBy).toEqual([{ createdAt: "desc" }, { bonusTier: { sort: "desc", nulls: "last" } }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("upsertCommissionForContract", () => {
  const contractOf = (rep: Record<string, unknown> | null) => ({ id: "ctr_1", monthlyPriceCents: 12_600, durationMonths: 12, prospect: { id: "pro_1", name: "Pharmacie du Parc", salesRep: rep } });
  const progressiveRep = { id: "rep_1", firstName: "Marie", lastName: "Dupont", commissionType: "PROGRESSIVE", commissionValue: 0 };

  beforeEach(() => {
    db.commission.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "com_new", ...data }));
    db.commission.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "com_old", ...data }));
  });

  it("grille progressive : montant de la grille (rang ou prochaine activation), type PROGRESSIVE, puis recalcul de la grille", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(null);
    mocks.progressiveAmountFor.mockResolvedValue(25_000);
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "FORECAST", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(mocks.progressiveAmountFor).toHaveBeenCalledWith("rep_1", "pro_1");
    expect(db.commission.create).toHaveBeenCalledWith({ data: { prospectId: "pro_1", salesRepId: "rep_1", type: "PROGRESSIVE", amountCents: 25_000, status: "FORECAST", dueAt: null, earnedAt: null } });
    expect(mocks.syncSafely).toHaveBeenCalledWith("rep_1", "contrat");
  });

  const forecastRow = (overrides: Record<string, unknown> = {}) => ({ id: "com_old", type: "PROGRESSIVE", status: "FORECAST", amountCents: 25_000, invoiceId: null, dueAt: null, earnedAt: null, ...overrides });

  it("la commission du dossier est cherchée hors bonus de palier : un bonus rattaché au même dossier n'est jamais écrasé", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(forecastRow());
    mocks.progressiveAmountFor.mockResolvedValue(20_000);
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.findFirst).toHaveBeenCalledWith({ where: { prospectId: "pro_1", status: { in: ["FORECAST", "EARNED", "PAYABLE"] }, type: { not: "BONUS" } } });
    // Contrat finalisé : acquise, échéance et date d'acquisition posées.
    expect(db.commission.update).toHaveBeenCalledWith({ where: { id: "com_old" }, data: { amountCents: 20_000, status: "EARNED", type: "PROGRESSIVE", salesRepId: "rep_1", dueAt: expect.any(Date), earnedAt: expect.any(Date) } });
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ type: "COMMISSION_EARNED" }));
  });

  it("montant fixé à la main par la direction (ligne passée en montant fixe) : la signature du contrat le garde, seul le statut avance", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(forecastRow({ type: "FIXED", amountCents: 27_000 }));
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(mocks.progressiveAmountFor).not.toHaveBeenCalled();
    expect(db.commission.update).toHaveBeenCalledWith({ where: { id: "com_old" }, data: expect.objectContaining({ amountCents: 27_000, type: "FIXED", status: "EARNED" }) });
    expect(mocks.recordProspectEvent.mock.calls[0][0].summary).toContain("règle d'origine gardée");
  });

  it("montant fixe d'avant la grille (contrat parti avant le passage du commercial à la grille) : 300 € gardés à la signature", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(forecastRow({ type: "FIXED", amountCents: 30_000 }));
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.update.mock.calls[0][0].data).toMatchObject({ amountCents: 30_000, type: "FIXED", status: "EARNED" });
  });

  it("une commission réclamée par une facture n'est jamais touchée par un contrat (ni montant, ni statut, ni trace)", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(forecastRow({ status: "EARNED", invoiceId: "inv_1" }));
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.update).not.toHaveBeenCalled();
    expect(db.commission.create).not.toHaveBeenCalled();
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("le statut ne recule jamais : une commission « à payer » le reste à la signature, sans seconde notification", async () => {
    const due = new Date("2026-11-30T12:00:00Z");
    const earned = new Date("2026-10-02T09:00:00Z");
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(progressiveRep));
    db.commission.findFirst.mockResolvedValue(forecastRow({ status: "PAYABLE", dueAt: due, earnedAt: earned }));
    mocks.progressiveAmountFor.mockResolvedValue(25_000);
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.update.mock.calls[0][0].data).toMatchObject({ status: "PAYABLE", dueAt: due, earnedAt: earned });
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("accord particulier (pourcentage) : calcul d'avant, sans grille ni recalcul", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf({ ...progressiveRep, commissionType: "PERCENT", commissionValue: 1000 }));
    db.commission.findFirst.mockResolvedValue(null);
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "FORECAST", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "PERCENT", amountCents: 15_120 }) });
    expect(mocks.progressiveAmountFor).not.toHaveBeenCalled();
    expect(mocks.syncSafely).not.toHaveBeenCalled();
  });

  it("dossier sans commercial : rien", async () => {
    db.contract.findUniqueOrThrow.mockResolvedValue(contractOf(null));
    await commissions.upsertCommissionForContract({ prospectId: "pro_1", contractId: "ctr_1", status: "FORECAST", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    expect(db.commission.findFirst).not.toHaveBeenCalled();
    expect(db.commission.create).not.toHaveBeenCalled();
  });
});
