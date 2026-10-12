import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le comptoir revient tout seul à la personne connectée sur le PC lié (plus de « Je travaille ici ») : une personne, un
 * comptoir ; la précédente le perd ; rien n'est écrit quand rien ne change ; tout reste dans la pharmacie de la session.
 */

const m = vi.hoisted(() => ({ postFindMany: vi.fn(), postUpdateMany: vi.fn(), auditFindFirst: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { counterPost: { findMany: m.postFindMany, updateMany: m.postUpdateMany }, auditLog: { findFirst: m.auditFindFirst }, $transaction: m.transaction } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));

const { takeComptoirOnThisPc } = await import("../comptoirs");
const { resolveMyComptoirs } = await import("@/core/counter/comptoirs");
const { shouldTakeLinkedPost } = await import("@/core/counter/post-link");
const lea = { pharmacyId: "ph1", userId: "lea" };

beforeEach(() => {
  vi.clearAllMocks();
  m.postFindMany.mockResolvedValue([
    { id: "p1", assignedUserId: "lea" },
    { id: "p2", assignedUserId: null },
    { id: "p3", assignedUserId: "hugo" },
  ]);
  m.postUpdateMany.mockResolvedValue({ count: 1 });
  m.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  m.audit.mockResolvedValue(undefined);
  m.auditFindFirst.mockResolvedValue(null);
});

describe("le comptoir revient à la personne connectée sur ce PC", () => {
  it("prend le comptoir du PC, libère son ancien comptoir (une personne, un comptoir), garde la trace", async () => {
    expect(await takeComptoirOnThisPc(lea, "p2")).toEqual({ changed: true });
    expect(m.postFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph1", revokedAt: null, pairedAt: { not: null } } }));
    expect(m.postUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1"] }, pharmacyId: "ph1", assignedUserId: "lea" }, data: { assignedUserId: null } });
    expect(m.postUpdateMany).toHaveBeenCalledWith({ where: { id: "p2", pharmacyId: "ph1", revokedAt: null, OR: [{ assignedUserId: null }, { assignedUserId: { not: "lea" } }] }, data: { assignedUserId: "lea" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.taken", entityId: "p2", pharmacyId: "ph1", userId: "lea", metadata: { previous: null, released: ["p1"], via: "pc" } }));
    // Ce qui a posé l'ancien comptoir se lit dans le journal de SA pharmacie (ici : aucune trace, donc libéré).
    expect(m.auditFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ pharmacyId: "ph1", entityType: "CounterPost", entityId: "p1" }) }));
  });

  it("le comptoir d'un collègue : la personne précédente le perd, la trace dit qui l'occupait", async () => {
    await takeComptoirOnThisPc(lea, "p3");
    expect(m.postUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "p3", pharmacyId: "ph1" }), data: { assignedUserId: "lea" } }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { previous: "hugo", released: ["p1"], via: "pc" } }));
  });

  it("idempotent : son propre comptoir (et aucun autre) n'écrit rien", async () => {
    expect(await takeComptoirOnThisPc(lea, "p1")).toEqual({ changed: false });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.postUpdateMany).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("deux pages ouvertes en même temps : la seconde, qui ne change plus rien, ne laisse pas de trace", async () => {
    m.postUpdateMany.mockResolvedValue({ count: 0 });
    expect(await takeComptoirOnThisPc(lea, "p2")).toEqual({ changed: false });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("un comptoir d'une autre pharmacie (absent de la liste de SA pharmacie) n'est jamais pris", async () => {
    expect(await takeComptoirOnThisPc(lea, "p-autre-pharmacie")).toEqual({ changed: false });
    expect(m.postUpdateMany).not.toHaveBeenCalled();
  });

  it("une pharmacie à un seul comptoir : il revient à la personne connectée, sans rien libérer", async () => {
    m.postFindMany.mockResolvedValue([{ id: "p1", assignedUserId: null }]);
    expect(await takeComptoirOnThisPc({ pharmacyId: "ph1", userId: "marc" }, "p1")).toEqual({ changed: true });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { previous: null, released: [], via: "pc" } }));
  });
});

/**
 * Une petite base en mémoire (les comptoirs de la pharmacie ph1 et le journal), avec le vrai `takeComptoirOnThisPc` et la
 * vraie règle de la coquille (`shouldTakeLinkedPost`) : on rejoue les pages affichées sur chaque PC.
 */
