import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le service des challenges, contre une base simulée EN MÉMOIRE : les requêtes
 * du service y sont réellement évaluées (périodes, commerciaux, JSON de
 * l'événement), si bien qu'une borne fausse (≤ au lieu de <), un commercial
 * d'un autre ou un dossier hors période change les chiffres et fait échouer le
 * test. L'avancement se compte toujours sur les dossiers, jamais sur une saisie.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  reps: [] as Row[],
  prospects: [] as Row[],
  contracts: [] as Row[],
  events: [] as Row[],
  /** Le journal d'audit : les démonstrations réalisées y sont écrites (`sales.demo_done`). */
  audits: [] as Row[],
  challenges: [] as Row[],
  nextId: 1,
  /** Si renseignée, la prochaine lecture d'un challenge rend cette version (l'état d'avant un autre geste). */
  staleRead: null as Row | null,
}));
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), notifySalesRep: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("../notifications", () => ({ notifySalesRep: mocks.notifySalesRep }));

// ---- Un petit évaluateur de filtres Prisma : assez pour les requêtes du service ----

const time = (value: unknown) => (value instanceof Date ? value.getTime() : (value as number));
function matches(row: Row, where: Row | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, condition]) => {
    const value = row[key];
    if (condition instanceof Date) return time(value) === time(condition);
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      const op = condition as Record<string, unknown>;
      if ("in" in op) return (op.in as unknown[]).includes(value);
      if ("path" in op) return ((value as Record<string, unknown> | undefined)?.[(op.path as string[])[0]] ?? null) === op.equals;
      if ("not" in op) return value !== op.not;
      if ("gte" in op || "lt" in op || "gt" in op || "lte" in op) {
        if (value === null || value === undefined) return false;
        return (!("gte" in op) || time(value) >= time(op.gte)) && (!("lt" in op) || time(value) < time(op.lt)) && (!("gt" in op) || time(value) > time(op.gt)) && (!("lte" in op) || time(value) <= time(op.lte));
      }
      return value !== null && value !== undefined && matches(value as Row, op);
    }
    return value === condition;
  });
}

const withProspect = (row: Row): Row => ({ ...row, prospect: db.prospects.find((p) => p.id === row.prospectId) ?? {} });
const sortBy = (rows: Row[], orderBy: Row | Row[] | undefined) => {
  const keys = ([] as Row[]).concat(orderBy ?? []).map((o) => Object.entries(o)[0] as [string, "asc" | "desc"]);
  return [...rows].sort((a, b) => {
    for (const [key, dir] of keys) {
      const diff = time(a[key]) - time(b[key]) || String(a[key]).localeCompare(String(b[key]));
      if (diff) return dir === "desc" ? -diff : diff;
    }
    return 0;
  });
};
function groupBy(rows: Row[], args: { by: string[]; _count?: unknown; _min?: Record<string, boolean> }) {
  const groups = new Map<unknown, Row[]>();
  for (const row of rows) groups.set(row[args.by[0]], [...(groups.get(row[args.by[0]]) ?? []), row]);
  return [...groups.entries()].map(([key, members]) => ({
    [args.by[0]]: key,
    _count: { _all: members.length },
    _min: Object.fromEntries(Object.keys(args._min ?? {}).map((field) => [field, members.map((m) => m[field]).filter(Boolean).sort((a, b) => time(a) - time(b))[0] ?? null])),
  }));
}

