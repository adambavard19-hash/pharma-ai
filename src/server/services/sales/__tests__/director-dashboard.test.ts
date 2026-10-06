import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les chiffres du tableau de bord du directeur. Base simulée : on vérifie que
 * chaque lecture porte sur les bons dossiers et la bonne période, et que
 * l'assemblage (totaux, classement, premières signatures, transformation) est
 * juste. Le texte libre des événements ne doit jamais en sortir.
 */

const db = vi.hoisted(() => ({
  salesDirector: { findFirst: vi.fn() },
  salesRep: { findMany: vi.fn() },
  prospect: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn(), groupBy: vi.fn() },
  contract: { findMany: vi.fn(), groupBy: vi.fn() },
  prospectEvent: { findMany: vi.fn(), groupBy: vi.fn() },
  salesApplication: { count: vi.fn() },
  commission: { groupBy: vi.fn() },
  salesInvoice: { aggregate: vi.fn() },
}));
const challenges = vi.hoisted(() => ({ listRunningChallengeSummaries: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("../challenges", () => challenges);

const { getDirectorDashboard } = await import("../director-dashboard");
const { ACTIVITY_EVENT_TYPES } = await import("@/core/sales/director/team");

const NOW = new Date("2026-10-06T10:00:00Z");
const MONTH_START = new Date("2026-09-30T22:00:00Z");
const REPS = [
  { id: "rep_a", firstName: "Alice", lastName: "Martin" },
  { id: "rep_b", firstName: "Bruno", lastName: "Durand" },
  { id: "rep_c", firstName: "Chloé", lastName: "Petit" },
];

/** Le tableau de bord d'un mois « normal » : tout est rempli, chaque test en retire ou en change un morceau. */
beforeEach(() => {
  vi.resetAllMocks();
  db.salesDirector.findFirst.mockResolvedValue({ id: "dir_1" });
  db.salesRep.findMany.mockResolvedValue(REPS);
  db.prospect.groupBy.mockResolvedValue([{ salesRepId: "rep_a", _count: { _all: 4 } }, { salesRepId: "rep_b", _count: { _all: 1 } }]);
  db.prospect.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if ("OR" in where) return 3;
    return where.createdAt ? 1 : 7;
  });
  // Deux démonstrations réalisées par Alice dans la période (lues dans l'audit `sales.demo_done`, première démo de chaque dossier).
  db.auditLog.findMany.mockResolvedValue([{ entityId: "d1" }, { entityId: "d2" }]);
  db.prospect.findMany.mockResolvedValue([{ id: "d1", salesRepId: "rep_a" }, { id: "d2", salesRepId: "rep_a" }]);
  db.auditLog.groupBy.mockResolvedValue([
    { entityId: "d1", _min: { createdAt: new Date("2026-10-02T09:00:00Z") } },
    { entityId: "d2", _min: { createdAt: new Date("2026-10-03T09:00:00Z") } },
  ]);
  db.contract.findMany.mockResolvedValue([]);
  db.prospectEvent.findMany.mockImplementation(async (args: { where?: unknown }) => (args.where ? [] : []));
  db.salesApplication.count.mockResolvedValue(2);
  db.commission.groupBy.mockResolvedValue([
    { status: "EARNED", _sum: { amountCents: 120_000 }, _count: { _all: 4 } },
    { status: "PAYABLE", _sum: { amountCents: 60_000 }, _count: { _all: 2 } },
  ]);
  db.salesInvoice.aggregate.mockResolvedValue({ _sum: { amountCents: 30_000 }, _count: { _all: 1 } });
  challenges.listRunningChallengeSummaries.mockResolvedValue([]);
});

describe("l'accès", () => {
  it("un directeur désactivé ou inconnu ne lit rien : refus avant toute lecture de l'équipe", async () => {
    db.salesDirector.findFirst.mockResolvedValue(null);
    await expect(getDirectorDashboard("dir_parti", "mois", NOW)).rejects.toThrow("Accès au tableau de bord refusé.");
    expect(db.salesDirector.findFirst).toHaveBeenCalledWith({ where: { id: "dir_parti", isActive: true }, select: { id: true } });
    expect(db.salesRep.findMany).not.toHaveBeenCalled();
    expect(db.prospect.groupBy).not.toHaveBeenCalled();
    expect(db.commission.groupBy).not.toHaveBeenCalled();
  });
});

describe("la période et l'équipe", () => {
  it("compte du 1er du mois, minuit de Paris, jusqu'à maintenant, sur les commerciaux actifs seulement", async () => {
    await getDirectorDashboard("dir_1", "mois", NOW);
    expect(db.salesRep.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true, firstName: true, lastName: true } });
    const created = db.prospect.groupBy.mock.calls.map(([args]) => args).find((args) => "createdAt" in args.where);
    expect(created.where).toEqual({ salesRepId: { in: ["rep_a", "rep_b", "rep_c"] }, createdAt: { gte: MONTH_START, lte: NOW } });
    // Les démonstrations viennent de l'audit, pas de la colonne que reprogrammer une démo remet à zéro.
    expect(db.auditLog.findMany).toHaveBeenCalledWith({ where: { action: "sales.demo_done", entityType: "Prospect", entityId: { not: null }, createdAt: { gte: MONTH_START, lte: NOW } }, select: { entityId: true } });
    expect(db.prospect.findMany).toHaveBeenCalledWith({ where: { id: { in: ["d1", "d2"] }, salesRepId: { in: ["rep_a", "rep_b", "rep_c"] } }, select: { id: true, salesRepId: true } });
    expect(db.prospect.groupBy.mock.calls.every(([args]) => !("demoDoneAt" in args.where))).toBe(true);
  });

  it("une démonstration compte une fois, à la date de la PREMIÈRE démo du dossier : une démo refaite ne se recompte pas", async () => {
    db.auditLog.groupBy.mockResolvedValue([
      { entityId: "d1", _min: { createdAt: new Date("2026-08-20T09:00:00Z") } }, // déjà comptée le mois dernier
      { entityId: "d2", _min: { createdAt: new Date("2026-10-03T09:00:00Z") } },
    ]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals.demos).toBe(1);
    expect(db.auditLog.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { action: "sales.demo_done", entityType: "Prospect", entityId: { in: ["d1", "d2"] } } }));
  });

  it("« 30 jours » et « cette année » changent la borne de début, pas celle de fin", async () => {
    await getDirectorDashboard("dir_1", "annee", NOW);
    const yearWhere = db.prospect.groupBy.mock.calls[0][0].where;
    expect(yearWhere.createdAt).toEqual({ gte: new Date("2025-12-31T23:00:00Z"), lte: NOW });
    vi.clearAllMocks();
    db.salesDirector.findFirst.mockResolvedValue({ id: "dir_1" });
    db.salesRep.findMany.mockResolvedValue(REPS);
    db.prospect.groupBy.mockResolvedValue([]);
    db.prospect.count.mockResolvedValue(0);
    db.contract.findMany.mockResolvedValue([]);
    db.prospectEvent.findMany.mockResolvedValue([]);
    db.salesApplication.count.mockResolvedValue(0);
    db.commission.groupBy.mockResolvedValue([]);
    db.salesInvoice.aggregate.mockResolvedValue({ _sum: { amountCents: null }, _count: { _all: 0 } });
    challenges.listRunningChallengeSummaries.mockResolvedValue([]);
    const board = await getDirectorDashboard("dir_1", "30-jours", NOW);
    expect(db.prospect.groupBy.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date("2026-09-06T10:00:00Z"), lte: NOW });
    expect(board.period.key).toBe("30-jours");
  });

  it("dossiers en cours et dossiers à attribuer : ni activés ni perdus ; sans commercial pour ces derniers", async () => {
    await getDirectorDashboard("dir_1", "mois", NOW);
    const counts = db.prospect.count.mock.calls.map(([args]) => args.where);
    expect(counts).toContainEqual({ salesRepId: { in: ["rep_a", "rep_b", "rep_c"] }, status: { notIn: ["ACTIVATED", "LOST"] } });
    // Sans commercial, OU suivis par un commercial désactivé : personne ne les traite.
    expect(counts).toContainEqual({ status: { notIn: ["ACTIVATED", "LOST"] }, OR: [{ salesRepId: null }, { salesRep: { isActive: false } }] });
  });
});

