import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ni base ni réseau : Prisma est simulé, l'audit est espionné.
vi.mock("server-only", () => ({}));

const prisma = {
  prospect: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  salesTask: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  prospectEvent: { create: vi.fn(), findMany: vi.fn() },
  extranetNotification: { create: vi.fn() },
  contract: { findFirst: vi.fn() },
  auditLog: { findMany: vi.fn() },
};
vi.mock("@/server/db/client", () => ({ prisma }));

const recordAudit = vi.fn();
vi.mock("@/server/audit/log", () => ({ recordAudit }));

const { scheduleDemo, setProspectFollowUp, setProspectStatus, cancelDemo, markDemoDone } = await import("../../sales/prospects");
const { BOARD_CARD_LIMIT, PAST_DEMOS_LIMIT, computeRepMetrics, countDemosDoneSince, demoDoneRep, followUpCounts, loadBoardCards, loadDemos, loadFollowUps, metricsWindow, prospectListWhere, resolveCommercialPeriod } = await import("../commercial");

const ADMIN = { type: "ADMIN" as const, id: "admin-1", label: "Camille Admin" };
const AT = new Date("2026-10-08T12:30:00.000Z");

function prospect(overrides: Record<string, unknown> = {}) {
  return { id: "p1", name: "Pharmacie du Parc", status: "CONTACTED", salesRepId: null, demoAt: null, demoDoneAt: null, nextActionAt: null, nextActionLabel: null, contracts: [], ...overrides };
}