vi.mock("@/server/db/client", () => ({
  prisma: {
    salesRep: { findMany: async ({ where, orderBy }: { where: Row; orderBy?: Row[] }) => sortBy(db.reps.filter((r) => matches(r, where)), orderBy) },
    prospect: {
      groupBy: async (args: { by: string[]; where: Row }) => groupBy(db.prospects.filter((p) => matches(p, args.where)), args),
      findMany: async ({ where }: { where: Row }) => db.prospects.filter((p) => matches(p, where)),
    },
    auditLog: {
      findMany: async ({ where }: { where: Row }) => db.audits.filter((a) => matches(a, where)),
      groupBy: async (args: { by: string[]; where: Row }) => groupBy(db.audits.filter((a) => matches(a, args.where)), args),
    },
    contract: {
      findMany: async ({ where }: { where: Row }) => db.contracts.map(withProspect).filter((c) => matches(c, where)),
      groupBy: async (args: { by: string[]; where: Row }) => groupBy(db.contracts.filter((c) => matches(c, args.where)), args),
    },
    prospectEvent: {
      findMany: async ({ where }: { where: Row }) => db.events.map(withProspect).filter((e) => matches(e, where)),
      groupBy: async (args: { by: string[]; where: Row }) => groupBy(db.events.filter((e) => matches(e, args.where)), args),
    },
    salesChallenge: {
      findMany: async ({ where, orderBy }: { where?: Row; orderBy?: Row }) => sortBy(db.challenges.filter((c) => matches(c, where)), orderBy),
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (db.staleRead) {
          const stale = db.staleRead;
          db.staleRead = null;
          return stale;
        }
        return db.challenges.find((c) => c.id === where.id) ?? null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `ch_new${db.nextId++}`, createdAt: new Date(), updatedAt: new Date("2026-11-01T00:00:00Z"), ...data };
        db.challenges.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const found = db.challenges.filter((c) => matches(c, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const found = db.challenges.filter((c) => matches(c, where));
        db.challenges = db.challenges.filter((c) => !found.includes(c));
        return { count: found.length };
      },
    },
  },
}));

const service = await import("../challenges");

// ---- Le jeu de données : octobre 2026, vu le 2 novembre -----------------------------

const OCT_START = new Date("2026-09-30T22:00:00.000Z"); // 1er octobre 0 h, Paris
const OCT_END = new Date("2026-10-31T23:00:00.000Z"); // 1er novembre 0 h, Paris (exclu)
const BEFORE_START = new Date("2026-09-30T21:59:59.999Z");
const LAST_MS = new Date("2026-10-31T22:59:59.999Z");
const NOW = new Date("2026-11-02T09:00:00.000Z");
const day = (iso: string) => new Date(`${iso}T10:00:00.000Z`);

const rep = (id: string, firstName: string, lastName: string, extra: Row = {}): Row => ({ id, firstName, lastName, isActive: true, createdAt: new Date("2026-01-10T09:00:00Z"), ...extra });
const challengeRow = (extra: Row = {}): Row => ({ id: "ch_oct", title: "Octobre des démos", description: null, metric: "DEMOS_DONE", target: 3, startsAt: OCT_START, endsAt: OCT_END, rewardLabel: "Prime de 200 €", rewardCents: 20000, isActive: true, createdByType: "DIRECTOR", createdById: "dir_1", createdByLabel: "Dora Directrice", createdAt: new Date("2026-09-20T09:00:00Z"), updatedAt: new Date("2026-09-20T09:00:00Z"), ...extra });

const DIRECTOR = { type: "DIRECTOR", id: "dir_1", label: "Dora Directrice" } as const;
const ADMIN = { type: "ADMIN", id: "adm_1", label: "Alice Admin" } as const;

