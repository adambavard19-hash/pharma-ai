import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les candidatures sous l'acteur « directeur commercial » : statut, note,
 * transformation, CV et historique. Le directeur laisse `director:<id>` dans
 * l'historique de la candidature et `salesDirectorId` dans l'audit ; un
 * administrateur garde son identifiant tel quel. Ni base, ni e-mail, ni stockage.
 */

const db = vi.hoisted(() => ({
  salesApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
  salesApplicationEvent: { create: vi.fn() },
  salesRep: { findUnique: vi.fn(), delete: vi.fn() },
  platformAdmin: { findMany: vi.fn() },
  salesDirector: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  getStorageProvider: vi.fn(),
  createSalesRep: vi.fn(),
  sendSalesInvitation: vi.fn(),
  getStandardCommissionCents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/ai/registry", () => ({ getStorageProvider: mocks.getStorageProvider }));
vi.mock("@/server/services/sales/reps", () => ({ createSalesRep: mocks.createSalesRep, sendSalesInvitation: mocks.sendSalesInvitation }));
vi.mock("@/server/services/standard-commission", () => ({ getStandardCommissionCents: mocks.getStandardCommissionCents }));

const admin = await import("../admin");

const DIRECTOR = { type: "DIRECTOR" as const, id: "dir_1", label: "Diane Directrice" };
const ADMIN = { type: "ADMIN" as const, id: "adm_1", label: "Alice Admin" };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
  mocks.getStandardCommissionCents.mockResolvedValue(25000);
});

describe("changer le statut", () => {
  it("le directeur : l'événement porte `director:<id>`, l'audit son salesDirectorId", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "NEW", salesRepId: null });
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });

    expect(await admin.moveSalesApplication("app_1", "INTERVIEW", DIRECTOR)).toEqual({ ok: true, from: "NEW", to: "INTERVIEW" });

    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: { applicationId: "app_1", kind: "STATUS_CHANGED", fromStatus: "NEW", toStatus: "INTERVIEW", platformAdminId: "director:dir_1" } });
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "sales_application.status_changed", entityId: "app_1", salesDirectorId: "dir_1" });
    expect(audit).not.toHaveProperty("platformAdminId");
  });

  it("un acteur administrateur garde son identifiant tel quel dans l'historique", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "NEW", salesRepId: null });
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });
    await admin.moveSalesApplication("app_1", "INTERVIEW", ADMIN);
    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ platformAdminId: "adm_1" }) });
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ platformAdminId: "adm_1" });
  });
});

describe("ajouter une note", () => {
  it("le directeur : l'événement `director:<id>` ; l'audit ne garde que la longueur", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ id: "app_1" });
    db.salesApplicationEvent.create.mockResolvedValue({ id: "evt_1" });
    await admin.addSalesApplicationNote("app_1", "Appelée : motivée.", DIRECTOR);
    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: { applicationId: "app_1", kind: "NOTE", note: "Appelée : motivée.", platformAdminId: "director:dir_1" }, select: { id: true } });
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ salesDirectorId: "dir_1", metadata: { eventId: "evt_1", length: 18 } });
    expect(JSON.stringify(audit)).not.toContain("motivée");
  });
});

describe("transformer en commercial", () => {
  beforeEach(() => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "ACCEPTED", salesRepId: null, firstName: "Marie", lastName: "Dupont", email: "marie@exemple.fr", phone: "06 12 34 56 78", zone: "Rhône" });
    db.salesRep.findUnique.mockResolvedValue(null);
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });
    mocks.createSalesRep.mockResolvedValue({ id: "rep_1" });
    mocks.sendSalesInvitation.mockResolvedValue({ status: "SENT", detail: "ok" });
  });

  it("le directeur : le commercial est créé et invité sous son nom, l'événement et l'audit sont les siens", async () => {
    const result = await admin.convertSalesApplication("app_1", DIRECTOR, { invite: true });
    expect(result).toMatchObject({ ok: true, salesRepId: "rep_1" });
    expect(mocks.createSalesRep).toHaveBeenCalledWith(expect.objectContaining({ commissionType: "FIXED", commissionValue: 25000 }), DIRECTOR);
    expect(mocks.sendSalesInvitation).toHaveBeenCalledWith("rep_1", DIRECTOR);
    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "CONVERTED", platformAdminId: "director:dir_1" }) });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales_application.converted", entityId: "app_1", salesDirectorId: "dir_1" }));
    expect(mocks.recordAudit.mock.calls.at(-1)?.[0]).not.toHaveProperty("platformAdminId");
  });

  it("les refus restent ceux de la console : candidature non acceptée, déjà transformée, adresse prise", async () => {
    db.salesApplication.findUnique.mockResolvedValueOnce({ status: "NEW", salesRepId: null });
    expect(await admin.convertSalesApplication("app_1", DIRECTOR)).toEqual({ ok: false, reason: "NOT_ACCEPTED" });
    db.salesApplication.findUnique.mockResolvedValueOnce({ status: "ACCEPTED", salesRepId: "rep_9" });
    expect(await admin.convertSalesApplication("app_1", DIRECTOR)).toEqual({ ok: false, reason: "ALREADY_CONVERTED", salesRepId: "rep_9" });
    db.salesRep.findUnique.mockResolvedValueOnce({ id: "rep_existing" });
    expect(await admin.convertSalesApplication("app_1", DIRECTOR)).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    expect(mocks.createSalesRep).not.toHaveBeenCalled();
  });
});

