import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le tableau de bord du comptoir lit la base : ce qui est éprouvé ici, ce sont les RÈGLES de comptage —
 * une délivrance « détectée » vient d'un bip de douchette, les conseils acceptés et refusés sont ceux
 * d'aujourd'hui, les noms de patient disparaissent en mode sans patient, et l'activité garde ce qui est resté ouvert.
 */

const mocks = vi.hoisted(() => ({
  prescriptionCount: vi.fn(),
  prescriptionFindMany: vi.fn(),
  saleAggregate: vi.fn(),
  recommendationGroupBy: vi.fn(),
  listCounterPosts: vi.fn(),
  myComptoirs: vi.fn(),
  patientData: { value: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    prescription: { count: mocks.prescriptionCount, findMany: mocks.prescriptionFindMany },
    sale: { aggregate: mocks.saleAggregate },
    recommendation: { groupBy: mocks.recommendationGroupBy },
  },
}));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));
vi.mock("@/server/services/comptoirs", () => ({ myComptoirs: mocks.myComptoirs }));
vi.mock("@/server/services/stock-sync", () => ({ listCounterPosts: mocks.listCounterPosts }));
vi.mock("@/config/env", () => ({ patientDataEnabled: () => mocks.patientData.value }));

const { loadCounterDashboard, startOfParisDay } = await import("../counter-dashboard");

const scope = { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_1" } as never;
// 12:00 UTC = 14:00 à Paris : minuit à Paris est à 22:00 UTC la veille.
const NOW = new Date("2026-10-08T12:00:00.000Z");

function prescription(overrides: Record<string, unknown> = {}) {
  return { id: "rx1", reference: "ORD-0001", status: "ANALYZED", createdAt: new Date("2026-10-08T10:32:00.000Z"), patient: { firstName: "Camille", lastName: "Durand" }, counterPostId: "p1", lines: [{ drugName: "DOLIPRANE 1 g", quantity: 1 }, { drugName: "AUGMENTIN", quantity: 2 }], _count: { lines: 3, recommendations: 2 }, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.patientData.value = true;
  mocks.listCounterPosts.mockResolvedValue([]);
  // Un comptoir, celui de usr_1 : « Comptoir 1 · Léa Martin ».
  mocks.myComptoirs.mockResolvedValue({ postIds: ["p1"], mode: "MINE", posts: [{ id: "p1", label: "Comptoir 1", hostname: "PC-1", assignedUserId: "usr_1", name: "Comptoir 1", assigneeName: "Léa Martin" }] });
  mocks.prescriptionCount.mockResolvedValue(0);
  mocks.prescriptionFindMany.mockResolvedValue([]);
  mocks.saleAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { attributedCents: null } });
  mocks.recommendationGroupBy.mockResolvedValue([]);
});

