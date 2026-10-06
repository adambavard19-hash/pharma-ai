import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'équipe commerciale côté directeur : liste, fiche, ajout, modification,
 * désactivation, invitation, suppression, réaffectation. Ni base, ni e-mail :
 * tout ce qui sort du processus est simulé (l'e-mail local est réel, aucun test
 * ne doit jamais l'envoyer).
 */

const db = vi.hoisted(() => ({
  salesRep: { findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  prospect: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  prospectEvent: { findMany: vi.fn(), groupBy: vi.fn() },
  auditLog: { findMany: vi.fn(), groupBy: vi.fn() },
  salesTask: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  commission: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  salesInvoice: { count: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  recordProspectEvent: vi.fn(),
  notifySalesRep: vi.fn(),
  createSalesRep: vi.fn(),
  sendSalesInvitation: vi.fn(),
  updateSalesRep: vi.fn(),
  salesRepStats: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../events", () => ({ recordProspectEvent: mocks.recordProspectEvent }));
vi.mock("../notifications", () => ({ notifySalesRep: mocks.notifySalesRep }));
vi.mock("../reps", () => ({ createSalesRep: mocks.createSalesRep, sendSalesInvitation: mocks.sendSalesInvitation, updateSalesRep: mocks.updateSalesRep, salesRepStats: mocks.salesRepStats }));

const team = await import("../director-team");

const DIRECTOR = { id: "dir_1", label: "Diane Directrice" };
const ACTOR = { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" };
const NOW = new Date("2026-10-15T10:00:00Z");

const rep = (overrides: Record<string, unknown> = {}) => ({
  id: "rep_1",
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie@exemple.fr",
  phone: null,
  zone: "Rhône",
  commissionType: "FIXED",
  commissionValue: 25000,
  isActive: true,
  invitedAt: null,
  lastLoginAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockResolvedValue([]);
});

// ---------------------------------------------------------------- Liste

describe("la liste de l'équipe", () => {
  it("chiffre chaque commercial : dossiers ouverts et activations du mois, comptés une fois par officine", async () => {
    db.salesRep.groupBy.mockResolvedValue([
      { isActive: true, _count: { _all: 2 } },
      { isActive: false, _count: { _all: 1 } },
    ]);
    db.salesRep.findMany.mockResolvedValue([rep(), rep({ id: "rep_2", firstName: "Paul", lastName: "Martin", email: "paul@exemple.fr", isActive: false })]);
    db.salesRep.count.mockResolvedValue(3);
    db.prospect.groupBy.mockResolvedValue([{ salesRepId: "rep_1", _count: { _all: 4 } }]);
    db.prospectEvent.findMany.mockResolvedValue([
      { prospectId: "p1", prospect: { salesRepId: "rep_1" } },
      { prospectId: "p1", prospect: { salesRepId: "rep_1" } }, // la même officine, deux fois : elle compte une fois
      { prospectId: "p2", prospect: { salesRepId: "rep_1" } },
      { prospectId: "p3", prospect: { salesRepId: "rep_2" } },
    ]);
    // La première activation de chaque officine : toutes dans le mois.
    db.prospectEvent.groupBy.mockResolvedValue([
      { prospectId: "p1", _min: { createdAt: new Date("2026-10-03T09:00:00Z") } },
      { prospectId: "p2", _min: { createdAt: new Date("2026-10-05T09:00:00Z") } },
      { prospectId: "p3", _min: { createdAt: new Date("2026-10-07T09:00:00Z") } },
    ]);

    const list = await team.listTeam({ q: "", status: null }, NOW);

    expect(list.counts).toEqual({ all: 3, active: 2, inactive: 1 });
    expect(list.grandTotal).toBe(3);
    expect(list.rows.map((row) => [row.id, row.openProspects, row.activationsThisMonth])).toEqual([
      ["rep_1", 4, 2],
      ["rep_2", 0, 1],
    ]);
    // Dossiers ouverts : ni activés ni perdus.
    expect(db.prospect.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: { in: ["rep_1", "rep_2"] }, status: { notIn: ["ACTIVATED", "LOST"] } } }));
    // Activations : passage à « Activé », dans le mois de Paris en cours (1er octobre 0 h, heure de Paris).
    expect(db.prospectEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "STATUS_CHANGED", createdAt: { gte: new Date("2026-09-30T22:00:00Z"), lt: NOW }, metadata: { path: ["to"], equals: "ACTIVATED" } }) }),
    );
  });

  it("une officine déjà activée avant le mois ne se recompte pas (première activation seulement)", async () => {
    db.salesRep.groupBy.mockResolvedValue([{ isActive: true, _count: { _all: 1 } }]);
    db.salesRep.findMany.mockResolvedValue([rep()]);
    db.salesRep.count.mockResolvedValue(1);
    db.prospect.groupBy.mockResolvedValue([]);
    db.prospectEvent.findMany.mockResolvedValue([
      { prospectId: "p1", prospect: { salesRepId: "rep_1" } },
      { prospectId: "p2", prospect: { salesRepId: "rep_1" } },
    ]);
    db.prospectEvent.groupBy.mockResolvedValue([
      { prospectId: "p1", _min: { createdAt: new Date("2026-08-03T09:00:00Z") } }, // activée en août, réactivée en octobre
      { prospectId: "p2", _min: { createdAt: new Date("2026-10-05T09:00:00Z") } },
    ]);
    const list = await team.listTeam({ q: "", status: null }, NOW);
    expect(list.rows[0].activationsThisMonth).toBe(1);
  });

  it("le filtre « inactifs » réduit la liste mais pas les compteurs ; la recherche réduit les deux", async () => {
    db.salesRep.groupBy.mockResolvedValue([]);
    db.salesRep.findMany.mockResolvedValue([]);
    db.salesRep.count.mockResolvedValue(5);

    const list = await team.listTeam({ q: "lyon", status: "inactifs" }, NOW);

    const call = db.salesRep.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(false);
    expect(call.where.AND).toHaveLength(1);
    expect(db.salesRep.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: expect.any(Array) } }));
    expect(list.grandTotal).toBe(5);
    expect(list.rows).toEqual([]);
    // Aucun commercial trouvé : aucune requête de dossiers inutile.
    expect(db.prospect.groupBy).not.toHaveBeenCalled();
    expect(db.prospectEvent.findMany).not.toHaveBeenCalled();
  });

  it("les dossiers sans commercial : ouverts seulement, comptés en entier", async () => {
    db.prospect.findMany.mockResolvedValue([
      { id: "p1", name: "Pharmacie du Port", city: "Nantes", status: "PROSPECT", createdAt: NOW, salesRep: null },
      { id: "p2", name: "Pharmacie du Parc", city: "Lyon", status: "DEMO_DONE", createdAt: NOW, salesRep: { firstName: "Paul", lastName: "Martin" } },
    ]);
    db.prospect.count.mockResolvedValue(12);
    const result = await team.listUnassignedProspects(5);
    expect(result.total).toBe(12);
    expect(result.rows.map((row) => [row.id, row.formerRepName])).toEqual([["p1", null], ["p2", "Paul Martin"]]);
    // Sans commercial, OU suivis par un commercial désactivé : un dossier ne reste pas enfermé chez quelqu'un qui ne peut plus le traiter.
    const where = { status: { notIn: ["ACTIVATED", "LOST"] }, OR: [{ salesRepId: null }, { salesRep: { isActive: false } }] };
    expect(db.prospect.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, take: 5 }));
    expect(db.prospect.count).toHaveBeenCalledWith({ where });
  });

  it("seuls les commerciaux actifs peuvent recevoir un dossier", async () => {
    db.salesRep.findMany.mockResolvedValue([{ id: "rep_1", firstName: "Marie", lastName: "Dupont" }]);
    expect(await team.listAssignableReps()).toEqual([{ id: "rep_1", name: "Marie Dupont" }]);
    expect(db.salesRep.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });
});

