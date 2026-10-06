import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Commissions et factures de la direction commerciale : gestes, machine d'états,
 * isolation des identifiants, fichier. Ni base, ni stockage, ni e-mail : tout
 * ce qui sort du processus est simulé.
 */

const db = vi.hoisted(() => ({
  salesRep: { findMany: vi.fn(), findUnique: vi.fn() },
  commission: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  salesInvoice: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
const storage = vi.hoisted(() => ({ put: vi.fn(), read: vi.fn(), delete: vi.fn() }));
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  getStorageProvider: vi.fn(),
  updateCommission: vi.fn(),
  recordProspectEvent: vi.fn(),
  notifySalesRep: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/ai/registry", () => ({ getStorageProvider: mocks.getStorageProvider }));
vi.mock("@/server/services/sales/commissions", () => ({
  updateCommission: mocks.updateCommission,
  CommissionChangedError: class CommissionChangedError extends Error {
    constructor() {
      super("La commission a changé entre-temps : rechargez la page.");
    }
  },
  CommissionInvoicedError: class CommissionInvoicedError extends Error {
    constructor() {
      super("Cette commission est réclamée par une facture : gérez-la depuis la facture.");
    }
  },
}));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/notifications", () => ({ notifySalesRep: mocks.notifySalesRep }));

const money = await import("../director-money");

const DIRECTOR = { id: "dir_1", label: "Diane Directrice" };
const REP = { id: "rep_1", firstName: "Marie", lastName: "Dupont" };
const NOW = new Date("2026-10-06T10:00:00Z");

const draft = { number: "FA-014", amountCents: 75_000, issuedAt: new Date("2026-10-01T12:00:00Z"), periodLabel: "Septembre 2026", note: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
  mocks.getStorageProvider.mockReturnValue(storage);
  storage.put.mockResolvedValue({ key: "k" });
  storage.delete.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------- Commissions

describe("la liste des commissions", () => {
  const commissionRow = (overrides: Record<string, unknown> = {}) => ({
    id: "com_1",
    amountCents: 25_000,
    status: "EARNED",
    createdAt: new Date("2026-10-02T09:00:00Z"),
    dueAt: null,
    paidAt: null,
    note: null,
    prospect: { id: "pro_1", name: "Pharmacie du Parc", city: "Lyon" },
    salesRep: { id: "rep_1", firstName: "Marie", lastName: "Dupont" },
    invoice: null,
    ...overrides,
  });

  it("filtre par commercial et par mois (heure de Paris) ; les totaux ignorent le statut, la liste non", async () => {
    db.salesRep.findMany.mockResolvedValue([{ ...REP, isActive: true }]);
    db.commission.groupBy.mockResolvedValue([
      { salesRepId: "rep_1", status: "EARNED", _sum: { amountCents: 50_000 }, _count: { _all: 2 } },
      { salesRepId: "rep_1", status: "PAID", _sum: { amountCents: 25_000 }, _count: { _all: 1 } },
    ]);
    db.commission.count.mockResolvedValue(2);
    db.commission.findMany.mockResolvedValue([commissionRow(), commissionRow({ id: "com_2", invoice: { id: "inv_1", number: "FA-014", status: "RECEIVED" } })]);

    const result = await money.listDirectorCommissions({ salesRepId: "rep_1", status: "EARNED", month: "2026-10", page: 1 });

    const month = { createdAt: { gte: new Date("2026-09-30T22:00:00Z"), lt: new Date("2026-10-31T23:00:00Z") } };
    expect(db.commission.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1", ...month } }));
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1", ...month, status: "EARNED" }, skip: 0, take: 50 }));
    expect(result.byStatus.EARNED).toEqual({ count: 2, cents: 50_000 });
    expect(result.byStatus.PAID).toEqual({ count: 1, cents: 25_000 });
    expect(result.byStatus.CANCELLED).toEqual({ count: 0, cents: 0 });
    expect(result.byRep).toEqual([expect.objectContaining({ salesRepId: "rep_1", name: "Marie Dupont", totalCents: 75_000, earnedCents: 50_000, paidCents: 25_000 })]);
    expect(result.rows[1].invoice).toEqual({ id: "inv_1", number: "FA-014", status: "RECEIVED" });
    expect(result.rows[0].rep).toEqual({ id: "rep_1", name: "Marie Dupont" });
  });

  it("sans filtre, aucune borne ; une page hors limites revient à la dernière", async () => {
    db.salesRep.findMany.mockResolvedValue([]);
    db.commission.groupBy.mockResolvedValue([]);
    db.commission.count.mockResolvedValue(120);
    db.commission.findMany.mockResolvedValue([]);
    const result = await money.listDirectorCommissions({ page: 99 });
    expect(db.commission.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result.pageCount).toBe(3);
    expect(result.page).toBe(3);
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 50 }));
  });
});

describe("les gestes sur une commission", () => {
  const found = (overrides: Record<string, unknown> = {}) => ({ id: "com_1", salesRepId: "rep_1", status: "EARNED", amountCents: 25_000, note: null, prospect: { name: "Pharmacie du Parc" }, invoice: null, ...overrides });

  it("commission inconnue : refus, rien n'est modifié", async () => {
    db.commission.findUnique.mockResolvedValue(null);
    expect(await money.moveCommission({ commissionId: "nope", gesture: "VALIDATE" }, DIRECTOR)).toEqual({ ok: false, error: "Commission introuvable." });
    expect(mocks.updateCommission).not.toHaveBeenCalled();
  });

  it("valider : acquise → à payer, avec l'acteur directeur", async () => {
    db.commission.findUnique.mockResolvedValue(found());
    const result = await money.moveCommission({ commissionId: "com_1", gesture: "VALIDATE" }, DIRECTOR);
    expect(result).toEqual({ ok: true, status: "PAYABLE", message: "Commission validée : elle est à payer." });
    expect(mocks.updateCommission).toHaveBeenCalledWith("com_1", { status: "PAYABLE" }, { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" });
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("un autre geste est passé entre la lecture et l'écriture : refus lisible, pas d'erreur serveur", async () => {
    const commissions = await import("@/server/services/sales/commissions");
    db.commission.findUnique.mockResolvedValue(found());
    mocks.updateCommission.mockRejectedValueOnce(new commissions.CommissionChangedError());
    expect(await money.moveCommission({ commissionId: "com_1", gesture: "VALIDATE" }, DIRECTOR)).toEqual({ ok: false, error: "La commission a changé entre-temps : rechargez la page." });
    mocks.updateCommission.mockRejectedValueOnce(new Error("panne"));
    await expect(money.moveCommission({ commissionId: "com_1", gesture: "VALIDATE" }, DIRECTOR)).rejects.toThrow("panne");
  });

  it("marquer payée : à payer → payée", async () => {
    db.commission.findUnique.mockResolvedValue(found({ status: "PAYABLE" }));
    const result = await money.moveCommission({ commissionId: "com_1", gesture: "PAY" }, DIRECTOR);
    expect(result).toMatchObject({ ok: true, status: "PAID" });
    expect(mocks.updateCommission).toHaveBeenCalledWith("com_1", { status: "PAID" }, expect.objectContaining({ type: "DIRECTOR" }));
  });

  it("refuse un geste que le statut interdit, sans rien écrire", async () => {
    db.commission.findUnique.mockResolvedValue(found({ status: "PAID" }));
    expect(await money.moveCommission({ commissionId: "com_1", gesture: "CANCEL", reason: "Erreur de saisie" }, DIRECTOR)).toEqual({ ok: false, error: "Une commission payée ne s'annule pas." });
    db.commission.findUnique.mockResolvedValue(found({ status: "FORECAST" }));
    expect(await money.moveCommission({ commissionId: "com_1", gesture: "PAY" }, DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("prévisionnelle") });
    db.commission.findUnique.mockResolvedValue(found({ status: "CANCELLED" }));
    expect(await money.moveCommission({ commissionId: "com_1", gesture: "VALIDATE" }, DIRECTOR)).toMatchObject({ ok: false });
    expect(mocks.updateCommission).not.toHaveBeenCalled();
  });

  it("annuler exige un motif ; il est gardé dans la note et le commercial est prévenu", async () => {
    db.commission.findUnique.mockResolvedValue(found({ note: "Contrat à confirmer" }));
    expect(await money.moveCommission({ commissionId: "com_1", gesture: "CANCEL", reason: "  " }, DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("motif") });
    expect(mocks.updateCommission).not.toHaveBeenCalled();

    const result = await money.moveCommission({ commissionId: "com_1", gesture: "CANCEL", reason: "Officine non activée" }, DIRECTOR);
    expect(result).toMatchObject({ ok: true, status: "CANCELLED" });
    expect(mocks.updateCommission).toHaveBeenCalledWith("com_1", { status: "CANCELLED", note: "Contrat à confirmer\nAnnulée : Officine non activée" }, expect.objectContaining({ type: "DIRECTOR", id: "dir_1" }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "COMMISSION_CANCELLED", body: expect.stringContaining("Officine non activée") }));
  });

  it("une commission réclamée par une facture se règle par la facture", async () => {
    db.commission.findUnique.mockResolvedValue(found({ invoice: { number: "FA-014" } }));
    for (const gesture of ["VALIDATE", "PAY", "CANCEL"] as const) {
      const result = await money.moveCommission({ commissionId: "com_1", gesture, reason: "Motif valable" }, DIRECTOR);
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("facture FA-014") });
    }
    expect(mocks.updateCommission).not.toHaveBeenCalled();
  });

  it("la note : bornée, vidée en null, commission inconnue refusée", async () => {
    expect(await money.setCommissionNote("com_1", "n".repeat(501), DIRECTOR)).toMatchObject({ ok: false });
    db.commission.findUnique.mockResolvedValueOnce(null);
    expect(await money.setCommissionNote("nope", "bonjour", DIRECTOR)).toEqual({ ok: false, error: "Commission introuvable." });
    db.commission.findUnique.mockResolvedValue({ id: "com_1" });
    expect(await money.setCommissionNote("com_1", "  Prime de lancement  ", DIRECTOR)).toEqual({ ok: true });
    expect(mocks.updateCommission).toHaveBeenLastCalledWith("com_1", { note: "Prime de lancement" }, expect.objectContaining({ type: "DIRECTOR" }));
    await money.setCommissionNote("com_1", "   ", DIRECTOR);
    expect(mocks.updateCommission).toHaveBeenLastCalledWith("com_1", { note: null }, expect.objectContaining({ type: "DIRECTOR" }));
  });
});

// ------------------------------------------------------------------- Factures

describe("enregistrer une facture", () => {
  const commission = (overrides: Record<string, unknown> = {}) => ({ id: "com_1", prospectId: "pro_1", amountCents: 25_000, status: "EARNED", invoiceId: null, ...overrides });
  const input = (overrides: Record<string, unknown> = {}) => ({ salesRepId: "rep_1", commissionIds: ["com_1", "com_2"], draft, ...overrides });

  beforeEach(() => {
    db.salesRep.findUnique.mockResolvedValue(REP);
    db.salesInvoice.findFirst.mockResolvedValue(null);
    db.commission.findMany.mockResolvedValue([commission(), commission({ id: "com_2", prospectId: "pro_2" })]);
    db.salesInvoice.create.mockResolvedValue({ id: "inv_1" });
    db.commission.updateMany.mockResolvedValue({ count: 2 });
  });

  it("commercial inconnu : refus", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    expect(await money.createInvoice(input(), null, DIRECTOR)).toEqual({ ok: false, error: "Commercial introuvable." });
    expect(db.salesInvoice.create).not.toHaveBeenCalled();
  });

  it("le numéro est unique pour un commercial, sans tenir compte des majuscules", async () => {
    db.salesInvoice.findFirst.mockResolvedValue({ id: "inv_0" });
    const result = await money.createInvoice(input(), null, DIRECTOR);
    expect(db.salesInvoice.findFirst).toHaveBeenCalledWith({ where: { salesRepId: "rep_1", number: { equals: "FA-014", mode: "insensitive" } }, select: { id: true } });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("existe déjà pour Marie Dupont") });
    expect(db.salesInvoice.create).not.toHaveBeenCalled();
  });

  it("une course sur le numéro (violation d'unicité) est dite de la même façon", async () => {
    db.salesInvoice.create.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    expect(await money.createInvoice(input(), null, DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("existe déjà") });
  });

  it("une commission d'un autre commercial est refusée : la requête est bornée au commercial, le compte doit tomber juste", async () => {
    db.commission.findMany.mockResolvedValue([commission()]); // com_2 appartient à quelqu'un d'autre : absente du résultat
    const result = await money.createInvoice(input(), null, DIRECTOR);
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["com_1", "com_2"] }, salesRepId: "rep_1" } }));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("n'est plus disponible") });
    expect(db.salesInvoice.create).not.toHaveBeenCalled();
  });

  it("refuse une commission déjà facturée, prévisionnelle, payée ou annulée", async () => {
    for (const bad of [{ invoiceId: "inv_9" }, { status: "FORECAST" }, { status: "PAID" }, { status: "CANCELLED" }]) {
      db.commission.findMany.mockResolvedValue([commission(bad), commission({ id: "com_2" })]);
      expect(await money.createInvoice(input(), null, DIRECTOR)).toMatchObject({ ok: false });
    }
    expect(db.salesInvoice.create).not.toHaveBeenCalled();
  });

  it("si une commission est prise entre-temps par une autre facture, tout est annulé", async () => {
    db.commission.updateMany.mockResolvedValue({ count: 1 });
    expect(await money.createInvoice(input(), null, DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("autre facture") });
  });

  it("crée la facture au nom du directeur de la session, rattache les commissions, trace et prévient", async () => {
    const result = await money.createInvoice(input({ commissionIds: ["com_1", "com_2", "com_1"] }), null, DIRECTOR);
    expect(result).toEqual({ ok: true, id: "inv_1", number: "FA-014", file: "none" });
    expect(db.salesInvoice.create).toHaveBeenCalledWith({
      data: { salesRepId: "rep_1", number: "FA-014", amountCents: 75_000, issuedAt: draft.issuedAt, periodLabel: "Septembre 2026", note: null, createdByType: "DIRECTOR", createdById: "dir_1", createdByLabel: "Diane Directrice" },
      select: { id: true },
    });
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["com_1", "com_2"] }, salesRepId: "rep_1", invoiceId: null, status: { in: ["EARNED", "PAYABLE"] } }, data: { invoiceId: "inv_1" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.invoice_created", entityId: "inv_1", salesDirectorId: "dir_1", metadata: expect.objectContaining({ salesRepId: "rep_1", amountCents: 75_000, hasFile: false }) }));
    expect(mocks.recordAudit.mock.calls[0][0]).not.toHaveProperty("platformAdminId");
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", type: "COMMISSION_UPDATED", actor: { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" } }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "INVOICE_RECEIVED" }));
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("sans commission, la facture est créée et le montant n'est simplement pas rapproché", async () => {
    const result = await money.createInvoice(input({ commissionIds: [] }), null, DIRECTOR);
    expect(result).toMatchObject({ ok: true });
    expect(db.commission.findMany).not.toHaveBeenCalled();
    expect(db.commission.updateMany).not.toHaveBeenCalled();
  });

  it("range le PDF dans le stockage privé, sous l'identifiant de la facture", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7");
    const result = await money.createInvoice(input({ commissionIds: [] }), { bytes, fileName: "facture.pdf" }, DIRECTOR);
    expect(result).toEqual({ ok: true, id: "inv_1", number: "FA-014", file: "saved" });
    expect(storage.put).toHaveBeenCalledWith("sales-invoices/inv_1/facture.pdf", bytes, "application/pdf");
    expect(db.salesInvoice.update).toHaveBeenCalledWith({ where: { id: "inv_1" }, data: { fileKey: "sales-invoices/inv_1/facture.pdf", fileName: "facture.pdf" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ hasFile: true }) }));
  });

  it("si le fichier ne peut pas être gardé, la facture n'est pas créée (tout ou rien)", async () => {
    storage.put.mockRejectedValue(new Error("disque plein"));
    db.salesInvoice.delete.mockResolvedValue({});
    const result = await money.createInvoice(input(), { bytes: new TextEncoder().encode("%PDF-1.7"), fileName: "facture.pdf" }, DIRECTOR);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("la facture n'a pas été créée") });
    expect(db.salesInvoice.delete).toHaveBeenCalledWith({ where: { id: "inv_1" } });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("fichier gardé mais base en échec : le fichier orphelin est effacé", async () => {
    db.salesInvoice.update.mockRejectedValue(new Error("base indisponible"));
    db.salesInvoice.delete.mockResolvedValue({});
    const result = await money.createInvoice(input({ commissionIds: [] }), { bytes: new TextEncoder().encode("%PDF-1.7"), fileName: "f.pdf" }, DIRECTOR);
    expect(result).toMatchObject({ ok: false });
    expect(storage.delete).toHaveBeenCalledWith("sales-invoices/inv_1/facture.pdf");
  });
});

