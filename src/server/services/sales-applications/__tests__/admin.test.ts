import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les candidatures commerciales côté console : liste, historique, statut,
 * notes, transformation en commercial, CV. Ni base, ni e-mail, ni stockage :
 * tout ce qui sort du processus est simulé (l'e-mail local est réel, aucun
 * test ne doit jamais l'envoyer).
 */

const db = vi.hoisted(() => ({
  salesApplication: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  salesApplicationEvent: { create: vi.fn() },
  salesRep: { findUnique: vi.fn(), delete: vi.fn() },
  platformAdmin: { findMany: vi.fn() },
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
const { formatPriceEuros } = await import("@/core/pricing/official-offer");

const ADMIN_ID = "adm_1";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
  mocks.getStandardCommissionCents.mockResolvedValue(25000);
});

// ---------------------------------------------------------------- Liste

describe("la recherche", () => {
  it("ne filtre rien sans mot, et exige chaque mot dans le prénom, le nom, l'e-mail ou la ville", () => {
    expect(admin.searchWhere("")).toEqual({});
    expect(admin.searchWhere("   ")).toEqual({});
    const where = admin.searchWhere("  dupont   lyon ");
    expect(where.AND).toHaveLength(2);
    expect(where.AND).toEqual([
      {
        OR: [
          { firstName: { contains: "dupont", mode: "insensitive" } },
          { lastName: { contains: "dupont", mode: "insensitive" } },
          { email: { contains: "dupont", mode: "insensitive" } },
          { city: { contains: "dupont", mode: "insensitive" } },
        ],
      },
      expect.objectContaining({ OR: expect.any(Array) }),
    ]);
  });

  it("borne le nombre de mots", () => {
    expect((admin.searchWhere("a b c d e f g h").AND as unknown[]).length).toBe(5);
  });
});

describe("la liste", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "app_1",
    createdAt: new Date("2026-10-04T09:00:00Z"),
    firstName: "Marie",
    lastName: "Dupont",
    email: "marie@exemple.fr",
    city: "Lyon",
    zone: "Rhône",
    status: "NEW",
    cvKey: null,
    salesRepId: null,
    ...overrides,
  });

  it("les compteurs sont réels (zéro pour un statut absent), la liste est la plus récente d'abord", async () => {
    db.salesApplication.count.mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    db.salesApplication.groupBy.mockResolvedValue([
      { status: "NEW", _count: { _all: 3 } },
      { status: "ACCEPTED", _count: { _all: 1 } },
    ]);
    db.salesApplication.findMany.mockResolvedValue([row({ cvKey: "sales-applications/app_1/cv.pdf" }), row({ id: "app_2", salesRepId: "rep_1", status: "ACCEPTED" })]);

    const list = await admin.listSalesApplications({ status: null, q: "", page: 1 });

    expect(list.counts).toEqual({ NEW: 3, TO_CONTACT: 0, INTERVIEW: 0, ACCEPTED: 1, REFUSED: 0 });
    expect(list.total).toBe(4);
    expect(list.grandTotal).toBe(7);
    expect(list.filteredTotal).toBe(2);
    expect(list.rows.map((r) => [r.id, r.hasCv, r.converted])).toEqual([
      ["app_1", true, false],
      ["app_2", false, true],
    ]);
    expect(db.salesApplication.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 0, take: admin.SALES_APPLICATIONS_PAGE_SIZE }));
    // La liste ne livre jamais la clé de stockage du CV.
    expect(JSON.stringify(list.rows)).not.toContain("sales-applications/");
  });

  it("le statut filtre la liste mais pas les compteurs ; la recherche filtre les deux", async () => {
    db.salesApplication.count.mockResolvedValue(0);
    db.salesApplication.groupBy.mockResolvedValue([]);
    db.salesApplication.findMany.mockResolvedValue([]);

    await admin.listSalesApplications({ status: "INTERVIEW", q: "lyon", page: 1 });

    const search = admin.searchWhere("lyon");
    expect(db.salesApplication.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...search, status: "INTERVIEW" } }));
    expect(db.salesApplication.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: search }));
  });

  it("pagine : une page trop haute ou invalide revient dans les bornes", async () => {
    db.salesApplication.count.mockResolvedValue(60);
    db.salesApplication.groupBy.mockResolvedValue([{ status: "NEW", _count: { _all: 60 } }]);
    db.salesApplication.findMany.mockResolvedValue([]);

    const high = await admin.listSalesApplications({ status: null, q: "", page: 99 });
    expect(high.pageCount).toBe(3);
    expect(high.page).toBe(3);
    expect(db.salesApplication.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 50, take: 25 }));

    const low = await admin.listSalesApplications({ status: null, q: "", page: -4 });
    expect(low.page).toBe(1);
    const nan = await admin.listSalesApplications({ status: null, q: "", page: Number.NaN });
    expect(nan.page).toBe(1);
  });

  it("sans aucune candidature : une seule page, des compteurs à zéro", async () => {
    db.salesApplication.count.mockResolvedValue(0);
    db.salesApplication.groupBy.mockResolvedValue([]);
    db.salesApplication.findMany.mockResolvedValue([]);
    const list = await admin.listSalesApplications({ status: null, q: "", page: 1 });
    expect(list).toMatchObject({ rows: [], total: 0, grandTotal: 0, filteredTotal: 0, page: 1, pageCount: 1 });
  });
});