describe("les activations par commercial", () => {
  it("sans commercial, aucune requête", async () => {
    expect((await team.activationsByRep([], NOW, NOW)).size).toBe(0);
    expect(db.prospectEvent.findMany).not.toHaveBeenCalled();
  });

  it("ignore un événement dont le dossier n'a plus de commercial", async () => {
    db.prospectEvent.findMany.mockResolvedValue([{ prospectId: "p1", prospect: { salesRepId: null } }]);
    expect((await team.activationsByRep(["rep_1"], NOW, NOW)).size).toBe(0);
  });
});

// ---------------------------------------------------------------- Fiche

describe("la fiche d'un commercial", () => {
  it("un identifiant inconnu : rien", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    expect(await team.getTeamMember("rep_x")).toBeNull();
    expect(mocks.salesRepStats).not.toHaveBeenCalled();
  });

  it("l'identité, les chiffres et ce qui retient la suppression", async () => {
    db.salesRep.findUnique.mockResolvedValue({ ...rep(), createdAt: NOW });
    mocks.salesRepStats.mockResolvedValue({ prospects: 5 });
    db.prospect.count.mockResolvedValue(5);
    db.commission.count.mockResolvedValue(2);
    db.salesInvoice.count.mockResolvedValue(0);
    db.salesTask.count.mockResolvedValue(1);

    const overview = await team.getTeamMember("rep_1");

    expect(overview?.member.name).toBe("Marie Dupont");
    expect(overview?.footprint).toEqual({ prospects: 5, commissions: 2, invoices: 0, tasks: 1 });
    expect(overview?.deletionRefusal).toContain("Ce commercial a un historique");
    expect(overview?.deletionRefusal).toContain("5 dossiers, 2 commissions, 1 tâche");
    // La fiche ne livre jamais le hachage du mot de passe ni le jeton.
    expect(JSON.stringify(overview)).not.toMatch(/passwordHash|ResetToken/);
    expect(db.salesRep.findUnique.mock.calls[0][0].select).not.toHaveProperty("passwordHash");
  });

  it("le portefeuille : champs commerciaux seulement, jamais de contrat", async () => {
    db.prospect.findMany.mockResolvedValue([{ id: "p1", name: "Pharmacie du Port", city: "Nantes", status: "DEMO_DONE", nextActionAt: null, nextActionLabel: null, lastContactAt: NOW, monthlyPriceCents: 9900, blockedAt: NOW }]);
    const { prospects, truncated } = await team.getPortfolio("rep_1");
    expect(prospects[0]).toMatchObject({ id: "p1", status: "DEMO_DONE", blocked: true, monthlyPriceCents: 9900 });
    expect(truncated).toBe(false);
    const select = db.prospect.findMany.mock.calls[0][0].select;
    expect(Object.keys(select)).not.toContain("contracts");
    expect(db.prospect.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1" } }));
  });

  it("le portefeuille dit quand la liste est coupée", async () => {
    db.prospect.findMany.mockResolvedValue(Array.from({ length: team.PORTFOLIO_LIMIT + 1 }, (_, i) => ({ id: `p${i}`, name: "P", city: null, status: "PROSPECT", nextActionAt: null, nextActionLabel: null, lastContactAt: null, monthlyPriceCents: null, blockedAt: null })));
    const { prospects, truncated } = await team.getPortfolio("rep_1");
    expect(prospects).toHaveLength(team.PORTFOLIO_LIMIT);
    expect(truncated).toBe(true);
  });

  it("ce qu'il a fait : 30 jours, les événements posés par lui ou venus sur ses dossiers, jamais les contrats", async () => {
    db.prospectEvent.findMany.mockResolvedValue([]);
    db.salesTask.count.mockResolvedValue(7);
    db.salesTask.findMany.mockResolvedValue([{ id: "t1", label: "Rappeler", dueAt: new Date("2026-10-10T08:00:00Z"), prospect: { id: "p1", name: "Pharmacie du Port" } }]);
    db.prospect.count.mockResolvedValueOnce(2);
    // Trois démonstrations réalisées sur les 30 jours, lues dans l'audit : la première de chaque dossier.
    db.auditLog.findMany.mockResolvedValue([{ entityId: "p1" }, { entityId: "p2" }, { entityId: "p3" }]);
    db.prospect.findMany.mockResolvedValue([{ id: "p1", salesRepId: "rep_1" }, { id: "p2", salesRepId: "rep_1" }, { id: "p3", salesRepId: "rep_1" }]);
    db.auditLog.groupBy.mockResolvedValue([
      { entityId: "p1", _min: { createdAt: new Date("2026-10-01T09:00:00Z") } },
      { entityId: "p2", _min: { createdAt: new Date("2026-10-02T09:00:00Z") } },
      { entityId: "p3", _min: { createdAt: new Date("2026-10-03T09:00:00Z") } },
    ]);

    const activity = await team.getActivity("rep_1", NOW);

    expect(activity).toMatchObject({ tasksDone: 7, demosDone: 3, demosUpcoming: 2 });
    expect(activity.overdueTasks).toHaveLength(1);
    expect(activity.since.toISOString()).toBe("2026-09-15T10:00:00.000Z");
    const where = db.prospectEvent.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: activity.since });
    expect(where.type.in).not.toContain("CONTRACT_SENT");
    expect(where.type.in).not.toContain("EMAIL_SENT");
    expect(where.OR).toEqual([{ actorType: "SALES", actorId: "rep_1" }, { actorType: { not: "SALES" }, prospect: { salesRepId: "rep_1" } }]);
    // En retard : l'échéance est un jour de Paris déjà passé (avant minuit d'aujourd'hui).
    expect(db.salesTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1", doneAt: null, dueAt: { lt: new Date("2026-10-14T22:00:00Z") } } }));
  });

  it("ses commissions et ses factures, les plus récentes d'abord, et le dit quand la liste est coupée", async () => {
    db.commission.findMany.mockResolvedValue([{ id: "c1", amountCents: 25000, status: "PAYABLE", type: "FIXED", createdAt: NOW, paidAt: null, invoiceId: null, prospect: { name: "Pharmacie du Port" } }]);
    db.salesInvoice.findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => ({ id: `i${i}`, number: `F-${i}`, amountCents: 100, issuedAt: NOW, status: "RECEIVED", periodLabel: null })));
    const money = await team.getMoney("rep_1");
    expect(money.commissions).toEqual([expect.objectContaining({ id: "c1", prospectName: "Pharmacie du Port", amountCents: 25000 })]);
    expect(money.commissionsTruncated).toBe(false);
    expect(money.invoices).toHaveLength(30);
    expect(money.invoicesTruncated).toBe(true);
    // Toujours filtré sur CE commercial.
    expect(db.commission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1" } }));
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { salesRepId: "rep_1" } }));
  });
});