// L'horloge est figée : les règles de date (démo pas dans le passé…) ne dépendent pas du jour où l'on lance les tests.
const TODAY = new Date("2026-10-03T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  prisma.prospect.update.mockResolvedValue({});
  prisma.prospectEvent.findMany.mockResolvedValue([]);
  prisma.auditLog.findMany.mockResolvedValue([]);
  prisma.prospectEvent.create.mockResolvedValue({});
  prisma.extranetNotification.create.mockResolvedValue({});
  prisma.salesTask.findMany.mockResolvedValue([]);
  prisma.salesTask.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleDemo", () => {
  it("avec un commercial : tâche « Démonstration » dans son agenda, étape, historique, audit et notification", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ salesRepId: "rep-1" }));
    prisma.salesTask.create.mockResolvedValue({ id: "task-1" });
    prisma.salesTask.findMany.mockResolvedValue([{ dueAt: AT, label: "Démonstration" }]);

    const result = await scheduleDemo("p1", AT, ADMIN, "En visio");

    expect(result).toEqual({ ok: true, status: "DEMO_SCHEDULED", taskId: "task-1" });
    expect(prisma.salesTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: { prospectId: "p1", salesRepId: "rep-1", label: "Démonstration", dueAt: AT } }));
    expect(prisma.prospect.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ status: "DEMO_SCHEDULED", demoAt: AT, demoDoneAt: null, nextActionAt: AT, nextActionLabel: "Démonstration" }) }));
    expect(prisma.prospectEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ prospectId: "p1", type: "STATUS_CHANGED", actorType: "ADMIN", actorId: "admin-1" }) });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_scheduled", entityId: "p1", platformAdminId: "admin-1", metadata: expect.objectContaining({ before: { status: "CONTACTED", demoAt: null, demoDoneAt: null }, after: { status: "DEMO_SCHEDULED", demoAt: AT.toISOString(), demoDoneAt: null }, taskId: "task-1" }) }));
    expect(prisma.extranetNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ audience: "SALES", salesRepId: "rep-1", type: "DEMO_SCHEDULED" }) });
  });

  it("sans commercial : aucune tâche, mais la démo est datée, historisée et auditée", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect());

    const result = await scheduleDemo("p1", AT, ADMIN);

    expect(result).toEqual({ ok: true, status: "DEMO_SCHEDULED", taskId: null });
    expect(prisma.salesTask.create).not.toHaveBeenCalled();
    expect(prisma.salesTask.findMany).not.toHaveBeenCalled();
    expect(prisma.extranetNotification.create).not.toHaveBeenCalled();
    expect(prisma.prospect.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ demoAt: AT, nextActionAt: AT }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_scheduled", platformAdminId: "admin-1" }));
  });

  it("reprogrammer déplace la tâche existante au lieu d'en créer une seconde", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", salesRepId: "rep-1", demoAt: new Date("2026-10-06T08:00:00Z"), nextActionAt: new Date("2026-10-06T08:00:00Z"), nextActionLabel: "Démonstration" }));
    prisma.salesTask.findFirst.mockResolvedValue({ id: "task-1" });
    prisma.salesTask.update.mockResolvedValue({ id: "task-1" });

    const result = await scheduleDemo("p1", AT, ADMIN);

    expect(result).toMatchObject({ ok: true, status: "DEMO_SCHEDULED", taskId: "task-1" });
    expect(prisma.salesTask.create).not.toHaveBeenCalled();
    expect(prisma.salesTask.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "task-1" }, data: { dueAt: AT, salesRepId: "rep-1" } }));
    expect(prisma.prospectEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "NOTE" }) });
  });

  it("un dossier sous contrat garde son étape : la démo est seulement datée", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "CONTRACT_SENT", contracts: [{ status: "SENT" }] }));

    const result = await scheduleDemo("p1", AT, ADMIN);

    expect(result).toMatchObject({ ok: true, status: "CONTRACT_SENT" });
    const data = prisma.prospect.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("status");
  });

  it("une nouvelle démo après une démo réalisée : la date réalisée quitte le dossier mais reste dans l'historique et l'audit (avant)", async () => {
    const done = new Date("2026-10-01T09:00:00.000Z");
    const previous = new Date("2026-10-01T08:00:00.000Z");
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_DONE", salesRepId: "rep-1", demoAt: previous, demoDoneAt: done }));
    prisma.salesTask.create.mockResolvedValue({ id: "task-2" });

    const result = await scheduleDemo("p1", AT, ADMIN);

    expect(result).toMatchObject({ ok: true, status: "DEMO_SCHEDULED", taskId: "task-2" });
    // Ce n'est pas une reprogrammation : la tâche de la démo réalisée n'est pas déplacée, une nouvelle est créée.
    expect(prisma.salesTask.update).not.toHaveBeenCalled();
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ demoAt: AT, demoDoneAt: null, status: "DEMO_SCHEDULED" });
    const event = prisma.prospectEvent.create.mock.calls[0][0].data;
    expect(event.metadata).toMatchObject({ from: "DEMO_DONE", to: "DEMO_SCHEDULED", previousDemoAt: previous.toISOString(), previousDemoDoneAt: done.toISOString() });
    expect(event.summary).toContain("précédente démo réalisée le");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_scheduled", metadata: expect.objectContaining({ before: { status: "DEMO_DONE", demoAt: previous.toISOString(), demoDoneAt: done.toISOString() } }) }));
  });

  it("une date passée (jour de Paris) est refusée par le service, sans rien écrire", async () => {
    const result = await scheduleDemo("p1", new Date("2026-10-02T20:00:00.000Z"), ADMIN);
    expect(result.ok).toBe(false);
    expect(prisma.prospect.findUnique).not.toHaveBeenCalled();
    expect(prisma.prospect.update).not.toHaveBeenCalled();
  });

  it("dossier introuvable : rien n'est écrit", async () => {
    prisma.prospect.findUnique.mockResolvedValue(null);
    expect(await scheduleDemo("absent", AT, ADMIN)).toEqual({ ok: false, error: "Dossier introuvable." });
    expect(prisma.prospect.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("markDemoDone et cancelDemo", () => {
  it("réalisée : étape « Démo réalisée », tâche soldée, audit", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", salesRepId: "rep-1", demoAt: AT, nextActionAt: AT, nextActionLabel: "Démonstration" }));
    const result = await markDemoDone("p1", ADMIN);
    expect(result).toEqual({ ok: true, status: "DEMO_DONE" });
    // Seule la tâche de cette démo (même libellé, même heure) est soldée : une tâche du commercial au même libellé n'est pas touchée.
    expect(prisma.salesTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { prospectId: "p1", doneAt: null, label: "Démonstration", dueAt: AT } }));
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ status: "DEMO_DONE", nextActionAt: null, nextActionLabel: null });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_done", platformAdminId: "admin-1", metadata: expect.objectContaining({ salesRepId: "rep-1" }) }));
  });

  it("déposée de nouveau en « Démo réalisée » : la date réalisée existante est gardée, aucune démo de plus n'est comptée", async () => {
    const done = new Date("2026-10-01T09:00:00.000Z");
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "INTERESTED", demoAt: done, demoDoneAt: done }));
    const result = await markDemoDone("p1", ADMIN, { explicit: true });
    expect(result).toEqual({ ok: true, status: "DEMO_DONE" });
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ status: "DEMO_DONE", demoDoneAt: done });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.prospect_status_changed" }));
    expect(recordAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_done" }));
  });

  it("annulée : la tâche de l'agenda est close et marquée annulée, jamais supprimée ; l'étape d'avant revient ; audit avant/après", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", salesRepId: "rep-1", demoAt: AT, nextActionAt: AT, nextActionLabel: "Démonstration" }));
    prisma.prospectEvent.findMany.mockResolvedValue([{ metadata: { from: "PROPOSAL_SENT", to: "DEMO_SCHEDULED", previousDemoAt: null, previousDemoDoneAt: null } }]);
    prisma.salesTask.findMany.mockResolvedValueOnce([{ id: "task-1" }]).mockResolvedValue([]);

    const result = await cancelDemo("p1", ADMIN, "Reportée par le titulaire");

    expect(result).toEqual({ ok: true, status: "PROPOSAL_SENT" });
    expect(prisma.salesTask.deleteMany).not.toHaveBeenCalled();
    expect(prisma.salesTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { prospectId: "p1", doneAt: null, label: "Démonstration", dueAt: AT } }));
    expect(prisma.salesTask.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["task-1"] }, doneAt: null }, data: { doneAt: expect.any(Date), label: "Démonstration (annulée)" } });
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ demoAt: null, status: "PROPOSAL_SENT", nextActionAt: null });
    const events = prisma.prospectEvent.create.mock.calls.map((call) => call[0].data);
    expect(events.map((e) => e.type)).toEqual(["STATUS_CHANGED", "TASK_DONE"]);
    expect(events[1].metadata).toMatchObject({ taskIds: ["task-1"], canceled: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_canceled", metadata: expect.objectContaining({ reason: "Reportée par le titulaire", closedTaskIds: ["task-1"], before: expect.objectContaining({ status: "DEMO_SCHEDULED" }), after: expect.objectContaining({ status: "PROPOSAL_SENT", demoAt: null }) }) }));
  });

  it("annuler la démo qui suivait une démo réalisée rend au dossier sa démo réalisée", async () => {
    const previous = new Date("2026-10-01T08:00:00.000Z");
    const done = new Date("2026-10-01T09:00:00.000Z");
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", demoAt: AT }));
    prisma.prospectEvent.findMany.mockResolvedValue([{ metadata: { from: "DEMO_DONE", to: "DEMO_SCHEDULED", previousDemoAt: previous.toISOString(), previousDemoDoneAt: done.toISOString() } }]);

    const result = await cancelDemo("p1", ADMIN, "Plus nécessaire");

    expect(result).toEqual({ ok: true, status: "DEMO_DONE" });
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ status: "DEMO_DONE", demoAt: previous, demoDoneAt: done });
  });

  it("sans historique lisible, la démo annulée ramène à « Contacté »", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", demoAt: AT }));
    expect(await cancelDemo("p1", ADMIN, "Reportée sine die")).toEqual({ ok: true, status: "CONTACTED" });
  });

  it("une démo réalisée ne s'annule pas", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ demoAt: AT, demoDoneAt: AT }));
    expect((await cancelDemo("p1", ADMIN, "Erreur de saisie")).ok).toBe(false);
    expect(prisma.prospect.update).not.toHaveBeenCalled();
  });
});

