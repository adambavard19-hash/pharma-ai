import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloisonnement de l'étape Challenges : collaborateur, titulaire, autre officine, compte gratuit. La base est simulée :
 * on vérifie ce que les services lui DEMANDENT (le filtre est dans la requête, pas après).
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    pharmacy: { findUnique: fn() },
    membership: { findFirst: fn(), count: fn() },
    bonusAuthorization: { findMany: fn(), findFirst: fn(), create: fn(), updateMany: fn() },
    personalObjective: { findMany: fn(), findFirst: fn(), create: fn(), updateMany: fn(), count: fn() },
    labChallenge: { count: fn() },
    trainingRecommendation: { updateMany: fn() },
    recommendation: { updateMany: fn(), findMany: fn() },
    clinicalReviewFlag: { findMany: fn() },
    $queryRaw: fn(),
    loadTeamChallenges: fn(),
    loadTeamRanking: fn(),
    listMembers: fn(),
    listChallenges: fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: m }));
vi.mock("@/server/services/team-ranking", () => ({ loadTeamChallenges: m.loadTeamChallenges, loadTeamRanking: m.loadTeamRanking }));
vi.mock("@/server/services/comptoirs", () => ({ listMembers: m.listMembers }));
vi.mock("@/server/services/challenges", () => ({ listChallenges: m.listChallenges }));
vi.mock("@/server/services/central-advice", () => ({ loadCentralRuleRows: async () => [] }));
vi.mock("../home", () => ({ mobileVisibleTrainingWhere: () => ({}) }));

const personal = await import("../personal");
const coach = await import("../coach");

const collaborator = { pharmacyId: "ph1", organizationId: "org1", userId: "hugo", isDemo: false };
const owner = { pharmacyId: "ph1", organizationId: "org1", userId: "claire", isDemo: false };
const objective = { userId: "hugo", title: "Octobre", metric: "ADVICE_SOLD" as const, target: 20, period: "MONTH" as const, startsOn: "2026-10-01", endsOn: "2026-10-31", challengeId: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.pharmacy.findUnique.mockResolvedValue({ timezone: "Europe/Paris" });
  m.membership.findFirst.mockImplementation(async ({ where }: { where: { userId: string; pharmacyId: string } }) =>
    where.pharmacyId !== "ph1" ? null : where.userId === "claire" ? { role: "OWNER" } : where.userId === "hugo" ? { role: "PHARMACIST" } : null,
  );
  m.membership.count.mockImplementation(async ({ where }: { where: { userId: string; pharmacyId: string } }) => (where.pharmacyId === "ph1" && ["hugo", "claire"].includes(where.userId) ? 1 : 0));
});