describe("faire avancer une facture", () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: "inv_1",
    salesRepId: "rep_1",
    number: "FA-014",
    amountCents: 75_000,
    status: "RECEIVED",
    commissions: [
      { id: "com_1", prospectId: "pro_1", amountCents: 25_000, status: "EARNED" },
      { id: "com_2", prospectId: "pro_2", amountCents: 50_000, status: "EARNED" },
    ],
    ...overrides,
  });

  beforeEach(() => {
    db.salesInvoice.updateMany.mockResolvedValue({ count: 1 });
    db.commission.updateMany.mockResolvedValue({ count: 2 });
  });

  it("facture inconnue : refus", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(null);
    expect(await money.moveInvoice({ invoiceId: "nope", gesture: "APPROVE" }, DIRECTOR)).toEqual({ ok: false, error: "Facture introuvable." });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("valider : reçue → validée, les commissions passent à payer, tout est tracé et le commercial prévenu", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    const result = await money.moveInvoice({ invoiceId: "inv_1", gesture: "APPROVE" }, DIRECTOR);
    expect(result).toEqual({ ok: true, status: "APPROVED", message: "Facture FA-014 validée. 2 commissions sont à payer." });
    // Le statut lu est vérifié à l'écriture : un second directeur ne peut pas rejouer le geste.
    expect(db.salesInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "RECEIVED" }, data: { status: "APPROVED", approvedAt: expect.any(Date) } });
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { invoiceId: "inv_1", status: "EARNED" }, data: { status: "PAYABLE" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.invoice_updated", salesDirectorId: "dir_1", metadata: expect.objectContaining({ gesture: "APPROVE", from: "RECEIVED", to: "APPROVED" }) }));
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", type: "COMMISSION_UPDATED", actor: expect.objectContaining({ type: "DIRECTOR", id: "dir_1" }) }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_1", type: "INVOICE_APPROVED" }));
  });

  it("l'écart entre le montant et les commissions ne bloque jamais", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice({ amountCents: 99_900 }));
    expect(await money.moveInvoice({ invoiceId: "inv_1", gesture: "APPROVE" }, DIRECTOR)).toMatchObject({ ok: true, status: "APPROVED" });
  });

  it("payer : validée → payée, les commissions sont payées avec leur date, jamais une payée rétrogradée", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(
      invoice({ status: "APPROVED", commissions: [{ id: "com_1", prospectId: "pro_1", amountCents: 25_000, status: "PAYABLE" }, { id: "com_2", prospectId: "pro_2", amountCents: 50_000, status: "PAID" }] }),
    );
    const result = await money.moveInvoice({ invoiceId: "inv_1", gesture: "PAY" }, DIRECTOR);
    expect(result).toMatchObject({ ok: true, status: "PAID" });
    expect(db.salesInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "APPROVED" }, data: { status: "PAID", paidAt: expect.any(Date) } });
    expect(db.commission.updateMany).toHaveBeenCalledTimes(1);
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { invoiceId: "inv_1", status: "PAYABLE" }, data: { status: "PAID", paidAt: expect.any(Date) } });
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", type: "COMMISSION_PAID" }));
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ type: "INVOICE_PAID" }));
  });

  it("refuse les gestes que la machine interdit : payer avant de valider, tout geste sur une facture payée ou refusée", async () => {
    const cases: [string, "APPROVE" | "PAY" | "REJECT"][] = [
      ["RECEIVED", "PAY"],
      ["APPROVED", "APPROVE"],
      ["PAID", "APPROVE"],
      ["PAID", "REJECT"],
      ["REJECTED", "APPROVE"],
      ["REJECTED", "PAY"],
    ];
    for (const [status, gesture] of cases) {
      db.salesInvoice.findUnique.mockResolvedValue(invoice({ status }));
      const result = await money.moveInvoice({ invoiceId: "inv_1", gesture, reason: "Motif valable" }, DIRECTOR);
      expect(result.ok, `${status} ${gesture}`).toBe(false);
    }
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuser exige un motif", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    for (const reason of [undefined, null, "", "  ", "non"]) {
      expect(await money.moveInvoice({ invoiceId: "inv_1", gesture: "REJECT", reason }, DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("motif") });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuser une facture reçue : motif gardé, commissions détachées, statuts inchangés", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    const result = await money.moveInvoice({ invoiceId: "inv_1", gesture: "REJECT", reason: "  Montant   erroné " }, DIRECTOR);
    expect(result).toEqual({ ok: true, status: "REJECTED", message: "Facture FA-014 refusée. 2 commissions sont libérées." });
    expect(db.salesInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "RECEIVED" }, data: { status: "REJECTED", rejectionReason: "Montant erroné" } });
    // Seul le détachement : aucune commission ne change de statut.
    expect(db.commission.updateMany).toHaveBeenCalledTimes(1);
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { invoiceId: "inv_1" }, data: { invoiceId: null } });
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ type: "INVOICE_REJECTED", body: expect.stringContaining("Montant erroné"), severity: "WARNING" }));
    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(2);
  });

  it("refuser une facture validée remet à « acquise » ce que la validation avait mis à payer, puis détache", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice({ status: "APPROVED", commissions: [{ id: "com_1", prospectId: "pro_1", amountCents: 25_000, status: "PAYABLE" }] }));
    await money.moveInvoice({ invoiceId: "inv_1", gesture: "REJECT", reason: "Facture en double" }, DIRECTOR);
    const calls = db.commission.updateMany.mock.calls.map((call) => call[0]);
    expect(calls).toEqual([
      { where: { invoiceId: "inv_1", status: "PAYABLE" }, data: { status: "EARNED" } },
      { where: { invoiceId: "inv_1" }, data: { invoiceId: null } },
    ]);
  });

  it("deux directeurs en même temps : le second voit que la facture a changé, rien n'est tracé", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    db.salesInvoice.updateMany.mockResolvedValue({ count: 0 });
    const result = await money.moveInvoice({ invoiceId: "inv_1", gesture: "APPROVE" }, DIRECTOR);
    expect(result).toEqual({ ok: false, error: "Cette facture vient de changer. Rechargez la page pour voir son état actuel." });
    expect(db.commission.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("une facture sans commission avance sans toucher aux commissions", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice({ commissions: [] }));
    const result = await money.moveInvoice({ invoiceId: "inv_1", gesture: "APPROVE" }, DIRECTOR);
    expect(result).toEqual({ ok: true, status: "APPROVED", message: "Facture FA-014 validée." });
    expect(db.commission.updateMany).not.toHaveBeenCalled();
  });

  it("un échec de notification ne défait pas le geste", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    mocks.notifySalesRep.mockRejectedValue(new Error("base lente"));
    expect(await money.moveInvoice({ invoiceId: "inv_1", gesture: "APPROVE" }, DIRECTOR)).toMatchObject({ ok: true });
  });
});