// ---------------------------------------------------------------- Ajouter

describe("ajouter un commercial", () => {
  const input = { firstName: "Marie", lastName: "Dupont", email: "  Marie@Exemple.FR ", phone: null, zone: "Rhône", commissionType: "FIXED" as const, commissionValue: 25000 };

  it("refuse une adresse déjà prise (casse et espaces ignorés), sans rien créer", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_existing" });
    expect(await team.createTeamMember(input, DIRECTOR, { invite: true })).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    expect(db.salesRep.findUnique).toHaveBeenCalledWith({ where: { email: "marie@exemple.fr" }, select: { id: true } });
    expect(mocks.createSalesRep).not.toHaveBeenCalled();
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
  });

  it("deux ajouts simultanés : l'adresse est le verrou, le perdant reçoit le même refus", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    mocks.createSalesRep.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect(await team.createTeamMember(input, DIRECTOR, { invite: true })).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    mocks.createSalesRep.mockRejectedValue(new Error("base indisponible"));
    await expect(team.createTeamMember(input, DIRECTOR, { invite: true })).rejects.toThrow("base indisponible");
  });

  it("crée avec l'acteur directeur de la session, puis envoie l'invitation et rend son issue telle quelle", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ invitedAt: null });
    mocks.createSalesRep.mockResolvedValue({ id: "rep_new" });
    mocks.sendSalesInvitation.mockResolvedValue({ status: "SENT", detail: "remis au prestataire" });

    const result = await team.createTeamMember(input, DIRECTOR, { invite: true });

    expect(result).toEqual({ ok: true, id: "rep_new", name: "Marie Dupont", invitation: { status: "SENT", detail: "remis au prestataire" } });
    expect(mocks.createSalesRep).toHaveBeenCalledWith(expect.objectContaining({ email: "marie@exemple.fr", commissionType: "FIXED", commissionValue: 25000, isActive: true }), ACTOR);
    expect(mocks.sendSalesInvitation).toHaveBeenCalledWith("rep_new", ACTOR);
    expect(db.salesRep.update).not.toHaveBeenCalled(); // envoyée : la date d'invitation reste
  });

  it("sans invitation demandée, rien n'est envoyé", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    mocks.createSalesRep.mockResolvedValue({ id: "rep_new" });
    const result = await team.createTeamMember(input, DIRECTOR, { invite: false });
    expect(result).toMatchObject({ ok: true, invitation: null });
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
  });

  it("un message qui ne part pas n'est jamais présenté comme envoyé : la date « invité le » est rendue comme elle était", async () => {
    for (const status of ["FAILED", "SIMULATED"]) {
      vi.clearAllMocks();
      db.salesRep.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ invitedAt: null });
      mocks.createSalesRep.mockResolvedValue({ id: "rep_new" });
      mocks.sendSalesInvitation.mockResolvedValue({ status, detail: "pas de prestataire" });
      db.salesRep.update.mockResolvedValue({});

      const result = await team.createTeamMember(input, DIRECTOR, { invite: true });

      expect(result).toMatchObject({ ok: true, invitation: { status, detail: "pas de prestataire" } });
      expect(db.salesRep.update).toHaveBeenCalledWith({ where: { id: "rep_new" }, data: { invitedAt: null } });
    }
  });

  it("si l'envoi lève une erreur, le commercial existe quand même et l'issue est « échec »", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ invitedAt: null });
    mocks.createSalesRep.mockResolvedValue({ id: "rep_new" });
    mocks.sendSalesInvitation.mockRejectedValue(new Error("Resend a répondu 500"));
    const result = await team.createTeamMember(input, DIRECTOR, { invite: true });
    expect(result).toMatchObject({ ok: true, id: "rep_new", invitation: { status: "FAILED" } });
    expect(JSON.stringify(result)).not.toContain("Resend a répondu 500");
  });
});