describe("les chiffres et le classement", () => {
  it("les totaux sont la somme des lignes du classement : les chiffres s'additionnent à l'écran", async () => {
    db.contract.findMany.mockResolvedValue([{ prospectId: "p1", prospect: { salesRepId: "rep_a" } }, { prospectId: "p2", prospect: { salesRepId: "rep_b" } }]);
    db.contract.groupBy.mockResolvedValue([
      { prospectId: "p1", _min: { pharmacySignedAt: new Date("2026-10-02T09:00:00Z") } },
      { prospectId: "p2", _min: { pharmacySignedAt: new Date("2026-10-03T09:00:00Z") } },
    ]);
    db.prospectEvent.findMany.mockImplementation(async (args: { where?: { type?: string } }) => (args.where?.type === "STATUS_CHANGED" ? [{ prospectId: "p1", prospect: { salesRepId: "rep_a" } }] : []));
    db.prospectEvent.groupBy.mockResolvedValue([{ prospectId: "p1", _min: { createdAt: new Date("2026-10-04T09:00:00Z") } }]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals).toMatchObject({ opened: 5, demos: 2, contractsSigned: 2, activated: 1 });
    expect(board.ranking.map((row) => [row.name, row.activated, row.contractsSigned, row.demos, row.opened, row.rank])).toEqual([
      ["Alice Martin", 1, 1, 2, 4, 1],
      ["Bruno Durand", 0, 1, 0, 1, 2],
    ]);
    expect(board.ranking.reduce((sum, row) => sum + row.opened, 0)).toBe(board.totals.opened);
    expect(board.team.activeReps).toBe(3);
    expect(board.quietCount).toBe(1);
  });

  it("la première signature seule compte : un contrat refait, déjà signé avant la période, ne se recompte pas", async () => {
    db.contract.findMany.mockResolvedValue([{ prospectId: "p1", prospect: { salesRepId: "rep_a" } }, { prospectId: "p2", prospect: { salesRepId: "rep_a" } }]);
    db.contract.groupBy.mockResolvedValue([
      { prospectId: "p1", _min: { pharmacySignedAt: new Date("2026-08-15T09:00:00Z") } },
      { prospectId: "p2", _min: { pharmacySignedAt: new Date("2026-10-03T09:00:00Z") } },
    ]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals.contractsSigned).toBe(1);
  });

  it("une même officine signée par deux versions du contrat dans la période ne compte qu'une fois", async () => {
    db.contract.findMany.mockResolvedValue([{ prospectId: "p1", prospect: { salesRepId: "rep_a" } }, { prospectId: "p1", prospect: { salesRepId: "rep_a" } }]);
    db.contract.groupBy.mockResolvedValue([{ prospectId: "p1", _min: { pharmacySignedAt: new Date("2026-10-03T09:00:00Z") } }]);
    expect((await getDirectorDashboard("dir_1", "mois", NOW)).totals.contractsSigned).toBe(1);
  });

  it("lit les signatures de l'officine dans la période, sur les dossiers des commerciaux actifs", async () => {
    await getDirectorDashboard("dir_1", "mois", NOW);
    expect(db.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacySignedAt: { gte: MONTH_START, lte: NOW }, prospect: { salesRepId: { in: ["rep_a", "rep_b", "rep_c"] } } } }));
  });

  it("une activation déjà faite avant la période (réactivation) ne compte pas", async () => {
    db.prospectEvent.findMany.mockImplementation(async (args: { where?: { type?: string } }) => (args.where?.type === "STATUS_CHANGED" ? [{ prospectId: "p1", prospect: { salesRepId: "rep_a" } }, { prospectId: "p2", prospect: { salesRepId: "rep_b" } }] : []));
    db.prospectEvent.groupBy.mockResolvedValue([
      { prospectId: "p1", _min: { createdAt: new Date("2026-07-01T09:00:00Z") } },
      { prospectId: "p2", _min: { createdAt: new Date("2026-10-05T09:00:00Z") } },
    ]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals.activated).toBe(1);
    expect(board.ranking.find((row) => row.name === "Bruno Durand")?.activated).toBe(1);
    expect(board.ranking.find((row) => row.name === "Alice Martin")?.activated).toBe(0);
    // Lue par le passage à « Activé » de l'événement, sur les dossiers des commerciaux actifs.
    const read = db.prospectEvent.findMany.mock.calls.map(([args]) => args).find((args) => args.where?.type === "STATUS_CHANGED");
    expect(read.where).toMatchObject({ createdAt: { gte: MONTH_START, lte: NOW }, metadata: { path: ["to"], equals: "ACTIVATED" }, prospect: { salesRepId: { in: ["rep_a", "rep_b", "rep_c"] } } });
  });

  it("le taux de transformation compte les dossiers ouverts sur la période arrivés à la signature", async () => {
    db.prospect.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.createdAt ? 1 : "OR" in where ? 0 : 9));
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals.conversion).toEqual({ rate: 0.2, signed: 1, opened: 5 });
    const converted = db.prospect.count.mock.calls.map(([args]) => args.where).find((where) => where.createdAt);
    expect(converted).toEqual({ salesRepId: { in: ["rep_a", "rep_b", "rep_c"] }, createdAt: { gte: MONTH_START, lte: NOW }, status: { in: ["CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"] } });
    expect(board.totals.openNow).toBe(9);
  });

  it("aucun dossier ouvert : pas de taux, jamais 0 %", async () => {
    db.prospect.groupBy.mockResolvedValue([]);
    db.prospect.count.mockResolvedValue(0);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.totals.conversion).toEqual({ rate: null, signed: 0, opened: 0 });
  });

  it("la phrase du haut reprend les chiffres de la page", async () => {
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(board.summary).toBe("Ce mois-ci, votre équipe de 3 commerciaux a ouvert 5 dossiers et réalisé 2 démonstrations, mais n'a pas encore activé d'officine.");
  });
});