describe("supprimer une facture", () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({ id: "inv_1", salesRepId: "rep_1", number: "FA-014", amountCents: 75_000, status: "RECEIVED", fileKey: "sales-invoices/inv_1/facture.pdf", commissions: [{ id: "com_1", prospectId: "pro_1", amountCents: 25_000 }], ...overrides });

  it("facture inconnue : refus", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(null);
    expect(await money.deleteInvoice("nope", DIRECTOR)).toEqual({ ok: false, error: "Facture introuvable." });
  });

  it("une facture validée ou payée ne se supprime pas", async () => {
    for (const status of ["APPROVED", "PAID"]) {
      db.salesInvoice.findUnique.mockResolvedValue(invoice({ status }));
      expect(await money.deleteInvoice("inv_1", DIRECTOR)).toMatchObject({ ok: false, error: expect.stringContaining("comptabilité") });
    }
    expect(db.salesInvoice.deleteMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("supprime une facture reçue : fichier effacé, commissions libérées, tracé", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    db.salesInvoice.deleteMany.mockResolvedValue({ count: 1 });
    expect(await money.deleteInvoice("inv_1", DIRECTOR)).toEqual({ ok: true, number: "FA-014" });
    expect(db.salesInvoice.deleteMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "RECEIVED" } });
    expect(storage.delete).toHaveBeenCalledWith("sales-invoices/inv_1/facture.pdf");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.invoice_deleted", salesDirectorId: "dir_1", metadata: expect.objectContaining({ number: "FA-014", status: "RECEIVED" }) }));
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith(expect.objectContaining({ prospectId: "pro_1", summary: expect.stringContaining("détachée de la facture FA-014") }));
  });

  it("une clé de fichier qui n'est pas celle de la facture n'est jamais effacée", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice({ fileKey: "pharmacy_1/ordonnance.pdf" }));
    db.salesInvoice.deleteMany.mockResolvedValue({ count: 1 });
    await money.deleteInvoice("inv_1", DIRECTOR);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("si la facture a changé entre-temps, rien n'est effacé", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(invoice());
    db.salesInvoice.deleteMany.mockResolvedValue({ count: 0 });
    expect(await money.deleteInvoice("inv_1", DIRECTOR)).toMatchObject({ ok: false });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("le fichier d'une facture", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({ id: "inv_1", number: "FA-014", fileKey: "sales-invoices/inv_1/facture.pdf", fileName: "Facture Marie.pdf", ...overrides });

  it("dit proprement ce qui manque", async () => {
    db.salesInvoice.findUnique.mockResolvedValueOnce(null);
    expect(await money.readInvoiceFile("nope", DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
    db.salesInvoice.findUnique.mockResolvedValueOnce(row({ fileKey: null }));
    expect(await money.readInvoiceFile("inv_1", DIRECTOR)).toEqual({ ok: false, reason: "NO_FILE" });
    db.salesInvoice.findUnique.mockResolvedValueOnce(row());
    storage.read.mockResolvedValueOnce(null);
    expect(await money.readInvoiceFile("inv_1", DIRECTOR)).toEqual({ ok: false, reason: "FILE_MISSING" });
    db.salesInvoice.findUnique.mockResolvedValueOnce(row());
    storage.read.mockRejectedValueOnce(new Error("indisponible"));
    expect(await money.readInvoiceFile("inv_1", DIRECTOR)).toEqual({ ok: false, reason: "STORAGE_UNAVAILABLE" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une clé altérée ne lit jamais le fichier d'une autre facture ni celui d'une officine", async () => {
    for (const fileKey of ["sales-invoices/inv_2/facture.pdf", "sales-invoices/inv_1/../inv_2/facture.pdf", "pharmacy_1/ordonnance.pdf"]) {
      db.salesInvoice.findUnique.mockResolvedValueOnce(row({ fileKey }));
      expect(await money.readInvoiceFile("inv_1", DIRECTOR)).toEqual({ ok: false, reason: "NO_FILE" });
    }
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("rend le fichier et trace chaque lecture au nom du directeur", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(row());
    const bytes = new TextEncoder().encode("%PDF-1.7 contenu");
    storage.read.mockResolvedValue(bytes);
    expect(await money.readInvoiceFile("inv_1", DIRECTOR)).toEqual({ ok: true, bytes, fileName: "Facture Marie.pdf" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.invoice_updated", salesDirectorId: "dir_1", metadata: { event: "file_downloaded", sizeBytes: bytes.length } }));
  });

  it("sans nom gardé, un nom sûr construit sur le numéro", async () => {
    db.salesInvoice.findUnique.mockResolvedValue(row({ fileName: null, number: "FA/2026:14" }));
    storage.read.mockResolvedValue(new Uint8Array([1]));
    const result = await money.readInvoiceFile("inv_1", DIRECTOR);
    expect(result).toMatchObject({ ok: true, fileName: "Facture FA-2026 14.pdf" });
  });
});

describe("la liste et le détail des factures", () => {
  it("les totaux par statut sont réels (zéro pour un statut absent)", async () => {
    db.salesRep.findMany.mockResolvedValue([]);
    db.salesInvoice.groupBy.mockResolvedValue([
      { status: "RECEIVED", _sum: { amountCents: 75_000 }, _count: { _all: 2 } },
      { status: "PAID", _sum: { amountCents: 30_000 }, _count: { _all: 1 } },
    ]);
    db.salesInvoice.count.mockResolvedValue(3);
    db.salesInvoice.findMany.mockResolvedValue([
      { id: "inv_1", number: "FA-014", amountCents: 75_000, issuedAt: NOW, periodLabel: null, status: "RECEIVED", fileKey: "sales-invoices/inv_1/facture.pdf", salesRep: REP, _count: { commissions: 2 } },
    ]);
    const result = await money.listDirectorInvoices({ salesRepId: "rep_1", status: "RECEIVED" });
    expect(db.salesInvoice.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1" } }));
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1", status: "RECEIVED" } }));
    expect(result.byStatus).toEqual({ RECEIVED: { count: 2, cents: 75_000 }, APPROVED: { count: 0, cents: 0 }, PAID: { count: 1, cents: 30_000 }, REJECTED: { count: 0, cents: 0 } });
    expect(result.rows[0]).toMatchObject({ number: "FA-014", hasFile: true, commissionCount: 2, rep: { id: "rep_1", name: "Marie Dupont" } });
  });

  it("le détail rapproche le montant des commissions rattachées, en clair", async () => {
    db.salesInvoice.findUnique.mockResolvedValue({
      id: "inv_1",
      number: "FA-014",
      amountCents: 80_000,
      issuedAt: NOW,
      periodLabel: "Septembre 2026",
      status: "RECEIVED",
      note: null,
      rejectionReason: null,
      fileKey: null,
      fileName: null,
      createdAt: NOW,
      createdByLabel: "Diane Directrice",
      updatedAt: NOW,
      approvedAt: null,
      paidAt: null,
      salesRep: REP,
      commissions: [
        { id: "com_1", amountCents: 25_000, status: "EARNED", createdAt: NOW, prospect: { name: "Pharmacie du Parc", city: "Lyon" } },
        { id: "com_2", amountCents: 50_000, status: "EARNED", createdAt: NOW, prospect: { name: "Pharmacie de la Gare", city: null } },
      ],
    });
    const invoice = await money.getDirectorInvoice("inv_1");
    expect(invoice).toMatchObject({ hasFile: false, rejectedAt: null, commissionsCents: 75_000, gap: { kind: "HIGHER", differenceCents: 5_000 } });
    expect(invoice?.gap.message).toContain("dépasse de 50,00 €");
    db.salesInvoice.findUnique.mockResolvedValue(null);
    expect(await money.getDirectorInvoice("nope")).toBeNull();
  });

  it("les commissions que l'on peut facturer : acquises ou à payer, libres de toute facture", async () => {
    db.commission.findMany.mockResolvedValue([{ id: "com_1", salesRepId: "rep_1", amountCents: 25_000, status: "EARNED", createdAt: NOW, prospect: { name: "Pharmacie du Parc", city: "Lyon" } }]);
    const rows = await money.listInvoiceableCommissions();
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { invoiceId: null, status: { in: ["EARNED", "PAYABLE"] } } }));
    expect(rows).toEqual([{ id: "com_1", salesRepId: "rep_1", amountCents: 25_000, status: "EARNED", createdAt: NOW, prospectName: "Pharmacie du Parc", city: "Lyon" }]);
  });
});