describe("une invitation qui n'est pas partie après une transformation de candidature", () => {
  it("ne laisse pas de date « invité le » à un commercial jamais connecté", async () => {
    db.salesRep.updateMany.mockResolvedValue({ count: 1 });
    await team.forgetUnsentInvitation("rep_9");
    expect(db.salesRep.updateMany).toHaveBeenCalledWith({ where: { id: "rep_9", lastLoginAt: null }, data: { invitedAt: null } });
  });
});

// ---------------------------------------------------------------- Modifier, désactiver, inviter

describe("modifier un commercial", () => {
  it("un identifiant inconnu est refusé sans écrire", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    expect(await team.updateTeamMember("rep_x", { zone: "Paris" }, DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(mocks.updateSalesRep).not.toHaveBeenCalled();
  });

  it("nettoie les champs, vide devient « aucun », et ne transmet que ce qui a changé, avec l'acteur directeur", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1" });
    expect(await team.updateTeamMember("rep_1", { firstName: " Marie ", phone: "  ", zone: " Lyon ", commissionType: "PERCENT", commissionValue: 1250 }, DIRECTOR)).toEqual({ ok: true });
    expect(mocks.updateSalesRep).toHaveBeenCalledWith("rep_1", { firstName: "Marie", phone: null, zone: "Lyon", commissionType: "PERCENT", commissionValue: 1250 }, ACTOR);
  });

  it("n'accepte jamais de changer l'e-mail ni l'activation par ce chemin", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1" });
    await team.updateTeamMember("rep_1", { zone: "Lyon", email: "pirate@exemple.fr", isActive: false } as never, DIRECTOR);
    expect(mocks.updateSalesRep).toHaveBeenCalledWith("rep_1", { zone: "Lyon" }, ACTOR);
  });
});