function seed() {
  db.reps = [
    rep("alice", "Alice", "Martin"),
    rep("bob", "Bob", "Durand"),
    rep("chloe", "Chloé", "Petit"),
    rep("dan", "Dan", "Roux", { isActive: false }),
    rep("eve", "Eve", "Blanc", { createdAt: new Date("2026-11-15T09:00:00Z") }),
  ];
  db.prospects = [
    { id: "p1", salesRepId: "alice", createdAt: day("2026-10-05"), demoDoneAt: null }, // démo reprogrammée depuis : la colonne est remise à zéro, la démo faite reste comptée
    { id: "p2", salesRepId: "alice", createdAt: LAST_MS, demoDoneAt: OCT_END }, // créé la dernière milliseconde ; démo à la fin exacte (exclue)
    { id: "p3", salesRepId: "alice", createdAt: BEFORE_START, demoDoneAt: day("2026-10-02") }, // créé juste avant le début
    { id: "p4", salesRepId: "bob", createdAt: day("2026-10-10"), demoDoneAt: null },
    { id: "p5", salesRepId: "dan", createdAt: day("2026-10-10"), demoDoneAt: day("2026-10-12") }, // commercial inactif
    { id: "p6", salesRepId: "chloe", createdAt: OCT_START, demoDoneAt: null }, // créé au début exact
    { id: "p7", salesRepId: null, createdAt: day("2026-10-10"), demoDoneAt: day("2026-10-10") }, // sans commercial
    { id: "p8", salesRepId: "bob", createdAt: day("2026-10-15"), demoDoneAt: null },
    { id: "p9", salesRepId: "chloe", createdAt: OCT_END, demoDoneAt: null }, // créé à la fin exacte : exclu
  ];
  db.contracts = [
    { id: "c1", prospectId: "p1", pharmacySignedAt: day("2026-10-12") },
    { id: "c2", prospectId: "p1", pharmacySignedAt: day("2026-10-20") }, // nouvelle version du même contrat : une seule officine
    { id: "c3a", prospectId: "p4", pharmacySignedAt: day("2026-09-15") }, // première signature en septembre
    { id: "c3b", prospectId: "p4", pharmacySignedAt: day("2026-10-10") }, // refaite en octobre : ne se recompte pas
    { id: "c4", prospectId: "p6", pharmacySignedAt: OCT_END }, // signé à la fin exacte : exclu
    { id: "c5", prospectId: "p5", pharmacySignedAt: day("2026-10-14") }, // commercial inactif
    { id: "c6", prospectId: "p8", pharmacySignedAt: day("2026-10-30") },
    { id: "c7", prospectId: "p2", pharmacySignedAt: null }, // brouillon : jamais signé
  ];
  const demo = (id: string, entityId: string, at: Date): Row => ({ id, action: "sales.demo_done", entityType: "Prospect", entityId, createdAt: at });
  db.audits = [
    demo("a1", "p1", day("2026-10-08")),
    demo("a1b", "p1", day("2026-10-20")), // démo refaite : le dossier ne compte qu'une fois
    demo("a2", "p2", OCT_END), // à la fin exacte : exclu
    demo("a3", "p3", day("2026-10-02")),
    demo("a4a", "p4", day("2026-09-10")), // première démo en septembre
    demo("a4b", "p4", day("2026-10-12")), // refaite en octobre : ne se recompte pas
    demo("a5", "p5", day("2026-10-12")), // commercial inactif
    demo("a7", "p7", day("2026-10-10")), // sans commercial
    { id: "a8", action: "sales.prospect_status_changed", entityType: "Prospect", entityId: "p8", createdAt: day("2026-10-12") }, // un autre geste, pas une démo
  ];
  const activated = (id: string, prospectId: string, at: Date, to = "ACTIVATED", type = "STATUS_CHANGED"): Row => ({ id, prospectId, type, createdAt: at, metadata: { from: "PHARMACY_CREATED", to } });
  db.events = [
    activated("e1", "p1", day("2026-10-18")),
    activated("e2", "p1", day("2026-10-19")), // réactivation : une seule officine
    activated("e3a", "p4", day("2026-08-01")), // première activation en août
    activated("e3b", "p4", day("2026-10-05")), // en octobre : ne se recompte pas
    activated("e4", "p6", day("2026-10-06"), "ACTIVATED", "NOTE"), // une note, pas un passage de statut
    activated("e5", "p8", day("2026-10-06"), "PHARMACY_CREATED"), // une autre étape
    activated("e6", "p6", BEFORE_START), // juste avant le début
    activated("e7", "p8", OCT_END), // à la fin exacte
    activated("e8", "p2", LAST_MS), // la dernière milliseconde : comptée
    activated("e9", "p5", day("2026-10-20")), // commercial inactif
  ];
  db.challenges = [];
  db.nextId = 1;
  db.staleRead = null;
}

beforeEach(() => {
  vi.resetAllMocks();
  seed();
});

const valuesOf = (progress: Awaited<ReturnType<typeof service.challengeProgress>>) => Object.fromEntries(progress!.reps.map((r) => [r.salesRepId, r.value]));