describe("un collaborateur ne lit que ses propres données", () => {
  it("mes primes : la requête ne demande QUE les primes validées ou versées, les miennes, dans mon officine", async () => {
    m.bonusAuthorization.findMany.mockResolvedValue([]);
    await personal.loadMyBonuses(collaborator);
    expect(m.bonusAuthorization.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph1", userId: "hugo", status: { in: ["VALIDATED", "PAID"] } });
  });

  it("mes résultats : la requête est restreinte à mes ventes (comptoir attribué) dans mon officine", async () => {
    m.$queryRaw.mockResolvedValue([{ tp: 1, tv: 1, wp: 4, wv: 2, mp: 10, mv: 3 }]);
    const results = await personal.loadPersonalResults(collaborator, new Date("2026-10-11T10:00:00Z"));
    const [strings, ...values] = m.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?");
    expect(sql).toContain('r."pharmacyId" = ?');
    expect(sql).toContain('p."handledByUserId" = ?');
    expect(values).toContain("ph1");
    expect(values).toContain("hugo");
    expect(results.month).toEqual({ proposed: 10, validated: 3, rate: 0.3 });
    expect(results.today.rate).toBe(1);
  });

  it("mes objectifs : seulement les miens, non archivés, de mon officine", async () => {
    m.personalObjective.findMany.mockResolvedValue([]);
    await personal.loadMyObjectives(collaborator);
    expect(m.personalObjective.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph1", userId: "hugo", archivedAt: null });
  });

  it("le bureau d'équipe lui est fermé, et aucun de ses gestes d'équipe n'écrit", async () => {
    expect(await personal.loadTeamDesk(collaborator)).toBeNull();
    expect(await personal.createObjective(collaborator, objective)).toMatchObject({ ok: false });
    expect(await personal.proposeBonus(collaborator, { userId: "hugo", label: "Moi", amountCents: 100000, objectiveId: null, challengeId: null, note: null })).toMatchObject({ ok: false });
    expect(await personal.decideBonus(collaborator, "b1", "VALIDATE")).toMatchObject({ ok: false });
    expect(m.personalObjective.create).not.toHaveBeenCalled();
    expect(m.bonusAuthorization.create).not.toHaveBeenCalled();
    expect(m.bonusAuthorization.updateMany).not.toHaveBeenCalled();
  });

  it("écarter une suggestion : seulement la sienne", async () => {
    m.trainingRecommendation.updateMany.mockResolvedValue({ count: 0 });
    expect(await coach.dismissTrainingSuggestion("hugo", "rec-de-quelqu-un-d-autre")).toBe(false);
    expect(m.trainingRecommendation.updateMany.mock.calls[0][0].where).toEqual({ id: "rec-de-quelqu-un-d-autre", userId: "hugo", dismissedAt: null });
  });
});

describe("le titulaire, dans SON officine seulement", () => {
  it("fixe un objectif à un collaborateur de l'officine", async () => {
    m.personalObjective.create.mockResolvedValue({ id: "o1" });
    expect(await personal.createObjective(owner, objective)).toEqual({ ok: true, data: { id: "o1" } });
    expect(m.personalObjective.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", userId: "hugo", createdByUserId: "claire" });
  });

  it("refuse un collaborateur d'une autre officine", async () => {
    expect(await personal.createObjective(owner, { ...objective, userId: "inconnu-autre-officine" })).toMatchObject({ ok: false, fieldErrors: { userId: expect.any(String) } });
    expect(m.personalObjective.create).not.toHaveBeenCalled();
  });

  it("titulaire d'une autre officine : refusé, même avec un identifiant de collaborateur valide", async () => {
    const elsewhere = { ...owner, pharmacyId: "ph2" };
    expect(await personal.createObjective(elsewhere, objective)).toMatchObject({ ok: false });
    expect(await personal.decideBonus(elsewhere, "b1", "VALIDATE")).toMatchObject({ ok: false });
  });

  it("une prime d'une autre officine est introuvable (la recherche porte l'officine de la session)", async () => {
    m.bonusAuthorization.findFirst.mockResolvedValue(null);
    expect(await personal.decideBonus(owner, "b-ph2", "VALIDATE")).toMatchObject({ ok: false, error: expect.stringContaining("introuvable") });
    expect(m.bonusAuthorization.findFirst.mock.calls[0][0].where).toEqual({ id: "b-ph2", pharmacyId: "ph1" });
  });

  it("valide une prime proposée (tracée : qui, quand) et refuse de verser une prime non validée", async () => {
    m.bonusAuthorization.findFirst.mockResolvedValue({ status: "PROPOSED", userId: "hugo", amountCents: 5000 });
    m.bonusAuthorization.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-10-11T09:00:00Z");
    expect(await personal.decideBonus(owner, "b1", "VALIDATE", now)).toMatchObject({ ok: true, data: { status: "VALIDATED", previous: "PROPOSED" } });
    expect(m.bonusAuthorization.updateMany.mock.calls[0][0]).toEqual({ where: { id: "b1", pharmacyId: "ph1", status: "PROPOSED" }, data: { status: "VALIDATED", validatedByUserId: "claire", validatedAt: now } });
    expect(await personal.decideBonus(owner, "b1", "PAY")).toMatchObject({ ok: false });
  });

  it("une prime proposée naît invisible (PROPOSED), jamais validée d'office", async () => {
    m.bonusAuthorization.create.mockResolvedValue({ id: "b9" });
    await personal.proposeBonus(owner, { userId: "hugo", label: "Octobre", amountCents: 5000, objectiveId: null, challengeId: null, note: null });
    expect(m.bonusAuthorization.create.mock.calls[0][0].data).toMatchObject({ status: "PROPOSED", pharmacyId: "ph1", userId: "hugo", proposedByUserId: "claire" });
    expect(m.bonusAuthorization.create.mock.calls[0][0].data).not.toHaveProperty("validatedAt");
  });
});

describe("le motif de refus saisi au comptoir", () => {
  it("n'écrit que sur un conseil refusé de l'officine de la session", async () => {
    m.recommendation.updateMany.mockResolvedValue({ count: 1 });
    expect(await coach.setDeclineReason({ pharmacyId: "ph1" }, "r1", "PRICE")).toBe(true);
    expect(m.recommendation.updateMany.mock.calls[0][0]).toEqual({ where: { id: "r1", pharmacyId: "ph1", status: { in: ["DECLINED", "IGNORED", "REMOVED"] } }, data: { declineReason: "PRICE" } });
    expect(m.recommendation.findMany).not.toHaveBeenCalled();
  });

  it("« pas adapté » met à jour la validation clinique (agrégée)", async () => {
    m.recommendation.updateMany.mockResolvedValue({ count: 1 });
    m.recommendation.findMany.mockResolvedValue([]);
    await coach.setDeclineReason({ pharmacyId: "ph1" }, "r1", "CLINICALLY_INAPPROPRIATE");
    expect(m.recommendation.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph1", declineReason: "CLINICALLY_INAPPROPRIATE", isDemo: false });
  });
});
