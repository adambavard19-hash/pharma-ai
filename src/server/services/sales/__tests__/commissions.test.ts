import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `updateCommission` accepte un administrateur (forme historique de la console)
 * ou le directeur commercial ; `listInvoicesFor` ne rend que les factures du
 * commercial de la session, et seulement ce que sa page affiche.
 */

const db = vi.hoisted(() => ({
  commission: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  salesInvoice: { findMany: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), recordProspectEvent: vi.fn(), notifySalesRep: vi.fn(), notifyAdmins: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/services/sales/events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("@/server/services/sales/notifications", () => ({ notifySalesRep: mocks.notifySalesRep, notifyAdmins: mocks.notifyAdmins }));

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