describe("l'avancement compté sur les dossiers réels", () => {
  it("dossiers créés : début inclus, fin exclue, commercial inactif et dossier sans commercial ignorés", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "PROSPECTS_CREATED" }) as never, NOW);
    // alice : p1 + p2 (dernière milliseconde) ; p3 (juste avant le début) hors période ; chloé : p6 (début exact), pas p9 (fin exacte).
    expect(valuesOf(progress)).toEqual({ alice: 2, bob: 2, chloe: 1 });
  });

  it("démonstrations réalisées : un dossier hors période ou à la fin exacte ne compte pas", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "DEMOS_DONE" }) as never, NOW);
    // alice : p1 (8 oct, démo refaite le 20 : une fois) + p3 (2 oct) ; p2 (démo à la fin exacte) exclu ; bob : p4 d'abord en septembre.
    expect(valuesOf(progress)).toEqual({ alice: 2, bob: 0, chloe: 0 });
    expect(progress!.reps.map((r) => [r.name, r.value, r.target, r.percent, r.reached, r.rank])).toEqual([
      ["Alice Martin", 2, 3, 66, false, 1],
      ["Bob Durand", 0, 3, 0, false, null],
      ["Chloé Petit", 0, 3, 0, false, null],
    ]);
  });

  it("contrats signés par l'officine : une officine compte une fois, à sa première signature seulement", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "CONTRACTS_SIGNED" }) as never, NOW);
    // alice : p1 (deux versions signées = 1) ; bob : p8 (30 oct) mais pas p4 (signé d'abord en septembre) ; chloe : signé à la fin exacte = hors période.
    expect(valuesOf(progress)).toEqual({ alice: 1, bob: 1, chloe: 0 });
  });

  it("officines activées : l'événement daté de passage à « Activé », la première fois seulement", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "ACTIVATIONS" }) as never, NOW);
    // alice : p1 (réactivée = 1) + p2 (dernière milliseconde) ; bob : p4 déjà activée en août ; chloe : juste avant le début, et une simple note ; p8 : étape différente puis fin exacte.
    expect(valuesOf(progress)).toEqual({ alice: 2, bob: 0, chloe: 0 });
  });

  it("n'inclut que les commerciaux ACTIFS présents avant la fin : ni Dan (inactif) ni Eve (arrivée en novembre)", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "PROSPECTS_CREATED" }) as never, NOW);
    expect(progress!.reps.map((r) => r.salesRepId).sort()).toEqual(["alice", "bob", "chloe"]);
    expect(progress!.totals).toEqual({ participants: 3, reached: 0, reachedShare: 0, totalValue: 5, totalTarget: 9 });
  });

  it("un objectif atteint est signalé, et la part des commerciaux qui l'ont atteint calculée", async () => {
    const progress = await service.challengeProgress(challengeRow({ metric: "PROSPECTS_CREATED", target: 2 }) as never, NOW);
    expect(progress!.reps.map((r) => [r.salesRepId, r.reached])).toEqual([["alice", true], ["bob", true], ["chloe", false]]);
    expect(progress!.totals).toMatchObject({ participants: 3, reached: 2, totalValue: 5, totalTarget: 6 });
    expect(progress!.totals.reachedShare).toBeCloseTo(2 / 3);
    expect(progress!.state).toBe("ENDED");
  });

  it("accepte l'identifiant d'un challenge : introuvable, c'est null", async () => {
    db.challenges = [challengeRow()];
    expect(await service.challengeProgress("ch_oct", NOW)).toMatchObject({ challengeId: "ch_oct", metric: "DEMOS_DONE" });
    expect(await service.challengeProgress("ch_inconnu", NOW)).toBeNull();
  });

  it("sans commercial actif, rien à compter et aucune requête de dossiers", async () => {
    db.reps = [rep("dan", "Dan", "Roux", { isActive: false })];
    const progress = await service.challengeProgress(challengeRow() as never, NOW);
    expect(progress!.reps).toEqual([]);
    expect(progress!.totals.reachedShare).toBe(0);
  });
});

