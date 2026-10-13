import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Au comptoir » lit les ventes avec la règle de toujours : chacun voit SES comptoirs (resolveMyComptoirs, le poste du
 * navigateur lié d'abord), toujours dans l'officine de la session. Le titulaire n'a pas de passe-droit.
 */

const m = vi.hoisted(() => ({ myComptoirs: vi.fn(), listLive: vi.fn(), findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { prescription: { findMany: m.findMany } } }));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));
vi.mock("@/server/services/comptoirs", () => ({ myComptoirs: m.myComptoirs }));
vi.mock("@/server/services/counter-scan", () => ({ listLiveCounterSales: m.listLive }));
vi.mock("@/server/services/counter-dashboard", () => ({ startOfParisDay: () => new Date("2026-10-12T22:00:00Z") }));

const { loadFinishedToday, loadLiveBoard } = await import("../counter-board");

const SCOPE = { pharmacyId: "ph_A", organizationId: "org_A", userId: "u_lea" };
const POSTS = [
  { id: "post_1", label: "Comptoir 1", hostname: "POSTE1", assignedUserId: "u_lea", assigneeName: "Léa Martin" },
  { id: "post_2", label: "Comptoir 2", hostname: "POSTE2", assignedUserId: "u_paul", assigneeName: "Paul Durand" },
];

beforeEach(() => {
  vi.resetAllMocks();
  m.myComptoirs.mockResolvedValue({ postIds: ["post_1"], mode: "MINE", posts: POSTS });
  m.listLive.mockResolvedValue([
    {
      id: "rx1",
      reference: "ORD-0042",
      status: "ANALYZED",
      counterPost: "POSTE1",
      counterPostId: "post_1",
      updatedAt: new Date("2026-10-13T08:30:00Z"),
      lines: [{ drugName: "AMOXICILLINE 1 g", quantity: 2 }],
      recommendations: [
        { status: "PURCHASED", product: { name: "Probiotique" }, presentation: null },
        { status: "PROPOSED", product: null, presentation: { specialty: { name: "Spray nasal" } } },
        { status: "REMOVED", product: { name: "Crème retirée" }, presentation: null },
      ],
      _count: { recommendations: 3 },
    },
  ]);
  m.findMany.mockResolvedValue([
    { id: "rx0", reference: "ORD-0041", updatedAt: new Date("2026-10-13T08:00:00Z"), counterPost: "POSTE1", counterPostId: "post_1", counterFollowUp: { closedAt: new Date("2026-10-13T08:05:00Z") }, lines: [{ drugName: "DOLIPRANE 1000", quantity: 1 }], recommendations: [{ status: "PURCHASED", product: { name: "Poche chaud/froid dos" }, presentation: null }, { status: "DECLINED", product: { name: "Patch chauffant" }, presentation: null }, { status: "REMOVED", product: { name: "Gel arnica" }, presentation: null }] },
  ]);
});

describe("les délivrances en cours", () => {
  it("ne lit que MES comptoirs (ceux de resolveMyComptoirs), le poste du navigateur lié passé tel quel", async () => {
    await loadLiveBoard(SCOPE, "post_1");
    expect(m.myComptoirs).toHaveBeenCalledWith(SCOPE, "post_1");
    expect(m.listLive).toHaveBeenCalledWith("ph_A", ["post_1"]);
  });

  it("dit le comptoir et sa personne, les médicaments scannés et l'état de chaque conseil", async () => {
    const [sale] = await loadLiveBoard(SCOPE, null);
    expect(sale).toMatchObject({ id: "rx1", comptoir: "Comptoir 1 · Léa Martin", lines: [{ drugName: "AMOXICILLINE 1 g", quantity: 2 }], recommendations: 3 });
    expect(sale.advice).toEqual([
      { name: "Probiotique", outcome: "SOLD" },
      { name: "Spray nasal", outcome: "PROPOSED" },
    ]);
  });

  it("sans comptoir à moi, rien n'est montré (la liste des postes est vide)", async () => {
    m.myComptoirs.mockResolvedValueOnce({ postIds: [], mode: "NONE", posts: POSTS });
    m.listLive.mockResolvedValueOnce([]);
    expect(await loadLiveBoard(SCOPE, null)).toEqual([]);
    expect(m.listLive).toHaveBeenCalledWith("ph_A", []);
  });
});

describe("les ventes terminées aujourd'hui", () => {
  it("lit l'officine de la session, aujourd'hui, mes comptoirs ou mes saisies à la main", async () => {
    await loadFinishedToday(SCOPE, null, new Date("2026-10-13T09:00:00Z"));
    const where = m.findMany.mock.calls[0][0].where;
    expect(where.pharmacyId).toBe("ph_A");
    expect(where.deletedAt).toBeNull();
    expect(where.createdAt).toEqual({ gte: new Date("2026-10-12T22:00:00Z") });
    expect(where.AND[0]).toEqual({ OR: [{ source: "COUNTER_SCAN", counterPostId: { in: ["post_1"] } }, { source: { not: "COUNTER_SCAN" }, handledByUserId: "u_lea" }] });
    // Jamais le comptoir d'un collègue.
    expect(JSON.stringify(where)).not.toContain("post_2");
  });

  it("donne l'heure de fin, les médicaments et les conseils vendus sur proposés (sans les retirés)", async () => {
    const [sale] = await loadFinishedToday(SCOPE, null);
    expect(sale).toEqual({ id: "rx0", reference: "ORD-0041", finishedAt: "2026-10-13T08:05:00.000Z", comptoir: "Comptoir 1 · Léa Martin", lines: [{ drugName: "DOLIPRANE 1000", quantity: 1 }], soldCount: 1, adviceCount: 2, sold: ["Poche chaud/froid dos"] });
  });
});