describe("setProspectFollowUp", () => {
  const DUE = new Date("2026-10-12T07:00:00.000Z");

  it("avec un commercial : tâche créée, prochaine action = la plus proche des relances ouvertes, audit avant/après", async () => {
    const earlier = new Date("2026-10-09T07:00:00.000Z");
    prisma.prospect.findUnique.mockResolvedValue(prospect({ salesRepId: "rep-1", nextActionAt: earlier, nextActionLabel: "Rappeler" }));
    prisma.salesTask.create.mockResolvedValue({ id: "task-9" });
    prisma.salesTask.findMany.mockResolvedValue([{ dueAt: earlier, label: "Rappeler" }, { dueAt: DUE, label: "Envoyer la proposition" }]);

    const result = await setProspectFollowUp("p1", DUE, "Envoyer la proposition", ADMIN);

    expect(result).toEqual({ ok: true, taskId: "task-9" });
    expect(prisma.salesTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: { prospectId: "p1", salesRepId: "rep-1", label: "Envoyer la proposition", dueAt: DUE } }));
    expect(prisma.prospect.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { nextActionAt: earlier, nextActionLabel: "Rappeler" } });
    expect(prisma.prospectEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "TASK_CREATED" }) });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.followup_set", platformAdminId: "admin-1", metadata: expect.objectContaining({ taskId: "task-9", changes: { nextActionAt: { from: earlier.toISOString(), to: earlier.toISOString() }, nextActionLabel: { from: "Rappeler", to: "Rappeler" } } }) }));
  });

  it("sans commercial : pas de tâche, la relance devient la prochaine action du dossier", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ nextActionAt: new Date("2026-10-01T07:00:00Z"), nextActionLabel: "Ancienne" }));

    const result = await setProspectFollowUp("p1", DUE, "  Rappeler  ", ADMIN);

    expect(result).toEqual({ ok: true, taskId: null });
    expect(prisma.salesTask.create).not.toHaveBeenCalled();
    expect(prisma.prospect.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { nextActionAt: DUE, nextActionLabel: "Rappeler" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.followup_set", metadata: expect.objectContaining({ taskId: null, salesRepId: null }) }));
  });

  it("un dossier clos refuse la relance, sans rien écrire", async () => {
    prisma.prospect.findUnique.mockResolvedValue(prospect({ status: "LOST", salesRepId: "rep-1" }));
    const result = await setProspectFollowUp("p1", DUE, "Rappeler", ADMIN);
    expect(result.ok).toBe(false);
    expect(prisma.salesTask.create).not.toHaveBeenCalled();
    expect(prisma.prospect.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("résultats d'un commercial sur une période", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");
  const window = metricsWindow(resolveCommercialPeriod("30j"), now);
  const sub = (id: string, status: string, overrides: Record<string, unknown> = {}) => ({ id, status, createdAt: new Date("2026-09-20T10:00:00Z"), contractPriceCents: 29000, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false, ...overrides });

  const rows = [
    // Démo dans la période, contrat envoyé et signé dans la période, client payant au tarif contractuel.
    { status: "ACTIVATED", demoAt: new Date("2026-09-15T09:00:00Z"), contracts: [{ sentAt: new Date("2026-09-18T09:00:00Z"), finalizedAt: new Date("2026-09-22T09:00:00Z") }], pharmacy: { id: "ph1", isDemo: false, subscription: sub("s1", "ACTIVE") } },
    // Démo trop ancienne, contrat envoyé avant la période ; essai en cours (hors MRR).
    { status: "PHARMACY_CREATED", demoAt: new Date("2026-07-01T09:00:00Z"), contracts: [{ sentAt: new Date("2026-07-05T09:00:00Z"), finalizedAt: new Date("2026-09-10T09:00:00Z") }], pharmacy: { id: "ph2", isDemo: false, subscription: sub("s2", "TRIALING", { createdAt: new Date("2026-07-20T10:00:00Z") }) } },
    // Même organisation que ph1 (deux dossiers) : l'abonnement n'est compté qu'une fois.
    { status: "ACTIVATED", demoAt: null, contracts: [], pharmacy: { id: "ph3", isDemo: false, subscription: sub("s1", "ACTIVE") } },
    // Officine de démonstration : écartée des clients et du MRR.
    { status: "ACTIVATED", demoAt: null, contracts: [], pharmacy: { id: "ph4", isDemo: true, subscription: sub("s4", "ACTIVE") } },
    // Résiliation programmée : hors MRR ; ancien tarif catalogue sans tarif contractuel.
    { status: "ACTIVATED", demoAt: null, contracts: [], pharmacy: { id: "ph5", isDemo: false, subscription: sub("s5", "ACTIVE", { cancelAtPeriodEnd: true, contractPriceCents: null }) } },
    // Dossier ouvert avec une démo à venir.
    { status: "DEMO_SCHEDULED", demoAt: new Date("2026-10-06T09:00:00Z"), contracts: [], pharmacy: null },
    { status: "LOST", demoAt: null, contracts: [{ sentAt: new Date("2026-09-25T09:00:00Z"), finalizedAt: null }], pharmacy: null },
  ];
  const commissions = [
    { status: "EARNED", amountCents: 30000 },
    { status: "EARNED", amountCents: 15000 },
    { status: "PAYABLE", amountCents: 10000 },
    { status: "PAID", amountCents: 20000 },
    { status: "FORECAST", amountCents: 5000 },
    { status: "CANCELLED", amountCents: 99999 },
  ];

  // Démos réalisées, lues dans le journal : deux dans la période (dont une dont le dossier a depuis une nouvelle démo programmée), une trop ancienne.
  const demosDone = [new Date("2026-09-15T10:00:00Z"), new Date("2026-10-01T09:00:00Z"), new Date("2026-07-01T10:00:00Z")];

  it("compte la période, déduplique les abonnements et repose le MRR sur les tarifs contractuels", () => {
    const metrics = computeRepMetrics(rows, commissions, window, demosDone);
    expect(metrics).toEqual({
      prospects: 7,
      openProspects: 2,
      demosDone: 2,
      upcomingDemos: 1,
      trials: 1,
      contractsSent: 2,
      signatures: 2,
      subscriptionsCreated: 2,
      mrrCents: 29000,
      clients: 4,
      commissions: { forecastCents: 5000, earnedCents: 45000, payableCents: 10000, paidCents: 20000 },
    });
  });

  it("« depuis le début » : plus de borne basse", () => {
    const all = metricsWindow(resolveCommercialPeriod("tout"), now);
    expect(all.start).toBeNull();
    const metrics = computeRepMetrics(rows, [], all, demosDone);
    expect(metrics.demosDone).toBe(3);
    expect(metrics.contractsSent).toBe(3);
    expect(metrics.signatures).toBe(2);
    expect(metrics.subscriptionsCreated).toBe(3);
    expect(metrics.commissions).toEqual({ forecastCents: 0, earnedCents: 0, payableCents: 0, paidCents: 0 });
  });

  it("un commercial sans dossier : tout à zéro, rien d'inventé", () => {
    expect(computeRepMetrics([], [], window)).toMatchObject({ prospects: 0, demosDone: 0, mrrCents: 0, clients: 0, trials: 0 });
  });

  it("les démos réalisées ne dépendent pas de la date courante du dossier (écrasée par une nouvelle démo)", () => {
    // Le dossier n'a plus de démo réalisée (nouvelle démo programmée) : la démo du 1er octobre reste comptée par le journal.
    const rescheduled = [{ status: "DEMO_SCHEDULED", demoAt: new Date("2026-10-08T09:00:00Z"), contracts: [], pharmacy: null }];
    expect(computeRepMetrics(rescheduled, [], window, [new Date("2026-10-01T09:00:00Z")])).toMatchObject({ demosDone: 1, upcomingDemos: 1 });
  });

  it("filtres de liste : « sans réponse » à 14 jours, dossiers ouverts seulement", () => {
    const where = prospectListWhere({ filtre: "sans-reponse", statut: null, commercial: "console", origine: null, q: null }, now);
    const serialized = JSON.stringify(where);
    expect(serialized).toContain(new Date("2026-09-19T12:00:00.000Z").toISOString());
    expect(serialized).toContain('"notIn":["ACTIVATED","LOST"]');
    expect(serialized).toContain('"salesRepId":null');
  });

  it("filtre « à relancer » : jour de Paris passé, dossier ouvert (même définition que le marqueur, le cockpit et les relances)", () => {
    // 3 oct. 14 h à Paris : une action prévue ce matin à 9 h n'est pas en retard ; la borne est minuit à Paris (22 h UTC la veille).
    const late = JSON.stringify(prospectListWhere({ filtre: "a-relancer", statut: null, commercial: null, origine: null, q: null }, now));
    expect(late).toContain('"nextActionAt":{"lt":"2026-10-02T22:00:00.000Z"}');
    expect(late).toContain('"notIn":["ACTIVATED","LOST"]');
  });
});

describe("setProspectStatus : les étapes de démo passent par leurs gestes", () => {
  const REP = { type: "SALES" as const, id: "rep-1", label: "Léa Martin" };

  it("« Démo programmée » sans date est refusée, sans rien écrire", async () => {
    prisma.prospect.findUniqueOrThrow.mockResolvedValue(prospect({ salesRepId: "rep-1", blockedAt: null }));
    const result = await setProspectStatus("p1", "DEMO_SCHEDULED", REP);
    expect(result.ok).toBe(false);
    expect(prisma.prospect.update).not.toHaveBeenCalled();
    expect(prisma.prospectEvent.create).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("« Démo réalisée » posée par le commercial date la démo, solde sa tâche et compte une démo (audit sales.demo_done)", async () => {
    prisma.prospect.findUniqueOrThrow.mockResolvedValue(prospect({ status: "DEMO_SCHEDULED", salesRepId: "rep-1", demoAt: AT, blockedAt: null }));
    const result = await setProspectStatus("p1", "DEMO_DONE", REP);
    expect(result).toEqual({ ok: true });
    expect(prisma.salesTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { prospectId: "p1", doneAt: null, label: "Démonstration", dueAt: AT } }));
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ status: "DEMO_DONE", demoDoneAt: TODAY });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.demo_done", salesRepId: "rep-1", platformAdminId: null }));
  });

  it("depuis « Démo réalisée », le commercial passe le dossier en « Intéressé »", async () => {
    prisma.prospect.findUniqueOrThrow.mockResolvedValue(prospect({ status: "DEMO_DONE", salesRepId: "rep-1", demoAt: AT, demoDoneAt: AT, blockedAt: null }));
    expect(await setProspectStatus("p1", "INTERESTED", REP)).toEqual({ ok: true });
    expect(prisma.prospect.update.mock.calls[0][0].data).toMatchObject({ status: "INTERESTED" });
  });
});