describe("le comptage du jour", () => {
  it("minuit se compte à Paris, pas à l'heure du serveur", () => {
    expect(startOfParisDay(NOW).toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });

  it("une délivrance détectée vient d'un bip de douchette, aujourd'hui, jamais d'une vente supprimée", async () => {
    mocks.prescriptionCount.mockResolvedValue(4);
    const data = await loadCounterDashboard(scope, NOW);
    expect(data.stats.detected).toBe(4);
    const where = mocks.prescriptionCount.mock.calls[0][0].where;
    // Seulement MES comptoirs : jamais les délivrances d'un collègue.
    expect(where).toMatchObject({ pharmacyId: "ph_1", source: "COUNTER_SCAN", deletedAt: null, isDemo: false, counterPostId: { in: ["p1"] } });
    expect(where.createdAt.gte.toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });

  it("les conseils acceptés (ou achetés) et refusés sont ceux d'aujourd'hui seulement", async () => {
    mocks.recommendationGroupBy.mockResolvedValue([
      { status: "ACCEPTED", _count: { _all: 3 } },
      { status: "PURCHASED", _count: { _all: 1 } },
      { status: "DECLINED", _count: { _all: 2 } },
      { status: "PENDING", _count: { _all: 9 } },
    ]);
    const data = await loadCounterDashboard(scope, NOW);
    expect(data.stats).toMatchObject({ accepted: 4, declined: 2 });
    expect(mocks.recommendationGroupBy.mock.calls[0][0].where.decidedAt.gte.toISOString()).toBe("2026-10-07T22:00:00.000Z");
    // Les conseils tranchés sur MES ventes (mon comptoir, ou ce que j'ai saisi), pas sur celles des autres.
    expect(mocks.recommendationGroupBy.mock.calls[0][0].where.prescription.OR[0]).toEqual({ counterPostId: { in: ["p1"] } });
  });

  it("les ventes additionnelles sont celles qui ont été attribuées aux conseils", async () => {
    mocks.saleAggregate.mockResolvedValue({ _count: { _all: 5 }, _sum: { attributedCents: 1790 } });
    expect((await loadCounterDashboard(scope, NOW)).stats).toMatchObject({ salesCount: 5, attributedCents: 1790 });
    // Les ventes que J'ai encaissées.
    expect(mocks.saleAggregate.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", userId: "usr_1" });
  });
});

describe("l'activité récente", () => {
  it("garde aujourd'hui ET ce qui est resté ouvert depuis deux jours : « à reprendre » ne disparaît pas", async () => {
    await loadCounterDashboard(scope, NOW);
    const where = mocks.prescriptionFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ pharmacyId: "ph_1", deletedAt: null });
    const [mine, recent] = where.AND;
    expect(mine.OR[0]).toEqual({ counterPostId: { in: ["p1"] } });
    expect(mine.OR[1]).toEqual({ source: { not: "COUNTER_SCAN" }, handledByUserId: "usr_1" });
    expect(recent.OR).toHaveLength(2);
    expect(recent.OR[0].createdAt.gte.toISOString()).toBe("2026-10-07T22:00:00.000Z");
    expect(recent.OR[1]).toMatchObject({ sales: { none: {} } });
    expect(recent.OR[1].status.in).toEqual(expect.arrayContaining(["NEEDS_VERIFICATION", "ANALYZED", "VALIDATED"]));
    expect(recent.OR[1].status.in).not.toContain("CANCELLED");
    expect(recent.OR[1].createdAt.gte.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(mocks.prescriptionFindMany.mock.calls[0][0].take).toBe(6);
  });

  it("dit l'heure à Paris, les produits, le patient et où en est la vente", async () => {
    mocks.prescriptionFindMany.mockResolvedValue([prescription(), prescription({ id: "rx2", reference: "ORD-0002", status: "NEEDS_VERIFICATION", patient: null, createdAt: new Date("2026-10-07T16:05:00.000Z"), lines: [{ drugName: null, quantity: 1 }], counterPostId: null, _count: { lines: 1, recommendations: 0 } })]);
    const { activity } = await loadCounterDashboard(scope, NOW);
    // Une ordonnance, ses médicaments l'un sous l'autre, et le comptoir d'où elle vient.
    expect(activity[0]).toMatchObject({ id: "rx1", when: "12:32", patient: "DURAND Camille", lines: [{ name: "DOLIPRANE 1 g", quantity: 1 }, { name: "AUGMENTIN", quantity: 2 }], moreLines: 1, comptoir: "Comptoir 1 · Léa Martin", stage: { label: "2 conseils à décider" }, reference: "ORD-0001" });
    expect(activity[1]).toMatchObject({ when: "hier 18:05", patient: null, lines: [], moreLines: 1, comptoir: null, stage: { label: "à confirmer" } });
  });

  it("en mode sans patient, aucun nom de patient n'est montré", async () => {
    mocks.patientData.value = false;
    mocks.prescriptionFindMany.mockResolvedValue([prescription()]);
    expect((await loadCounterDashboard(scope, NOW)).activity[0].patient).toBeNull();
  });
});

describe("l'état du comptoir lu en base", () => {
  it("un poste appairé qui répond rend le comptoir prêt", async () => {
    mocks.listCounterPosts.mockResolvedValue([{ id: "p1", label: "Comptoir 1", hostname: "PC-1", pairedAt: new Date("2026-10-01T08:00:00.000Z"), lastSeenAt: new Date("2026-10-08T11:59:30.000Z"), lastScanAt: null, scanCount: 0, version: "0.4.2", pairingExpiresAt: null }]);
    const { status } = await loadCounterDashboard(scope, NOW);
    expect(status.state).toBe("READY");
    expect(status.posts).toEqual([{ id: "p1", label: "Comptoir 1", owner: "Léa Martin", online: true }]);
  });

  it("les postes des collègues ne sont jamais dans MON état : seulement les miens", async () => {
    mocks.listCounterPosts.mockResolvedValue([
      { id: "p1", label: "Comptoir 1", hostname: "PC-1", pairedAt: new Date("2026-10-01T08:00:00.000Z"), lastSeenAt: new Date("2026-10-08T11:59:30.000Z"), lastScanAt: null, scanCount: 0, version: "0.4.2", pairingExpiresAt: null },
      { id: "p2", label: "Comptoir 2", hostname: "PC-2", pairedAt: new Date("2026-10-01T08:00:00.000Z"), lastSeenAt: new Date("2026-10-08T11:59:30.000Z"), lastScanAt: null, scanCount: 0, version: "0.4.2", pairingExpiresAt: null },
    ]);
    const { status } = await loadCounterDashboard(scope, NOW);
    expect(status.posts.map((post) => post.id)).toEqual(["p1"]);
  });

  it("plusieurs comptoirs et aucun pour moi : aucune délivrance comptée ni montrée", async () => {
    mocks.myComptoirs.mockResolvedValue({ postIds: [], mode: "NONE", posts: [] });
    const data = await loadCounterDashboard(scope, NOW);
    expect(mocks.prescriptionCount.mock.calls[0][0].where.counterPostId).toEqual({ in: [] });
    expect(data.stats.detected).toBe(0);
  });

  it("sans poste, le comptoir n'est pas connecté", async () => {
    expect((await loadCounterDashboard(scope, NOW)).status.state).toBe("NOT_CONNECTED");
  });
});