describe("les listes du directeur", () => {
  it("range les challenges en cours, à venir et terminés, avec les totaux des deux premiers", async () => {
    db.challenges = [
      challengeRow({ id: "fini", metric: "PROSPECTS_CREATED", target: 2 }),
      challengeRow({ id: "courant", startsAt: new Date("2026-10-31T23:00:00Z"), endsAt: new Date("2026-11-30T23:00:00Z"), metric: "PROSPECTS_CREATED" }),
      challengeRow({ id: "futur", startsAt: new Date("2026-12-31T23:00:00Z"), endsAt: new Date("2027-01-31T23:00:00Z") }),
      challengeRow({ id: "arrete", isActive: false, endsAt: new Date("2026-10-10T10:00:00Z") }),
    ];
    const list = await service.listChallenges(NOW);
    expect(list.total).toBe(4);
    expect(list.running.map((i) => i.challenge.id)).toEqual(["courant"]);
    expect(list.upcoming.map((i) => i.challenge.id)).toEqual(["futur"]);
    expect(list.ended.map((i) => [i.challenge.id, i.stoppedEarly])).toEqual([["fini", false], ["arrete", true]]);
    expect(list.upcoming[0].totals).toBeNull();
    expect(list.ended[0].totals).toMatchObject({ participants: 3, reached: 2 });
  });

  it("le détail : l'avancement par commercial, ou null", async () => {
    db.challenges = [challengeRow({ metric: "PROSPECTS_CREATED" })];
    const detail = await service.getChallengeDetail("ch_oct", NOW);
    expect(detail).toMatchObject({ state: "ENDED", stoppedEarly: false });
    expect(detail!.progress.reps).toHaveLength(3);
    expect(await service.getChallengeDetail("absent", NOW)).toBeNull();
  });

  it("les résumés du tableau de bord ne retiennent que les challenges en cours", async () => {
    db.challenges = [challengeRow({ id: "fini" }), challengeRow({ id: "courant", startsAt: new Date("2026-10-31T23:00:00Z"), endsAt: new Date("2026-11-30T23:00:00Z"), metric: "PROSPECTS_CREATED" })];
    const summaries = await service.listRunningChallengeSummaries(NOW);
    expect(summaries.map((s) => s.id)).toEqual(["courant"]);
    expect(summaries[0]).toMatchObject({ title: "Octobre des démos", target: 3, totals: { participants: 4 } });
  });
});

describe("créer un challenge", () => {
  const form = { title: "Novembre des activations", metric: "ACTIVATIONS", target: "2", startsDay: "2026-11-02", endsDay: "2026-11-30", rewardLabel: "Un dîner offert", rewardEuros: "" };

  it("enregistre le challenge au nom du directeur de la session, le trace et prévient chaque commercial actif", async () => {
    const result = await service.createChallenge(form, DIRECTOR, NOW);
    expect(result).toMatchObject({ ok: true, notified: 4, notifyFailed: 0 }); // alice, bob, chloe et eve (arrivée avant la fin) ; pas dan (inactif)
    expect(db.challenges).toHaveLength(1);
    expect(db.challenges[0]).toMatchObject({ title: "Novembre des activations", metric: "ACTIVATIONS", target: 2, isActive: true, createdByType: "DIRECTOR", createdById: "dir_1", createdByLabel: "Dora Directrice", rewardLabel: "Un dîner offert", rewardCents: null });
    expect((db.challenges[0].startsAt as Date).toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect((db.challenges[0].endsAt as Date).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.challenge_saved", entityType: "SalesChallenge", salesDirectorId: "dir_1", metadata: expect.objectContaining({ change: "created", target: 2 }) }));
    expect(mocks.recordAudit.mock.calls[0][0]).not.toHaveProperty("platformAdminId");
    const notified = mocks.notifySalesRep.mock.calls.map(([call]) => call);
    expect(notified.map((n) => n.salesRepId).sort()).toEqual(["alice", "bob", "chloe", "eve"]);
    expect(notified[0]).toMatchObject({ type: "CHALLENGE_CREATED", title: "Nouveau challenge : Novembre des activations", linkUrl: "/extranet/challenges" });
    expect(notified[0].body).toBe("Objectif : 2 officines activées par commercial, du 2 au 30 novembre 2026. Récompense : Un dîner offert.");
  });

  it("un administrateur laisse sa trace sous son propre identifiant", async () => {
    await service.createChallenge(form, ADMIN, NOW);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ platformAdminId: "adm_1" }));
    expect(mocks.recordAudit.mock.calls[0][0]).not.toHaveProperty("salesDirectorId");
    expect(db.challenges[0]).toMatchObject({ createdByType: "ADMIN", createdById: "adm_1" });
  });

  it("refuse une saisie fausse sans rien écrire ni notifier, avec l'erreur sur le bon champ", async () => {
    const result = await service.createChallenge({ ...form, target: "0", startsDay: "2026-10-01", endsDay: "2026-10-31" }, DIRECTOR, NOW);
    expect(result).toMatchObject({ ok: false, fieldErrors: { target: expect.any(String), endsDay: expect.stringContaining("déjà passé") } });
    expect(db.challenges).toHaveLength(0);
    expect(mocks.notifySalesRep).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une notification qui échoue n'annule pas le challenge : l'échec est compté", async () => {
    mocks.notifySalesRep.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("base indisponible")).mockResolvedValue(undefined);
    const result = await service.createChallenge(form, DIRECTOR, NOW);
    expect(result).toMatchObject({ ok: true, notified: 3, notifyFailed: 1 });
    expect(db.challenges).toHaveLength(1);
  });
});