describe("une équipe vide", () => {
  it("ne lit aucun dossier par commercial, le dit en une phrase, et garde ce qui reste à traiter", async () => {
    db.salesRep.findMany.mockResolvedValue([]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(db.prospect.groupBy).not.toHaveBeenCalled();
    expect(db.contract.findMany).not.toHaveBeenCalled();
    expect(board.summary).toBe("Votre équipe n'a pas encore de commercial actif. Ajoutez le premier pour commencer.");
    expect(board.totals).toMatchObject({ opened: 0, demos: 0, contractsSigned: 0, activated: 0, openNow: 0 });
    expect(board.ranking).toEqual([]);
    expect(board.todo.applicationsToReview).toBe(2);
  });
});

describe("à traiter", () => {
  it("candidatures nouvelles, dossiers sans commercial, commissions à valider et à payer, factures reçues", async () => {
    const { todo } = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(todo).toEqual({
      applicationsToReview: 2,
      unassignedProspects: 3,
      commissionsToValidate: { count: 4, amountCents: 120_000 },
      commissionsToPay: { count: 2, amountCents: 60_000 },
      invoicesToValidate: { count: 1, amountCents: 30_000 },
    });
    expect(db.salesApplication.count).toHaveBeenCalledWith({ where: { status: "NEW" } });
    expect(db.commission.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ["EARNED", "PAYABLE"] }, invoiceId: null } }));
    expect(db.salesInvoice.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "RECEIVED" } }));
  });

  it("rien à traiter : des zéros francs, pas de montant inventé", async () => {
    db.salesApplication.count.mockResolvedValue(0);
    db.prospect.count.mockResolvedValue(0);
    db.commission.groupBy.mockResolvedValue([]);
    db.salesInvoice.aggregate.mockResolvedValue({ _sum: { amountCents: null }, _count: { _all: 0 } });
    const { todo } = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(todo).toEqual({ applicationsToReview: 0, unassignedProspects: 0, commissionsToValidate: { count: 0, amountCents: 0 }, commissionsToPay: { count: 0, amountCents: 0 }, invoicesToValidate: { count: 0, amountCents: 0 } });
  });
});