describe("démos réalisées : comptées dans le journal", () => {
  const log = [
    { entityId: "p1", createdAt: new Date("2026-09-20T10:00:00Z"), metadata: { from: "DEMO_SCHEDULED", to: "DEMO_DONE", salesRepId: "rep-1" } },
    { entityId: "p2", createdAt: new Date("2026-09-25T10:00:00Z"), metadata: { salesRepId: "rep-2" } },
    { entityId: "p3", createdAt: new Date("2026-09-28T10:00:00Z"), metadata: { salesRepId: null } },
  ];

  it("par commercial, pour la console, ou pour tous ; lu dans sales.demo_done depuis la date donnée", async () => {
    prisma.auditLog.findMany.mockResolvedValue(log);
    const since = new Date("2026-09-03T10:00:00Z");
    expect(await countDemosDoneSince(since, null)).toBe(3);
    expect(await countDemosDoneSince(since, "rep-1")).toBe(1);
    expect(await countDemosDoneSince(since, "console")).toBe(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { action: "sales.demo_done", entityType: "Prospect", createdAt: { gte: since } } }));
    // Le dossier n'est pas relu : une nouvelle démo programmée (date réalisée remise à vide) ne retire rien.
    expect(prisma.prospect.count).not.toHaveBeenCalled();
  });

  it("le commercial noté dans l'entrée d'audit, ou la console", () => {
    expect(demoDoneRep({ salesRepId: "rep-1" })).toBe("rep-1");
    expect(demoDoneRep({ salesRepId: null })).toBeNull();
    expect(demoDoneRep(null)).toBeNull();
    expect(demoDoneRep(["rep-1"])).toBeNull();
  });
});