describe("désactiver et réactiver", () => {
  it("inconnu : refusé", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    expect(await team.setTeamMemberActive("rep_x", false, DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(mocks.updateSalesRep).not.toHaveBeenCalled();
  });

  it("désactive (le service révoque ses sessions) et dit combien de dossiers ouverts lui restent", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", isActive: true });
    db.prospect.count.mockResolvedValue(4);
    expect(await team.setTeamMemberActive("rep_1", false, DIRECTOR)).toEqual({ ok: true, changed: true, openProspects: 4 });
    expect(mocks.updateSalesRep).toHaveBeenCalledWith("rep_1", { isActive: false }, ACTOR);
    expect(db.prospect.count).toHaveBeenCalledWith({ where: { salesRepId: "rep_1", status: { notIn: ["ACTIVATED", "LOST"] } } });
  });

  it("déjà dans cet état : rien n'est écrit", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", isActive: false });
    db.prospect.count.mockResolvedValue(0);
    expect(await team.setTeamMemberActive("rep_1", false, DIRECTOR)).toEqual({ ok: true, changed: false, openProspects: 0 });
    expect(mocks.updateSalesRep).not.toHaveBeenCalled();
  });

  it("réactive", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", isActive: false });
    db.prospect.count.mockResolvedValue(0);
    await team.setTeamMemberActive("rep_1", true, DIRECTOR);
    expect(mocks.updateSalesRep).toHaveBeenCalledWith("rep_1", { isActive: true }, ACTOR);
  });
});

