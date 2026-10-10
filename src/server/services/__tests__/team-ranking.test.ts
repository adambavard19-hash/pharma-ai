import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ queryRaw: vi.fn(), members: vi.fn(), running: vi.fn(), events: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { $queryRaw: m.queryRaw, recommendationEvent: { findMany: m.events } } }));
vi.mock("@/server/services/comptoirs", () => ({ listMembers: m.members }));
vi.mock("@/server/services/challenges", () => ({ listRunningChallengesForPilotage: m.running }));
vi.mock("@/server/services/counter-window", () => ({ COUNTER_DECLARED: "COUNTER_DECLARED" }));

const { loadTeamRanking, loadTeamChallenges } = await import("../team-ranking");
const people = [{ id: "lea", name: "Léa Martin", role: "PHARMACIST" }, { id: "marc", name: "Marc Durand", role: "PREPARER" }];
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "titulaire", isDemo: false } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.members.mockResolvedValue(people);
});

describe("le classement lu en base", () => {
  it("compte les conseils de la pharmacie sur la période, par collaborateur de la vente", async () => {
    m.queryRaw.mockResolvedValue([{ userId: "marc", status: "PURCHASED", count: 4 }, { userId: "lea", status: "ACCEPTED", count: 2 }, { userId: "lea", status: "DECLINED", count: 1 }]);
    const { rows } = await loadTeamRanking(scope, { start: new Date("2026-10-01"), end: new Date("2026-11-01") });
    expect(rows.map((row) => [row.name, row.proposed, row.validated, row.rank])).toEqual([["Marc Durand", 4, 4, 1], ["Léa Martin", 3, 2, 2]]);
    const [strings, ...values] = m.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toContain('r."pharmacyId" = ?');
    expect(values[0]).toBe("ph1");
    expect(values).toContainEqual(new Date("2026-10-01"));
  });

  it("une pharmacie neuve sans aucun conseil : toute l'équipe est là, à zéro, sans taux inventé", async () => {
    m.queryRaw.mockResolvedValue([]);
    const { rows, totals } = await loadTeamRanking(scope, { start: new Date("2026-10-01"), end: new Date("2026-11-01") });
    expect(rows).toHaveLength(2);
    expect(totals).toEqual({ proposed: 0, validated: 0, rate: null });
  });
});

describe("les challenges par collaborateur", () => {
  const challenge = (over = {}) => ({ id: "c1", title: "Challenge Avène", laboratory: "Avène", startsOn: "2026-10-01", endsOn: "2026-10-31", progress: { units: 10, target: 40, targetIsImplicit: false, daysRemaining: 20 }, byCollaborator: [{ key: "lea", label: "Léa Martin", initials: "LM", units: 6 }, { key: "none", label: "Sans auteur", initials: "—", units: 4 }], ...over });

  it("ajoute les produits du challenge déclarés vendus au comptoir aux ventes enregistrées de chacun", async () => {
    m.running.mockResolvedValue([challenge()]);
    m.events.mockResolvedValue([
      { recommendationId: "r1", recommendation: { decidedByUserId: "marc", decidedAt: new Date("2026-10-05"), quantity: 1 } },
      { recommendationId: "r1", recommendation: { decidedByUserId: "marc", decidedAt: new Date("2026-10-05"), quantity: 1 } },
      { recommendationId: "r2", recommendation: { decidedByUserId: "lea", decidedAt: new Date("2026-10-06"), quantity: 2 } },
      { recommendationId: "r3", recommendation: { decidedByUserId: "marc", decidedAt: new Date("2026-09-20"), quantity: 1 } },
    ]);
    const [result] = await loadTeamChallenges(scope);
    // r1 compte une fois (reprise de réponse = deux événements), r3 est avant le début du challenge.
    expect(result.people).toEqual([{ userId: "lea", name: "Léa Martin", units: 8 }, { userId: "marc", name: "Marc Durand", units: 1 }]);
    expect(result.units).toBe(10 + 3);
    expect(result.target).toBe(40);
    expect(m.events).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ metadata: { path: ["challenge"], equals: "Challenge Avène" }, recommendation: expect.objectContaining({ pharmacyId: "ph1", outcomeSource: "COUNTER_DECLARED" }) }) }));
  });

  it("aucun challenge en cours : rien à montrer, aucune requête de plus", async () => {
    m.running.mockResolvedValue([]);
    expect(await loadTeamChallenges(scope)).toEqual([]);
    expect(m.events).not.toHaveBeenCalled();
  });

  it("un challenge sans objectif fixé n'invente pas d'objectif", async () => {
    m.running.mockResolvedValue([challenge({ progress: { units: 3, target: 12, targetIsImplicit: true, daysRemaining: 5 } })]);
    m.events.mockResolvedValue([]);
    expect((await loadTeamChallenges(scope))[0].target).toBeNull();
  });
});