describe("chargements bornés : pipeline, démonstrations, relances", () => {
  const NOW = new Date("2026-10-03T12:00:00.000Z");

  it("pipeline : les dossiers clos sans mouvement depuis 90 jours restent hors du tableau, comptés ; au plus BOARD_CARD_LIMIT cartes", async () => {
    prisma.prospect.findMany.mockResolvedValue([]);
    prisma.prospect.count.mockResolvedValue(42);
    const result = await loadBoardCards({ commercial: null, q: null, ville: null }, NOW);
    expect(result).toEqual({ cards: [], hiddenClosed: 42, truncated: false });
    const query = prisma.prospect.findMany.mock.calls[0][0];
    expect(query.take).toBe(BOARD_CARD_LIMIT + 1);
    const cutoff = new Date("2026-07-05T12:00:00.000Z").toISOString();
    expect(JSON.stringify(query.where)).toContain(`{"OR":[{"status":{"notIn":["ACTIVATED","LOST"]}},{"updatedAt":{"gte":"${cutoff}"}}]}`);
    const hidden = JSON.stringify(prisma.prospect.count.mock.calls[0][0].where);
    expect(hidden).toContain('{"status":{"in":["ACTIVATED","LOST"]}}');
    expect(hidden).toContain(`{"updatedAt":{"lt":"${cutoff}"}}`);
  });

  it("démonstrations : à venir depuis minuit à Paris ; passées limitées aux plus récentes, compteurs par la base", async () => {
    prisma.prospect.findMany.mockResolvedValue([]);
    prisma.prospect.count.mockResolvedValueOnce(400).mockResolvedValueOnce(7);
    const result = await loadDemos({ commercial: "rep-1" }, NOW);
    expect(result).toMatchObject({ pastCount: 400, toConfirm: 7, upcomingTruncated: false });
    const [upcoming, past] = prisma.prospect.findMany.mock.calls.map((call) => call[0]);
    const midnight = "2026-10-02T22:00:00.000Z";
    expect(JSON.stringify(upcoming.where)).toContain(`"demoAt":{"gte":"${midnight}"}`);
    expect(JSON.stringify(past.where)).toContain(`"demoAt":{"lt":"${midnight}"}`);
    expect(JSON.stringify(past.where)).toContain('"salesRepId":"rep-1"');
    expect(past).toMatchObject({ take: PAST_DEMOS_LIMIT, orderBy: { demoAt: "desc" } });
    expect(JSON.stringify(prisma.prospect.count.mock.calls[1][0].where)).toContain('"demoDoneAt":null');
  });

  it("relances : la vue borne les échéances aux jours de Paris, la lecture est limitée, le dépassement signalé", async () => {
    const rep = { id: "rep-1", firstName: "Léa", lastName: "Martin" };
    const task = (id: string, due: string) => ({ id, label: "Rappeler", dueAt: new Date(due), salesRep: rep, prospect: { id: `p-${id}`, name: `Pharmacie ${id}`, city: null, status: "CONTACTED" } });
    prisma.salesTask.findMany.mockResolvedValue([task("a", "2026-09-30T08:00:00Z"), task("b", "2026-10-01T08:00:00Z"), task("c", "2026-10-02T08:00:00Z")]);
    prisma.prospect.findMany.mockResolvedValue([]);

    const result = await loadFollowUps({ commercial: null, view: "retard" }, NOW, 2);

    expect(result.truncated).toBe(true);
    expect(result.items.map((i) => i.taskId)).toEqual(["a", "b"]);
    const taskQuery = prisma.salesTask.findMany.mock.calls[0][0];
    expect(taskQuery.take).toBe(3);
    expect(taskQuery.where.dueAt).toEqual({ lt: new Date("2026-10-02T22:00:00.000Z") });
    expect(prisma.prospect.findMany.mock.calls[0][0].where).toMatchObject({ AND: expect.arrayContaining([{ nextActionAt: { not: null, lt: new Date("2026-10-02T22:00:00.000Z") } }]) });
  });

  it("relances : compteurs par jour de Paris, tâches des agendas et prochaines actions sans tâche ; aucune tâche pour la console", async () => {
    prisma.salesTask.count.mockResolvedValue(2);
    prisma.prospect.count.mockResolvedValue(1);
    expect(await followUpCounts({ commercial: null }, NOW)).toEqual({ retard: 3, aujourdhui: 3, "a-venir": 3 });
    const ranges = prisma.salesTask.count.mock.calls.map((call) => call[0].where.dueAt);
    expect(ranges).toEqual([{ lt: new Date("2026-10-02T22:00:00.000Z") }, { gte: new Date("2026-10-02T22:00:00.000Z"), lt: new Date("2026-10-03T22:00:00.000Z") }, { gte: new Date("2026-10-03T22:00:00.000Z") }]);

    vi.clearAllMocks();
    prisma.prospect.count.mockResolvedValue(4);
    expect(await followUpCounts({ commercial: "console" }, NOW)).toEqual({ retard: 4, aujourdhui: 4, "a-venir": 4 });
    expect(prisma.salesTask.count).not.toHaveBeenCalled();
  });
});