describe("renvoyer l'invitation", () => {
  it("inconnu ou désactivé : aucun e-mail", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "rep_1", isActive: false });
    expect(await team.resendTeamInvitation("rep_x", DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await team.resendTeamInvitation("rep_1", DIRECTOR)).toEqual({ ok: false, reason: "INACTIVE" });
    expect(mocks.sendSalesInvitation).not.toHaveBeenCalled();
  });

  it("envoie avec l'acteur directeur et rend l'issue", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce({ id: "rep_1", isActive: true }).mockResolvedValueOnce({ invitedAt: new Date("2026-10-01T09:00:00Z") });
    mocks.sendSalesInvitation.mockResolvedValue({ status: "SENT", detail: "ok" });
    expect(await team.resendTeamInvitation("rep_1", DIRECTOR)).toEqual({ ok: true, invitation: { status: "SENT", detail: "ok" } });
    expect(mocks.sendSalesInvitation).toHaveBeenCalledWith("rep_1", ACTOR);
  });

  it("un échec de renvoi garde l'ancienne date d'invitation", async () => {
    const earlier = new Date("2026-10-01T09:00:00Z");
    db.salesRep.findUnique.mockResolvedValueOnce({ id: "rep_1", isActive: true }).mockResolvedValueOnce({ invitedAt: earlier });
    mocks.sendSalesInvitation.mockResolvedValue({ status: "FAILED", detail: "boîte pleine" });
    db.salesRep.update.mockResolvedValue({});
    await team.resendTeamInvitation("rep_1", DIRECTOR);
    expect(db.salesRep.update).toHaveBeenCalledWith({ where: { id: "rep_1" }, data: { invitedAt: earlier } });
  });
});