describe("les challenges en cours", () => {
  it("rend le nom, l'objectif, la date de fin et la part des commerciaux qui l'ont atteint", async () => {
    challenges.listRunningChallengeSummaries.mockResolvedValue([
      { id: "ch_1", title: "Octobre des démos", metric: "DEMOS_DONE", target: 5, endsAt: new Date("2026-10-31T23:00:00Z"), totals: { participants: 6, reached: 2, reachedShare: 1 / 3, totalValue: 14, totalTarget: 30 } },
    ]);
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(challenges.listRunningChallengeSummaries).toHaveBeenCalledWith(NOW);
    expect(board.challenges).toEqual([
      { id: "ch_1", title: "Octobre des démos", goal: "5 démonstrations réalisées par commercial", endsAt: new Date("2026-10-31T23:00:00Z"), participants: 6, reached: 2, share: 1 / 3 },
    ]);
  });

  it("aucun challenge : liste vide", async () => {
    expect((await getDirectorDashboard("dir_1", "mois", NOW)).challenges).toEqual([]);
  });
});

describe("l'activité récente", () => {
  const event = (overrides: Record<string, unknown>) => ({ id: "e1", type: "CREATED", actorType: "SALES", actorId: "rep_a", actorLabel: "Alice Martin", metadata: {}, createdAt: new Date("2026-10-06T09:00:00Z"), prospect: { name: "Pharmacie du Centre", city: "Lyon" }, ...overrides });
  const feedRead = () => db.prospectEvent.findMany.mock.calls.map(([args]) => args).find((args) => Array.isArray(args.where?.type?.in));

  beforeEach(() => {
    db.prospectEvent.findMany.mockImplementation(async (args: { where?: { type?: unknown } }) => (Array.isArray((args.where?.type as { in?: unknown } | undefined)?.in) ? [
      event({}),
      event({ id: "e2", type: "NOTE", metadata: { texte: "Appeler la fille du titulaire au 06 12 34 56 78" } }),
      event({ id: "e3", type: "STATUS_CHANGED", actorType: "SYSTEM", actorId: null, actorLabel: "PharmaBoost", metadata: { from: "PHARMACY_CREATED", to: "ACTIVATED" } }),
    ] : []));
  });

  it("lit les vingt derniers événements, du plus récent, et seulement les colonnes utiles : jamais le texte (summary)", async () => {
    await getDirectorDashboard("dir_1", "mois", NOW);
    const args = feedRead();
    expect(args.take).toBe(20);
    // Les mêmes types que l'onglet « Ce qu'il a fait » : jamais un contrat, un e-mail, une signature ni un PDF.
    expect(args.where).toEqual({ type: { in: [...ACTIVITY_EVENT_TYPES] } });
    expect(args.where.type.in).not.toContain("CONTRACT_SIGNED");
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(Object.keys(args.select).sort()).toEqual(["actorId", "actorLabel", "actorType", "createdAt", "id", "metadata", "prospect", "type"]);
    expect(args.select.prospect).toEqual({ select: { name: true, city: true } });
  });

  it("dit ce qui s'est passé, qui, sur quelle officine : sans le contenu d'une note ni l'identité d'un signataire", async () => {
    const { feed } = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(feed.map((row) => [row.what, row.who])).toEqual([
      ["Dossier ouvert", "Alice Martin"],
      ["Note ajoutée", "Alice Martin"],
      ["Étape : Compte pharmacie créé → Activé", "PharmaBoost"],
    ]);
    expect(feed[0]).toMatchObject({ prospectName: "Pharmacie du Centre", city: "Lyon", at: new Date("2026-10-06T09:00:00Z") });
    const text = JSON.stringify(feed);
    expect(text).not.toContain("06 12 34 56 78");
  });

  it("n'ouvre la fiche que d'un commercial : l'identifiant d'un signataire ou du système n'en sort pas", async () => {
    const { feed } = await getDirectorDashboard("dir_1", "mois", NOW);
    expect(feed.map((row) => row.whoRepId)).toEqual(["rep_a", "rep_a", null]);
  });
});

describe("ce que le tableau de bord ne contient jamais", () => {
  it("aucun contrat, aucune pièce, aucun mot de passe, aucun e-mail ni téléphone de commercial", async () => {
    const board = await getDirectorDashboard("dir_1", "mois", NOW);
    const text = JSON.stringify(board);
    expect(text).not.toMatch(/passwordHash|fileKey|cvKey|email|phone|accessToken/i);
    // La liste des commerciaux n'est lue que pour leur nom : ni e-mail, ni téléphone, ni commission.
    expect(db.salesRep.findMany.mock.calls[0][0].select).toEqual({ id: true, firstName: true, lastName: true });
  });
});