// ---------------------------------------------------------------- Fiche

describe("l'historique", () => {
  const application = { id: "app_1", createdAt: new Date("2026-10-04T09:00:00Z"), acknowledgedAt: new Date("2026-10-04T09:00:05Z"), salesRepId: null as string | null };
  const event = (id: string, kind: string, at: string, extra: Record<string, unknown> = {}) => ({ id, kind, fromStatus: null, toStatus: null, note: null, platformAdminId: null, createdAt: new Date(at), ...extra });

  it("du plus ancien au plus récent : réception, accusé, puis les gestes, avec leur auteur", () => {
    const timeline = admin.buildApplicationTimeline(
      application,
      [
        event("e3", "NOTE", "2026-10-06T10:00:00Z", { note: "Rappelé, intéressé.", platformAdminId: "adm_1" }),
        event("e2", "STATUS_CHANGED", "2026-10-05T10:00:00Z", { fromStatus: "NEW", toStatus: "TO_CONTACT", platformAdminId: "adm_1" }),
        event("e1", "CREATED", "2026-10-04T09:00:00Z"),
      ],
      new Map([["adm_1", "Alice Admin"]]),
    );
    expect(timeline.map((entry) => entry.title)).toEqual(["Candidature reçue depuis le site", "Accusé de réception envoyé au candidat", "Statut : Nouvelle → À contacter", "Note interne"]);
    expect(timeline[2]).toMatchObject({ actor: "Alice Admin", tone: "warning" });
    expect(timeline[3]).toMatchObject({ kind: "note", detail: "Rappelé, intéressé.", actor: "Alice Admin" });
  });

  it("sans événement de création, la réception vient de la date de la candidature ; sans accusé, aucune ligne d'accusé", () => {
    const timeline = admin.buildApplicationTimeline({ ...application, acknowledgedAt: null }, [], new Map());
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ title: "Candidature reçue depuis le site", at: application.createdAt });
  });

  it("n'ajoute pas une seconde réception quand l'événement de création existe", () => {
    const timeline = admin.buildApplicationTimeline({ ...application, acknowledgedAt: null }, [event("e1", "CREATED", "2026-10-04T09:00:00Z")], new Map());
    expect(timeline).toHaveLength(1);
  });

  it("la création du commercial renvoie vers sa fiche", () => {
    const timeline = admin.buildApplicationTimeline({ ...application, salesRepId: "rep_9" }, [event("e4", "CONVERTED", "2026-10-07T10:00:00Z", { note: "Commercial créé : Marie Dupont." })], new Map());
    expect(timeline.at(-1)).toMatchObject({ kind: "commercial", title: "Transformée en commercial", href: "/admin/commerciaux/rep_9", tone: "success" });
  });
});