type Row = { id: string; pharmacyId: string; revokedAt: Date | null; assignedUserId: string | null };
type Trace = { pharmacyId: string; entityId: string; action: string; userId: string | null };
function memoryBase(posts: { id: string; assignedUserId: string | null }[], journal: Trace[] = []) {
  const rows: Row[] = posts.map((post) => ({ ...post, pharmacyId: "ph1", revokedAt: null }));
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "OR") return (value as Record<string, unknown>[]).some((clause) => matches(row, clause));
      if (value && typeof value === "object" && "in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
      if (value && typeof value === "object" && "not" in value) return row[key] !== null && row[key] !== undefined ? row[key] !== (value as { not: unknown }).not : (value as { not: unknown }).not !== null;
      return row[key] === value;
    });
  m.postFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches({ ...row, pairedAt: new Date(0) }, where)).map(({ id, assignedUserId }) => ({ id, assignedUserId })));
  m.postUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
    const hit = rows.filter((row) => matches(row, where));
    hit.forEach((row) => Object.assign(row, data));
    return { count: hit.length };
  });
  m.auditFindFirst.mockImplementation(async ({ where }: { where: { pharmacyId: string; entityType: string; entityId: string; action: { in: string[] } } }) =>
    [...journal].reverse().find((trace) => where.entityType === "CounterPost" && trace.pharmacyId === where.pharmacyId && trace.entityId === where.entityId && where.action.in.includes(trace.action)) ?? null,
  );
  m.audit.mockImplementation(async (entry: Trace) => void journal.push({ pharmacyId: entry.pharmacyId, entityId: entry.entityId, action: entry.action, userId: entry.userId }));
  /** Une page de l'espace affichée sur le navigateur lié au poste `postId`, avec la session de `userId` (comme thisPcComptoir). */
  const render = async (userId: string, postId: string) => {
    const post = rows.find((row) => row.id === postId) ?? null;
    const link = { postId, pharmacyId: "ph1" };
    if (shouldTakeLinkedPost({ sessionPharmacyId: "ph1", userId, canTakeSales: true, link, post: post && { ...post, pairedAt: new Date(0) } })) await takeComptoirOnThisPc({ pharmacyId: "ph1", userId }, postId);
  };
  const view = () => rows.map(({ id, assignedUserId }) => ({ id, label: null, hostname: `PC-${id}`, assignedUserId }));
  return { render, view, assignees: () => rows.map((row) => row.assignedUserId) };
}

describe("un même compte ouvert sur deux PC liés", () => {
  it("chaque PC garde son comptoir : les pages ne le font plus passer de l'un à l'autre, chaque écran montre SES ventes, chaque bip a son collaborateur", async () => {
    // Le titulaire a installé chaque poste depuis son espace, dans le navigateur du PC : sa session est sur les deux.
    const base = memoryBase([{ id: "p1", assignedUserId: null }, { id: "p2", assignedUserId: null }]);
    await base.render("adam", "p1");
    await base.render("adam", "p2");
    expect(base.assignees()).toEqual(["adam", "adam"]);
    const writes = m.postUpdateMany.mock.calls.length;
    for (let page = 0; page < 3; page++) {
      await base.render("adam", "p1");
      await base.render("adam", "p2");
    }
    // Plus aucune écriture : ni bascule, ni trace à chaque page.
    expect(m.postUpdateMany.mock.calls.length).toBe(writes);
    // Un bip à l'un ou l'autre PC trouve son collaborateur (counter-scan lit assignedUserId au moment du bip).
    expect(base.assignees()).toEqual(["adam", "adam"]);
    // Sur le navigateur lié, l'écran est celui de CE poste : le PC1 ne montre jamais les ventes du PC2, ni l'inverse.
    expect(resolveMyComptoirs(base.view(), "adam", "p1")).toEqual({ postIds: ["p1"], mode: "MINE" });
    expect(resolveMyComptoirs(base.view(), "adam", "p2")).toEqual({ postIds: ["p2"], mode: "MINE" });
    // Ailleurs (son Mac, son téléphone), ses deux comptoirs.
    expect(resolveMyComptoirs(base.view(), "adam", null)).toEqual({ postIds: ["p1", "p2"], mode: "MINE" });
    // Léa ouvre son espace sur le PC1 : il est à elle ; le PC2 reste au titulaire, sans bascule ensuite.
    await base.render("lea", "p1");
    await base.render("adam", "p2");
    await base.render("lea", "p1");
    expect(base.assignees()).toEqual(["lea", "adam"]);
  });

  it("une attribution de secours (« Mes comptoirs »), elle, est libérée dès que la personne ouvre son espace sur un PC lié", async () => {
    const base = memoryBase([{ id: "p1", assignedUserId: null }, { id: "p2", assignedUserId: "adam" }], [{ pharmacyId: "ph1", entityId: "p2", action: "counter_post.assigned", userId: "titulaire" }]);
    await base.render("adam", "p1");
    expect(base.assignees()).toEqual(["adam", null]);
  });

  it("le journal d'une autre pharmacie ne compte pas : une trace « pris sur ce PC » ailleurs ne retient rien ici", async () => {
    const base = memoryBase([{ id: "p1", assignedUserId: null }, { id: "p2", assignedUserId: "adam" }], [{ pharmacyId: "ph-autre", entityId: "p2", action: "counter_post.taken", userId: "adam" }]);
    await base.render("adam", "p1");
    expect(base.assignees()).toEqual(["adam", null]);
  });

  it("un comptoir pris sur un PC lié puis repris par un collègue, puis rendu en secours : c'est la dernière trace qui fait foi", async () => {
    const base = memoryBase([{ id: "p1", assignedUserId: null }, { id: "p2", assignedUserId: "adam" }], [
      { pharmacyId: "ph1", entityId: "p2", action: "counter_post.taken", userId: "adam" },
      { pharmacyId: "ph1", entityId: "p2", action: "counter_post.taken", userId: "lea" },
      { pharmacyId: "ph1", entityId: "p2", action: "counter_post.assigned", userId: "titulaire" },
    ]);
    await base.render("adam", "p1");
    expect(base.assignees()).toEqual(["adam", null]);
  });
});