describe("le CV", () => {
  it("lu par le directeur : l'audit est à son nom, sans le contenu", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ cvKey: "sales-applications/app_1/cv.pdf", cvFileName: "cv.pdf", firstName: "Marie", lastName: "Dupont" });
    mocks.getStorageProvider.mockReturnValue({ read: async () => new TextEncoder().encode("%PDF-1.7 abc") });
    const result = await admin.readSalesApplicationCv("app_1", DIRECTOR);
    expect(result).toMatchObject({ ok: true, fileName: "cv.pdf" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales_application.cv_downloaded", entityType: "SalesApplication", entityId: "app_1", salesDirectorId: "dir_1", metadata: { sizeBytes: 12 } });
  });

  it("une clé altérée (celle d'une autre candidature) ne livre rien, même au directeur", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ cvKey: "sales-applications/app_2/cv.pdf", cvFileName: "cv.pdf", firstName: "M", lastName: "D" });
    expect(await admin.readSalesApplicationCv("app_1", DIRECTOR)).toEqual({ ok: false, reason: "NO_CV" });
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("l'historique", () => {
  const event = (id: string, platformAdminId: string | null) => ({ id, kind: "NOTE", fromStatus: null, toStatus: null, note: `Note ${id}`, platformAdminId, createdAt: new Date(`2026-10-0${id}T09:00:00Z`) });
  const stored = (events: unknown[], overrides: Record<string, unknown> = {}) => ({
    id: "app_1", status: "ACCEPTED", firstName: "Marie", lastName: "Dupont", email: "marie@exemple.fr", phone: "0", city: "Lyon", salesExperience: "x", healthExperience: null, currentStatus: "OTHER", zone: "Rhône", message: "m",
    consentAt: new Date("2026-10-01T09:00:00Z"), cvKey: null, cvFileName: null, cvSizeBytes: null, salesRepId: null, acknowledgedAt: null, createdAt: new Date("2026-10-01T09:00:00Z"), updatedAt: new Date(), salesRep: null, events, ...overrides,
  });

  it("nomme l'auteur de chaque note : administrateur ou directeur, chacun cherché dans sa table", async () => {
    db.salesApplication.findUnique.mockResolvedValue(stored([event("2", "adm_1"), event("3", "director:dir_1")]));
    db.platformAdmin.findMany.mockResolvedValue([{ id: "adm_1", firstName: "Alice", lastName: "Admin" }]);
    db.salesDirector.findMany.mockResolvedValue([{ id: "dir_1", firstName: "Diane", lastName: "Directrice" }]);

    const detail = await admin.getSalesApplication("app_1");

    const notes = detail?.timeline.filter((entry) => entry.kind === "note");
    expect(notes?.map((entry) => entry.actor)).toEqual(["Alice Admin", "Diane Directrice"]);
    expect(db.platformAdmin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["adm_1"] } } }));
    expect(db.salesDirector.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["dir_1"] } } }));
  });

  it("n'interroge que les tables nécessaires", async () => {
    db.salesApplication.findUnique.mockResolvedValue(stored([event("2", "director:dir_1")]));
    db.salesDirector.findMany.mockResolvedValue([]);
    await admin.getSalesApplication("app_1");
    expect(db.platformAdmin.findMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    db.salesApplication.findUnique.mockResolvedValue(stored([event("2", "adm_1")]));
    db.platformAdmin.findMany.mockResolvedValue([]);
    await admin.getSalesApplication("app_1");
    expect(db.salesDirector.findMany).not.toHaveBeenCalled();
  });

  it("un directeur supprimé : l'événement reste, sans nom inventé", async () => {
    db.salesApplication.findUnique.mockResolvedValue(stored([event("2", "director:dir_gone")]));
    db.salesDirector.findMany.mockResolvedValue([]);
    const detail = await admin.getSalesApplication("app_1");
    expect(detail?.timeline.find((entry) => entry.kind === "note")?.actor).toBeNull();
  });

  it("le lien vers le commercial créé suit la page d'où on regarde : console par défaut, directeur sur demande", async () => {
    const converted = { id: "e9", kind: "CONVERTED", fromStatus: null, toStatus: null, note: "Commercial créé.", platformAdminId: "director:dir_1", createdAt: new Date("2026-10-07T09:00:00Z") };
    db.salesApplication.findUnique.mockResolvedValue(stored([converted], { salesRepId: "rep_9", salesRep: { id: "rep_9", firstName: "Marie", lastName: "Dupont", isActive: true } }));
    db.salesDirector.findMany.mockResolvedValue([{ id: "dir_1", firstName: "Diane", lastName: "Directrice" }]);

    const forConsole = await admin.getSalesApplication("app_1");
    const forDirector = await admin.getSalesApplication("app_1", { repBasePath: "/directeur/commerciaux" });

    expect(forConsole?.timeline.at(-1)?.href).toBe("/admin/commerciaux/rep_9");
    expect(forDirector?.timeline.at(-1)?.href).toBe("/directeur/commerciaux/rep_9");
  });
});