describe("la fiche", () => {
  const full = (overrides: Record<string, unknown> = {}) => ({
    id: "app_1",
    status: "ACCEPTED",
    firstName: "Marie",
    lastName: "Dupont",
    email: "marie@exemple.fr",
    phone: "06 12 34 56 78",
    city: "Lyon",
    salesExperience: "Dix ans de vente.",
    healthExperience: null,
    currentStatus: "FREELANCE",
    zone: "Rhône",
    message: "Je veux rejoindre l'équipe.",
    consentAt: new Date("2026-10-04T09:00:00Z"),
    cvKey: "sales-applications/app_1/cv.pdf",
    cvFileName: "cv-marie.pdf",
    cvSizeBytes: 2048,
    salesRepId: null,
    acknowledgedAt: null,
    createdAt: new Date("2026-10-04T09:00:00Z"),
    updatedAt: new Date("2026-10-04T09:00:00Z"),
    salesRep: null,
    events: [{ id: "e1", kind: "NOTE", fromStatus: null, toStatus: null, note: "Bon profil.", platformAdminId: "adm_1", createdAt: new Date("2026-10-05T09:00:00Z") }],
    ...overrides,
  });

  it("introuvable : null", async () => {
    db.salesApplication.findUnique.mockResolvedValue(null);
    expect(await admin.getSalesApplication("nope")).toBeNull();
  });

  it("rend la candidature complète, l'auteur des notes, et ne livre pas la clé de stockage du CV", async () => {
    db.salesApplication.findUnique.mockResolvedValue(full());
    db.platformAdmin.findMany.mockResolvedValue([{ id: "adm_1", firstName: "Alice", lastName: "Admin" }]);

    const detail = await admin.getSalesApplication("app_1");

    expect(detail).toMatchObject({ id: "app_1", status: "ACCEPTED", firstName: "Marie", city: "Lyon", cv: { fileName: "cv-marie.pdf", sizeBytes: 2048 }, salesRep: null });
    expect(detail?.timeline.find((entry) => entry.kind === "note")?.actor).toBe("Alice Admin");
    expect(JSON.stringify(detail)).not.toContain("sales-applications/app_1");
    expect(db.platformAdmin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["adm_1"] } } }));
  });

  it("sans CV : cv est null ; avec un commercial lié : son nom et son état", async () => {
    db.salesApplication.findUnique.mockResolvedValue(full({ cvKey: null, cvFileName: null, cvSizeBytes: null, events: [], salesRepId: "rep_1", salesRep: { id: "rep_1", firstName: "Marie", lastName: "Dupont", isActive: true } }));
    const detail = await admin.getSalesApplication("app_1");
    expect(detail?.cv).toBeNull();
    expect(detail?.salesRep).toEqual({ id: "rep_1", name: "Marie Dupont", isActive: true });
    expect(db.platformAdmin.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Statut

describe("changer le statut", () => {
  it("introuvable, déjà dans ce statut, déjà converti : rien n'est écrit", async () => {
    db.salesApplication.findUnique.mockResolvedValueOnce(null);
    expect(await admin.moveSalesApplication("nope", "INTERVIEW", ADMIN_ID)).toEqual({ ok: false, reason: "NOT_FOUND" });

    db.salesApplication.findUnique.mockResolvedValueOnce({ status: "NEW", salesRepId: null });
    expect(await admin.moveSalesApplication("app_1", "NEW", ADMIN_ID)).toEqual({ ok: false, reason: "SAME_STATUS" });

    db.salesApplication.findUnique.mockResolvedValueOnce({ status: "ACCEPTED", salesRepId: "rep_1" });
    expect(await admin.moveSalesApplication("app_1", "REFUSED", ADMIN_ID)).toEqual({ ok: false, reason: "CONVERTED" });

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.salesApplicationEvent.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("change le statut, écrit l'événement et l'audit avec l'avant et l'après (sans donnée personnelle)", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "NEW", salesRepId: null });
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });

    const result = await admin.moveSalesApplication("app_1", "TO_CONTACT", ADMIN_ID);

    expect(result).toEqual({ ok: true, from: "NEW", to: "TO_CONTACT" });
    // Conditionné au statut lu : deux gestes simultanés ne s'écrasent pas.
    expect(db.salesApplication.updateMany).toHaveBeenCalledWith({ where: { id: "app_1", status: "NEW", salesRepId: null }, data: { status: "TO_CONTACT" } });
    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: { applicationId: "app_1", kind: "STATUS_CHANGED", fromStatus: "NEW", toStatus: "TO_CONTACT", platformAdminId: ADMIN_ID } });
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "sales_application.status_changed",
      entityType: "SalesApplication",
      entityId: "app_1",
      platformAdminId: ADMIN_ID,
      metadata: { before: { status: "NEW" }, after: { status: "TO_CONTACT" } },
    });
  });

  it("si la candidature a changé entre la lecture et l'écriture : conflit, ni événement ni audit", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "NEW", salesRepId: null });
    db.salesApplication.updateMany.mockResolvedValue({ count: 0 });
    expect(await admin.moveSalesApplication("app_1", "REFUSED", ADMIN_ID)).toEqual({ ok: false, reason: "CONFLICT" });
    expect(db.salesApplicationEvent.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("on peut rouvrir une candidature refusée", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ status: "REFUSED", salesRepId: null });
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });
    expect(await admin.moveSalesApplication("app_1", "NEW", ADMIN_ID)).toEqual({ ok: true, from: "REFUSED", to: "NEW" });
  });
});