// ---------------------------------------------------------------- Supprimer

describe("supprimer un commercial", () => {
  const footprint = (overrides: Record<string, number> = {}) => {
    const values = { prospects: 0, commissions: 0, invoices: 0, tasks: 0, ...overrides };
    db.prospect.count.mockResolvedValue(values.prospects);
    db.commission.count.mockResolvedValue(values.commissions);
    db.salesInvoice.count.mockResolvedValue(values.invoices);
    db.salesTask.count.mockResolvedValue(values.tasks);
  };

  it("inconnu : refusé", async () => {
    db.salesRep.findUnique.mockResolvedValue(null);
    expect(await team.deleteTeamMember("rep_x", DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(db.salesRep.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse tant qu'il reste un dossier, une commission, une facture OU une tâche : rien n'est effacé, rien n'est journalisé", async () => {
    for (const key of ["prospects", "commissions", "invoices", "tasks"]) {
      vi.clearAllMocks();
      db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", email: "marie@exemple.fr" });
      footprint({ [key]: 2 });
      const result = await team.deleteTeamMember("rep_1", DIRECTOR);
      expect(result).toMatchObject({ ok: false, reason: "HAS_HISTORY" });
      expect(!result.ok && "message" in result && result.message).toContain("Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers.");
      expect(db.salesRep.deleteMany).not.toHaveBeenCalled();
      expect(mocks.recordAudit).not.toHaveBeenCalled();
    }
  });

  it("sans historique : une seule instruction, conditionnée à l'absence d'historique, puis l'audit au nom du directeur", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", email: "marie@exemple.fr" });
    footprint();
    db.salesRep.deleteMany.mockResolvedValue({ count: 1 });

    expect(await team.deleteTeamMember("rep_1", DIRECTOR)).toEqual({ ok: true });

    expect(db.salesRep.deleteMany).toHaveBeenCalledWith({ where: { id: "rep_1", prospects: { none: {} }, commissions: { none: {} }, invoices: { none: {} }, tasks: { none: {} } } });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.rep_deleted", entityType: "SalesRep", entityId: "rep_1", salesDirectorId: "dir_1", metadata: { email: "marie@exemple.fr" } });
  });

  it("un dossier arrivé entre le contrôle et l'effacement : la base refuse (0 supprimé), le refus est rendu, pas d'audit", async () => {
    db.salesRep.findUnique.mockResolvedValue({ id: "rep_1", email: "marie@exemple.fr" });
    footprint();
    db.salesRep.deleteMany.mockResolvedValue({ count: 0 });
    // Au moment de relire, le commercial est toujours là, avec un dossier tout neuf.
    db.prospect.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await team.deleteTeamMember("rep_1", DIRECTOR);

    expect(result).toMatchObject({ ok: false, reason: "HAS_HISTORY", footprint: { prospects: 1 } });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("déjà supprimé par quelqu'un d'autre entre-temps : introuvable", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce({ id: "rep_1", email: "marie@exemple.fr" }).mockResolvedValueOnce(null);
    footprint();
    db.salesRep.deleteMany.mockResolvedValue({ count: 0 });
    expect(await team.deleteTeamMember("rep_1", DIRECTOR)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------- Réaffecter

describe("réaffecter des dossiers", () => {
  const target = { id: "rep_2", firstName: "Paul", lastName: "Martin", isActive: true };

  it("vers un commercial inconnu ou désactivé : refusé, aucun dossier touché", async () => {
    db.salesRep.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...target, isActive: false });
    expect(await team.reassignProspects(["p1"], "rep_x", DIRECTOR)).toEqual({ ok: false, reason: "REP_NOT_FOUND" });
    expect(await team.reassignProspects(["p1"], "rep_2", DIRECTOR)).toEqual({ ok: false, reason: "REP_INACTIVE" });
    expect(db.prospect.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
  });

  it("des identifiants inconnus ou déjà à ce commercial : rien à déplacer, rien d'écrit", async () => {
    db.salesRep.findUnique.mockResolvedValue(target);
    db.prospect.findMany.mockResolvedValue([{ id: "p1", name: "Pharmacie du Port", salesRepId: "rep_2" }]);
    expect(await team.reassignProspects(["p1", "p_inconnu"], "rep_2", DIRECTOR)).toEqual({ ok: false, reason: "NOTHING_TO_MOVE" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mocks.recordProspectEvent).not.toHaveBeenCalled();
  });

  it("déplace ce qui peut l'être, compte le reste, trace chaque dossier au nom du directeur et prévient le commercial UNE fois", async () => {
    db.salesRep.findUnique.mockResolvedValue(target);
    db.prospect.findMany.mockResolvedValue([
      { id: "p1", name: "Pharmacie du Port", salesRepId: "rep_1" },
      { id: "p2", name: "Pharmacie du Centre", salesRepId: null },
      { id: "p3", name: "Pharmacie de la Gare", salesRepId: "rep_2" }, // déjà à Paul
    ]);

    const result = await team.reassignProspects(["p1", "p2", "p3", "p1", "p_inconnu"], "rep_2", DIRECTOR);

    expect(result).toEqual({ ok: true, moved: 2, alreadyHis: 1, unknown: 1, repName: "Paul Martin" });
    // Les doublons de la demande sont ignorés ; les dossiers sont relus en base.
    expect(db.prospect.findMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "p2", "p3", "p_inconnu"] } }, select: { id: true, name: true, salesRepId: true } });
    expect(db.prospect.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "p2"] } }, data: { salesRepId: "rep_2" } });
    // Les relances ouvertes suivent ; les commissions seulement prévisionnelles et pas encore facturées aussi.
    expect(db.salesTask.updateMany).toHaveBeenCalledWith({ where: { prospectId: { in: ["p1", "p2"] }, doneAt: null }, data: { salesRepId: "rep_2" } });
    expect(db.commission.updateMany).toHaveBeenCalledWith({ where: { prospectId: { in: ["p1", "p2"] }, status: "FORECAST", invoiceId: null }, data: { salesRepId: "rep_2" } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    expect(mocks.recordProspectEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordProspectEvent).toHaveBeenCalledWith({ prospectId: "p1", type: "ASSIGNED", summary: "Dossier confié à Paul Martin.", actor: ACTOR });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(2);
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.prospect_reassigned", entityType: "Prospect", entityId: "p1", salesDirectorId: "dir_1", metadata: { from: "rep_1", to: "rep_2" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.prospect_reassigned", entityType: "Prospect", entityId: "p2", salesDirectorId: "dir_1", metadata: { from: null, to: "rep_2" } });

    expect(mocks.notifySalesRep).toHaveBeenCalledTimes(1);
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ salesRepId: "rep_2", title: "2 nouveaux dossiers", linkUrl: "/extranet/pipeline" }));
  });

  it("un seul dossier : la notification le nomme et mène à lui", async () => {
    db.salesRep.findUnique.mockResolvedValue(target);
    db.prospect.findMany.mockResolvedValue([{ id: "p1", name: "Pharmacie du Port", salesRepId: null }]);
    await team.reassignProspects(["p1"], "rep_2", DIRECTOR);
    expect(mocks.notifySalesRep).toHaveBeenCalledWith(expect.objectContaining({ title: "Nouveau dossier : Pharmacie du Port", linkUrl: "/extranet/dossiers/p1" }));
  });

  it("plafonne la demande à 100 dossiers", async () => {
    db.salesRep.findUnique.mockResolvedValue(target);
    db.prospect.findMany.mockResolvedValue([]);
    await team.reassignProspects(Array.from({ length: 250 }, (_, i) => `p${i}`), "rep_2", DIRECTOR);
    expect(db.prospect.findMany.mock.calls[0][0].where.id.in).toHaveLength(team.REASSIGN_MAX);
  });
});