describe("modifier un challenge", () => {
  const form = (extra: Row = {}) => ({ title: "Octobre des démos", metric: "DEMOS_DONE", target: "3", startsDay: "2026-10-01", endsDay: "2026-10-31", rewardLabel: "Prime de 200 €", rewardEuros: "200", ...extra });
  const LIVE = new Date("2026-10-15T10:00:00Z");

  it("challenge inconnu : refusé", async () => {
    expect(await service.updateChallenge("absent", form(), DIRECTOR, LIVE)).toEqual({ ok: false, error: "Challenge introuvable." });
  });

  it("en cours : le titre, l'objectif et la fin se modifient, et la liste des champs changés est tracée", async () => {
    db.challenges = [challengeRow()];
    const result = await service.updateChallenge("ch_oct", form({ title: "Les démos d'octobre", target: "4", endsDay: "2026-11-07" }), DIRECTOR, LIVE);
    expect(result).toEqual({ ok: true, changed: ["titre", "objectif", "dernier jour"] });
    expect(db.challenges[0]).toMatchObject({ title: "Les démos d'octobre", target: 4 });
    expect((db.challenges[0].endsAt as Date).toISOString()).toBe("2026-11-07T23:00:00.000Z");
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.challenge_saved", salesDirectorId: "dir_1", metadata: expect.objectContaining({ change: "updated", fields: ["titre", "objectif", "dernier jour"] }) }));
  });

  it("en cours : changer ce qui est compté ou le premier jour est refusé, jamais ignoré en silence", async () => {
    db.challenges = [challengeRow()];
    const metric = await service.updateChallenge("ch_oct", form({ metric: "ACTIVATIONS" }), DIRECTOR, LIVE);
    expect(metric).toMatchObject({ ok: false, error: expect.stringContaining("ce que le challenge compte ne se modifie plus"), fieldErrors: { metric: "Ne se modifie plus." } });
    const start = await service.updateChallenge("ch_oct", form({ startsDay: "2026-10-05" }), DIRECTOR, LIVE);
    expect(start).toMatchObject({ ok: false, fieldErrors: { startsDay: "Ne se modifie plus." } });
    expect(db.challenges[0]).toMatchObject({ metric: "DEMOS_DONE" });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("en cours : une fin déjà passée est refusée (pour arrêter, « Terminer »)", async () => {
    db.challenges = [challengeRow()];
    const result = await service.updateChallenge("ch_oct", form({ endsDay: "2026-10-14" }), DIRECTOR, LIVE);
    expect(result).toMatchObject({ ok: false, fieldErrors: { endsDay: expect.stringContaining("Terminer") } });
  });

  it("à venir : tout se modifie ; terminé : seuls les textes et la récompense", async () => {
    db.challenges = [challengeRow({ startsAt: new Date("2026-12-01T23:00:00Z"), endsAt: new Date("2026-12-31T23:00:00Z") })];
    const upcoming = await service.updateChallenge("ch_oct", form({ metric: "CONTRACTS_SIGNED", startsDay: "2026-12-05", endsDay: "2026-12-20" }), DIRECTOR, LIVE);
    expect(upcoming).toMatchObject({ ok: true });
    expect(db.challenges[0]).toMatchObject({ metric: "CONTRACTS_SIGNED" });

    db.challenges = [challengeRow()];
    const ended = await service.updateChallenge("ch_oct", form({ title: "Octobre (bilan)", rewardLabel: "Prime versée" }), DIRECTOR, NOW);
    expect(ended).toEqual({ ok: true, changed: ["titre", "récompense"] });
    const lateTarget = await service.updateChallenge("ch_oct", form({ target: "9" }), DIRECTOR, NOW);
    expect(lateTarget).toMatchObject({ ok: false, error: expect.stringContaining("Le challenge est terminé") });
    expect(db.challenges[0]).toMatchObject({ target: 3 });
  });

  it("terminé à la main : la fin est l'instant du geste ; le formulaire ne la change pas, et titre, texte et récompense restent modifiables", async () => {
    const stoppedAt = new Date("2026-10-15T09:30:00Z");
    db.challenges = [challengeRow({ isActive: false, endsAt: stoppedAt })];
    const result = await service.updateChallenge("ch_oct", form({ endsDay: "2026-10-15", title: "Octobre (arrêté)", rewardLabel: "Prime partagée" }), DIRECTOR, new Date("2026-10-20T10:00:00Z"));
    expect(result).toEqual({ ok: true, changed: ["titre", "récompense"] });
    // La période n'a pas bougé : le challenge arrêté ne reprend pas jusqu'à minuit.
    expect(db.challenges[0].endsAt).toEqual(stoppedAt);
    expect(db.challenges[0].startsAt).toEqual(OCT_START);
    // Changer vraiment le jour de fin reste refusé.
    const moved = await service.updateChallenge("ch_oct", form({ endsDay: "2026-10-31" }), DIRECTOR, new Date("2026-10-20T10:00:00Z"));
    expect(moved).toMatchObject({ ok: false, error: expect.stringContaining("le dernier jour") });
  });

  it("aucun changement : rien n'est écrit ni tracé", async () => {
    db.challenges = [challengeRow()];
    expect(await service.updateChallenge("ch_oct", form(), DIRECTOR, LIVE)).toEqual({ ok: true, changed: [] });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("terminer un challenge", () => {
  const LIVE = new Date("2026-10-15T10:00:00Z");

  it("un challenge en cours s'arrête maintenant : sa période se ferme et les résultats se figent", async () => {
    db.challenges = [challengeRow({ metric: "PROSPECTS_CREATED" })];
    const result = await service.endChallenge("ch_oct", DIRECTOR, LIVE);
    expect(result).toEqual({ ok: true, title: "Octobre des démos" });
    expect(db.challenges[0]).toMatchObject({ isActive: false, endsAt: LIVE });
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.challenge_saved", salesDirectorId: "dir_1", metadata: expect.objectContaining({ change: "ended" }) }));
    // Les dossiers créés après l'arrêt (15 oct) ne comptent plus : p4 (10 oct) oui, p8 (15 oct à 10 h UTC, exactement) non.
    const progress = await service.challengeProgress("ch_oct", NOW);
    expect(valuesOf(progress)).toEqual({ alice: 1, bob: 1, chloe: 1 });
    expect(progress!.state).toBe("ENDED");
  });

  it("refuse un challenge à venir, déjà terminé ou inconnu", async () => {
    db.challenges = [challengeRow({ id: "futur", startsAt: new Date("2026-12-01T23:00:00Z"), endsAt: new Date("2026-12-31T23:00:00Z") }), challengeRow({ id: "fini" })];
    expect(await service.endChallenge("futur", DIRECTOR, LIVE)).toMatchObject({ ok: false, error: expect.stringContaining("supprimez-le") });
    expect(await service.endChallenge("fini", DIRECTOR, NOW)).toMatchObject({ ok: false, error: "Ce challenge est déjà terminé." });
    expect(await service.endChallenge("absent", DIRECTOR, LIVE)).toEqual({ ok: false, error: "Challenge introuvable." });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("si le challenge a bougé entre la lecture et l'écriture, le geste est refusé", async () => {
    const current = challengeRow({ updatedAt: new Date("2026-10-15T09:59:00Z") });
    db.challenges = [current];
    // La lecture rend l'état d'avant un autre geste : `updatedAt` ne correspond plus à la ligne.
    db.staleRead = { ...current, updatedAt: new Date("2026-10-01T00:00:00Z") };
    const result = await service.endChallenge("ch_oct", DIRECTOR, LIVE);
    expect(result).toEqual({ ok: false, error: "Le challenge a changé entre-temps. Rechargez la page." });
    expect(db.challenges[0]).toMatchObject({ isActive: true });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("supprimer un challenge", () => {
  it("supprime la ligne et laisse une trace avec le titre et l'état", async () => {
    db.challenges = [challengeRow(), challengeRow({ id: "autre" })];
    const result = await service.deleteChallenge("ch_oct", DIRECTOR, NOW);
    expect(result).toEqual({ ok: true, title: "Octobre des démos" });
    expect(db.challenges.map((c) => c.id)).toEqual(["autre"]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.challenge_deleted", entityId: "ch_oct", salesDirectorId: "dir_1", metadata: { title: "Octobre des démos", metric: "DEMOS_DONE", state: "ENDED" } }));
  });

  it("un challenge inconnu : refus clair, rien de tracé", async () => {
    expect(await service.deleteChallenge("absent", DIRECTOR, NOW)).toEqual({ ok: false, error: "Challenge introuvable." });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("les challenges vus d'un commercial", () => {
  it("son avancement et son rang, et pour les autres seulement prénom + initiale, rang et résultat", async () => {
    db.challenges = [challengeRow({ metric: "PROSPECTS_CREATED" })];
    const view = await service.challengesOfRep("bob", NOW);
    expect(view.running).toEqual([]);
    expect(view.ended).toHaveLength(1);
    const row = view.ended[0];
    expect(row.mine).toEqual({ value: 2, target: 3, percent: 66, reached: false, rank: 1 });
    expect(row.participants).toBe(3);
    expect(row.ranking).toEqual([
      { rank: 1, name: "Alice M.", value: 2, isMe: false },
      { rank: 1, name: "Bob D.", value: 2, isMe: true },
      { rank: 3, name: "Chloé P.", value: 1, isMe: false },
    ]);
    // Rien d'identifiant ni de nom complet d'un autre commercial dans ce qui part vers l'extranet.
    const sent = JSON.stringify(view);
    for (const secret of ["alice", "chloe", "Martin", "Petit", "Roux"]) expect(sent).not.toContain(secret);
  });

  it("un commercial qui ne participe pas (inactif) n'a pas d'avancement, mais voit le classement", async () => {
    db.challenges = [challengeRow({ metric: "PROSPECTS_CREATED" })];
    const view = await service.challengesOfRep("dan", NOW);
    expect(view.ended[0].mine).toBeNull();
    expect(view.ended[0].ranking).toHaveLength(3);
  });

  it("à venir : le titre et la période seulement, ni avancement ni classement", async () => {
    db.challenges = [challengeRow({ id: "futur", startsAt: new Date("2026-12-01T23:00:00Z"), endsAt: new Date("2026-12-31T23:00:00Z") })];
    const view = await service.challengesOfRep("alice", NOW);
    expect(view.upcoming).toHaveLength(1);
    expect(view.upcoming[0]).toMatchObject({ mine: null, ranking: [], state: "UPCOMING" });
  });

  it("ne garde que les dix terminés les plus récents", async () => {
    db.challenges = Array.from({ length: 13 }, (_, i) => challengeRow({ id: `ch_${i}`, startsAt: new Date(Date.UTC(2025, i % 12, 1)), endsAt: new Date(Date.UTC(2025, i % 12, 20)) }));
    const view = await service.challengesOfRep("alice", NOW);
    expect(view.ended).toHaveLength(10);
  });
});