// ---------------------------------------------------------------- Notes

describe("ajouter une note", () => {
  it("candidature introuvable : rien n'est écrit", async () => {
    db.salesApplication.findUnique.mockResolvedValue(null);
    expect(await admin.addSalesApplicationNote("nope", "Bonjour", ADMIN_ID)).toEqual({ ok: false });
    expect(db.salesApplicationEvent.create).not.toHaveBeenCalled();
  });

  it("écrit l'événement NOTE de l'administrateur ; l'audit ne garde que la longueur, jamais le texte", async () => {
    db.salesApplication.findUnique.mockResolvedValue({ id: "app_1" });
    db.salesApplicationEvent.create.mockResolvedValue({ id: "evt_1" });

    const text = "Appelée : très motivée, 06 12 34 56 78";
    expect(await admin.addSalesApplicationNote("app_1", text, ADMIN_ID)).toEqual({ ok: true, eventId: "evt_1" });

    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({ data: { applicationId: "app_1", kind: "NOTE", note: text, platformAdminId: ADMIN_ID }, select: { id: true } });
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "sales_application.note_added", entityId: "app_1", platformAdminId: ADMIN_ID, metadata: { eventId: "evt_1", length: text.length } });
    expect(JSON.stringify(audit)).not.toContain("motivée");
  });
});

// ---------------------------------------------------------------- Transformer en commercial

describe("transformer en commercial", () => {
  const accepted = (overrides: Record<string, unknown> = {}) => ({ status: "ACCEPTED", salesRepId: null, firstName: "Marie", lastName: "Dupont", email: "Marie@Exemple.fr", phone: "06 12 34 56 78", zone: "Rhône et Isère", ...overrides });

  beforeEach(() => {
    db.salesApplication.findUnique.mockResolvedValue(accepted());
    db.salesRep.findUnique.mockResolvedValue(null);
    db.salesApplication.updateMany.mockResolvedValue({ count: 1 });
    mocks.createSalesRep.mockResolvedValue({ id: "rep_1" });
    mocks.sendSalesInvitation.mockResolvedValue({ status: "SENT", detail: "envoyé" });
  });

  it("crée le commercial avec les données de la candidature et la commission FIXE standard, le lie, écrit l'événement et l'audit", async () => {
    const result = await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: true });

    expect(result).toEqual({ ok: true, salesRepId: "rep_1", name: "Marie Dupont", commissionCents: 25000, invitation: { status: "SENT", detail: "envoyé" } });
    expect(mocks.createSalesRep).toHaveBeenCalledTimes(1);
    expect(mocks.createSalesRep).toHaveBeenCalledWith({ firstName: "Marie", lastName: "Dupont", email: "marie@exemple.fr", phone: "06 12 34 56 78", zone: "Rhône et Isère", commissionType: "FIXED", commissionValue: 25000 }, ADMIN_ID);
    expect(db.salesApplication.updateMany).toHaveBeenCalledWith({ where: { id: "app_1", status: "ACCEPTED", salesRepId: null }, data: { salesRepId: "rep_1" } });
    expect(db.salesApplicationEvent.create).toHaveBeenCalledWith({
      data: { applicationId: "app_1", kind: "CONVERTED", note: `Commercial créé : Marie Dupont. Commission fixe de ${formatPriceEuros(25000)} par pharmacie activée.`, platformAdminId: ADMIN_ID },
    });
    expect(mocks.sendSalesInvitation).toHaveBeenCalledWith("rep_1", ADMIN_ID);
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toEqual({
      action: "sales_application.converted",
      entityType: "SalesApplication",
      entityId: "app_1",
      platformAdminId: ADMIN_ID,
      metadata: { salesRepId: "rep_1", commissionType: "FIXED", commissionCents: 25000, invitation: "SENT" },
    });
    expect(JSON.stringify(audit)).not.toContain("exemple.fr");
  });

  it("la commission est celle du réglage de la console, pas un montant figé dans le code", async () => {
    mocks.getStandardCommissionCents.mockResolvedValue(30000);
    await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: false });
    expect(mocks.createSalesRep).toHaveBeenCalledWith(expect.objectContaining({ commissionType: "FIXED", commissionValue: 30000 }), ADMIN_ID);
  });

  it("l'invitation est envoyée par défaut ; sans invitation, aucun e-mail ne part", async () => {
    await admin.convertSalesApplication("app_1", ADMIN_ID);
    expect(mocks.sendSalesInvitation).toHaveBeenCalledTimes(1);

    mocks.sendSalesInvitation.mockClear();
    db.salesApplication.findUnique.mockResolvedValue(accepted());
    const result = await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: false });
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, invitation: null });
    expect(mocks.recordAudit.mock.calls.at(-1)?.[0].metadata.invitation).toBe("NOT_REQUESTED");
  });

  it("une invitation qui échoue n'annule pas le commercial créé : elle est dite", async () => {
    mocks.sendSalesInvitation.mockRejectedValue(new Error("SMTP indisponible"));
    const result = await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: true });
    expect(result).toMatchObject({ ok: true, salesRepId: "rep_1", invitation: { status: "FAILED" } });
    expect(mocks.recordAudit.mock.calls[0][0].metadata.invitation).toBe("FAILED");
  });

  it("une invitation non envoyée par le prestataire est rendue telle quelle", async () => {
    mocks.sendSalesInvitation.mockResolvedValue({ status: "SIMULATED", detail: "messagerie non branchée" });
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: true })).toMatchObject({ ok: true, invitation: { status: "SIMULATED", detail: "messagerie non branchée" } });
  });

  it("candidature introuvable ou pas acceptée : rien n'est créé", async () => {
    db.salesApplication.findUnique.mockResolvedValueOnce(null);
    expect(await admin.convertSalesApplication("nope", ADMIN_ID)).toEqual({ ok: false, reason: "NOT_FOUND" });

    for (const status of ["NEW", "TO_CONTACT", "INTERVIEW", "REFUSED"]) {
      db.salesApplication.findUnique.mockResolvedValueOnce(accepted({ status }));
      expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "NOT_ACCEPTED" });
    }
    expect(mocks.createSalesRep).not.toHaveBeenCalled();
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("idempotent : une candidature déjà convertie ne crée jamais un second commercial", async () => {
    // Premier geste : le commercial est créé.
    expect((await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: false })).ok).toBe(true);
    // Second geste (double clic, autre onglet) : la candidature porte maintenant son commercial.
    db.salesApplication.findUnique.mockResolvedValue(accepted({ salesRepId: "rep_1" }));
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: false })).toEqual({ ok: false, reason: "ALREADY_CONVERTED", salesRepId: "rep_1" });
    expect(mocks.createSalesRep).toHaveBeenCalledTimes(1);
    expect(db.salesApplicationEvent.create).toHaveBeenCalledTimes(1);
  });

  it("refuse si l'adresse est déjà celle d'un commercial, sans rien créer", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_existing" });
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    expect(db.salesRep.findUnique).toHaveBeenCalledWith({ where: { email: "marie@exemple.fr" }, select: { id: true } });
    expect(mocks.createSalesRep).not.toHaveBeenCalled();
    expect(db.salesApplication.updateMany).not.toHaveBeenCalled();
  });

  it("deux gestes simultanés : l'adresse est le verrou, le perdant constate le résultat du gagnant", async () => {
    mocks.createSalesRep.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    // Le gagnant a déjà lié son commercial.
    db.salesApplication.findUnique.mockResolvedValueOnce(accepted()).mockResolvedValueOnce({ salesRepId: "rep_winner" });
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "ALREADY_CONVERTED", salesRepId: "rep_winner" });

    // Ou bien l'adresse a été prise par un autre commercial entre-temps.
    db.salesApplication.findUnique.mockResolvedValueOnce(accepted()).mockResolvedValueOnce({ salesRepId: null });
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    expect(db.salesApplicationEvent.create).not.toHaveBeenCalled();
  });

  it("une autre erreur de la base remonte, elle n'est pas confondue avec un doublon", async () => {
    mocks.createSalesRep.mockRejectedValue(new Error("connexion perdue"));
    await expect(admin.convertSalesApplication("app_1", ADMIN_ID)).rejects.toThrow("connexion perdue");
  });

  it("si la candidature a changé pendant la création, le compte tout juste créé est défait et rien n'est enregistré", async () => {
    db.salesApplication.updateMany.mockResolvedValue({ count: 0 });
    db.salesRep.delete.mockResolvedValue({});
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "CONFLICT" });
    expect(db.salesRep.delete).toHaveBeenCalledWith({ where: { id: "rep_1" } });
    expect(db.salesApplicationEvent.create).not.toHaveBeenCalled();
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("même validation que « Nouveau commercial » : une adresse ou un nom inutilisable est refusé avant toute création", async () => {
    db.salesApplication.findUnique.mockResolvedValueOnce(accepted({ email: "pas-une-adresse" }));
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toMatchObject({ ok: false, reason: "INVALID" });
    db.salesApplication.findUnique.mockResolvedValueOnce(accepted({ firstName: "   " }));
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toMatchObject({ ok: false, reason: "INVALID" });
    db.salesApplication.findUnique.mockResolvedValueOnce(accepted({ lastName: "x".repeat(81) }));
    expect(await admin.convertSalesApplication("app_1", ADMIN_ID)).toMatchObject({ ok: false, reason: "INVALID" });
    expect(mocks.createSalesRep).not.toHaveBeenCalled();
  });

  it("un téléphone ou une zone plus longs que la fiche d'un commercial sont tronqués, pas refusés", async () => {
    db.salesApplication.findUnique.mockResolvedValue(accepted({ phone: "0".repeat(50), zone: "z".repeat(300) }));
    await admin.convertSalesApplication("app_1", ADMIN_ID, { invite: false });
    const input = mocks.createSalesRep.mock.calls[0][0];
    expect(input.phone).toHaveLength(30);
    expect(input.zone).toHaveLength(120);
  });
});

// ---------------------------------------------------------------- CV

describe("le nom du fichier téléchargé", () => {
  it("garde un nom lisible et toujours en .pdf", () => {
    expect(admin.cvDownloadName("CV Marie Dupont.pdf", "Marie", "Dupont")).toBe("CV Marie Dupont.pdf");
    expect(admin.cvDownloadName("cv-élodie", "Élodie", "Martin")).toBe("cv-élodie.pdf");
  });

  it("retire chemin, guillemets, retours à la ligne et points de tête", () => {
    const name = admin.cvDownloadName('../../etc/passwd"\r\nX-Evil: 1.pdf', "A", "B");
    expect(name).not.toMatch(/[\\/"\r\n]/);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(admin.cvDownloadName("...pdf", "A", "B").startsWith(".")).toBe(false);
  });

  it("sans nom exploitable : « CV Prénom Nom.pdf »", () => {
    expect(admin.cvDownloadName(null, "Marie", "Dupont")).toBe("CV Marie Dupont.pdf");
    expect(admin.cvDownloadName("///", "Marie", "Dupont")).toBe("CV Marie Dupont.pdf");
    expect(admin.cvDownloadName("", "", "")).toBe("CV.pdf");
  });

  it("l'en-tête de téléchargement : pièce jointe, nom ASCII de repli, nom complet encodé", () => {
    const header = admin.attachmentDisposition("CV Élodie Martin.pdf");
    expect(header).toBe(`attachment; filename="CV Elodie Martin.pdf"; filename*=UTF-8''CV%20%C3%89lodie%20Martin.pdf`);
    expect(admin.attachmentDisposition("a'b(c).pdf")).toContain("filename*=UTF-8''a%27b%28c%29.pdf");
  });
});

describe("lire le CV", () => {
  const read = vi.fn();
  const app = (overrides: Record<string, unknown> = {}) => ({ cvKey: "sales-applications/app_1/cv.pdf", cvFileName: "cv-marie.pdf", firstName: "Marie", lastName: "Dupont", ...overrides });

  beforeEach(() => {
    read.mockReset();
    mocks.getStorageProvider.mockReturnValue({ read });
  });

  it("introuvable ou sans CV : rien n'est lu ni tracé", async () => {
    db.salesApplication.findUnique.mockResolvedValueOnce(null);
    expect(await admin.readSalesApplicationCv("nope", ADMIN_ID)).toEqual({ ok: false, reason: "NOT_FOUND" });
    db.salesApplication.findUnique.mockResolvedValueOnce(app({ cvKey: null }));
    expect(await admin.readSalesApplicationCv("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "NO_CV" });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une clé qui n'est pas celle de cette candidature n'est jamais lue (pas d'accès au fichier d'une autre officine)", async () => {
    for (const cvKey of ["pharmacy_9/ordonnance.pdf", "sales-applications/app_2/cv.pdf", "sales-applications/app_1/../../pharmacy_9/x.pdf"]) {
      db.salesApplication.findUnique.mockResolvedValueOnce(app({ cvKey }));
      expect(await admin.readSalesApplicationCv("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "NO_CV" });
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("stockage indisponible ou fichier absent : dit proprement", async () => {
    db.salesApplication.findUnique.mockResolvedValue(app());
    mocks.getStorageProvider.mockImplementationOnce(() => {
      throw new Error("stockage mal configuré");
    });
    expect(await admin.readSalesApplicationCv("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "STORAGE_UNAVAILABLE" });
    read.mockResolvedValueOnce(null);
    expect(await admin.readSalesApplicationCv("app_1", ADMIN_ID)).toEqual({ ok: false, reason: "FILE_MISSING" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("rend le fichier et trace le téléchargement (taille seulement, aucune donnée personnelle)", async () => {
    db.salesApplication.findUnique.mockResolvedValue(app());
    const bytes = new TextEncoder().encode("%PDF-1.7 contenu");
    read.mockResolvedValue(bytes);

    const result = await admin.readSalesApplicationCv("app_1", ADMIN_ID);

    expect(result).toEqual({ ok: true, bytes, fileName: "cv-marie.pdf" });
    expect(read).toHaveBeenCalledWith("sales-applications/app_1/cv.pdf");
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales_application.cv_downloaded", entityType: "SalesApplication", entityId: "app_1", platformAdminId: ADMIN_ID, metadata: { sizeBytes: bytes.length } });
  });
});
