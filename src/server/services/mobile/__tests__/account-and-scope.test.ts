import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le compte gratuit (création, accords) et l'isolement des lectures de l'application mobile : la base est simulée, on
 * regarde ce que les services lui DEMANDENT.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), create: fn(), update: fn() },
    organization: { upsert: fn() },
    userConsent: { findFirst: fn(), findMany: fn(), create: fn() },
    trainingProgress: { findFirst: fn() },
    trainingContent: { findFirst: fn() },
    partnerLaunch: { findMany: fn() },
    loadTeamChallenges: fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => {
  const prisma = { ...m, $transaction: async (run: (tx: unknown) => unknown) => run(prisma) };
  return { prisma };
});
vi.mock("@/server/security/password", () => ({ hashPassword: async (value: string) => `hash(${value})`, validatePasswordStrength: (value: string) => (value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) ? [] : ["12 caractères minimum"]) }));
vi.mock("@/server/services/team-ranking", () => ({ loadTeamChallenges: m.loadTeamChallenges }));

const account = await import("../account");
const consents = await import("../consents");
const home = await import("../home");
const community = await import("../community");

const input = { firstName: "Inès", lastName: "Martin", email: "ines@exemple.fr", password: "MotDePasse2026", profession: "PHARMACY_STUDENT" as const, rpps: null, pharmacyName: null, consents: { PHARMABOOST_NEWS: false, PARTNER_COMMUNICATIONS: true } };

beforeEach(() => {
  vi.clearAllMocks();
  community.resetCommunityOrganizationCache();
  m.organization.upsert.mockResolvedValue({ id: "org-communaute" });
  m.user.findFirst.mockResolvedValue(null);
  m.user.create.mockResolvedValue({ id: "u-neuf" });
  m.userConsent.findFirst.mockResolvedValue(null);
});

describe("créer un compte gratuit", () => {
  it("dans la Communauté PharmaBoost, sans aucun rattachement, avec le métier déclaré", async () => {
    expect(await account.createCommunityAccount(input)).toEqual({ ok: true, userId: "u-neuf" });
    expect(m.organization.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "communaute-pharmaboost" }, create: expect.objectContaining({ kind: "COMMUNITY" }) }));
    const data = m.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ organizationId: "org-communaute", email: "ines@exemple.fr", passwordHash: "hash(MotDePasse2026)", profession: "PHARMACY_STUDENT", status: "ACTIVE" });
    expect(data).not.toHaveProperty("memberships");
  });

  it("consigne les DEUX décisions, « non » compris, avec la version du texte", async () => {
    await account.createCommunityAccount(input);
    const rows = m.userConsent.create.mock.calls.map((call) => call[0].data);
    expect(rows).toEqual([
      expect.objectContaining({ kind: "PHARMABOOST_NEWS", granted: false, grantedAt: null, revokedAt: expect.any(Date), source: "MOBILE_SIGNUP", textVersion: expect.any(String) }),
      expect.objectContaining({ kind: "PARTNER_COMMUNICATIONS", granted: true, grantedAt: expect.any(Date), revokedAt: null, source: "MOBILE_SIGNUP" }),
    ]);
  });

  it("adresse déjà connue (quelle que soit la casse) : refus sur le champ e-mail, rien n'est créé", async () => {
    m.user.findFirst.mockResolvedValue({ id: "u-existant" });
    expect(await account.createCommunityAccount(input)).toMatchObject({ ok: false, field: "email" });
    expect(m.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: "ines@exemple.fr", mode: "insensitive" } } }));
    expect(m.user.create).not.toHaveBeenCalled();
  });

  it("deux inscriptions simultanées : l'index unique tranche, même refus", async () => {
    m.user.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect(await account.createCommunityAccount(input)).toMatchObject({ ok: false, field: "email" });
  });

  it("mot de passe faible ou RPPS mal formé : refusés avant toute écriture", async () => {
    expect(await account.createCommunityAccount({ ...input, password: "court" })).toMatchObject({ ok: false, field: "password" });
    expect(await account.createCommunityAccount({ ...input, rpps: "1234" })).toMatchObject({ ok: false, field: "rpps" });
    expect(m.user.create).not.toHaveBeenCalled();
  });
});

describe("les accords", () => {
  it("un interrupteur qui ne change rien n'ajoute pas de ligne ; un changement en ajoute une", async () => {
    m.userConsent.findFirst.mockResolvedValue({ granted: true });
    expect(await consents.recordConsent({ userId: "u1", kind: "PHARMABOOST_NEWS", granted: true, source: "MOBILE_SETTINGS" })).toBe(false);
    expect(await consents.recordConsent({ userId: "u1", kind: "PHARMABOOST_NEWS", granted: false, source: "MOBILE_SETTINGS" })).toBe(true);
    expect(m.userConsent.create).toHaveBeenCalledTimes(1);
  });

  it("sans aucune décision, un accord vaut NON", async () => {
    m.userConsent.findMany.mockResolvedValue([]);
    const state = await consents.currentConsents("u1");
    expect(state.PHARMABOOST_NEWS.granted).toBe(false);
    expect(state.PARTNER_COMMUNICATIONS.granted).toBe(false);
    expect(m.userConsent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }));
  });
});

describe("isolement des lectures de l'accueil", () => {
  const now = new Date("2026-10-11T10:00:00Z");

  it("un compte gratuit ne voit que des contenus PharmaBoost ouverts à tous, relus — jamais un contenu d'officine", () => {
    const where = home.mobileVisibleTrainingWhere(null, now);
    expect(where).toMatchObject({ isActive: true, reviewStatus: "APPROVED" });
    expect(JSON.stringify(where)).toContain('"pharmacyId":null,"isFreeAccess":true');
  });

  it("un collaborateur voit les contenus PharmaBoost et ceux de SON officine active seulement", () => {
    const where = home.mobileVisibleTrainingWhere({ pharmacyId: "ph1" }, now);
    expect(JSON.stringify(where)).toContain('{"OR":[{"pharmacyId":null},{"pharmacyId":"ph1"}]}');
  });

  it("« Continuer ma formation » lit la progression de la personne connectée, dans sa portée (hors officine : pharmacyId vide)", async () => {
    m.trainingProgress.findFirst.mockResolvedValue(null);
    m.trainingContent.findFirst.mockResolvedValue(null);
    await home.loadContinueCard("u1", null, now);
    expect(m.trainingProgress.findFirst.mock.calls[0][0].where).toMatchObject({ userId: "u1", pharmacyId: null });
    await home.loadContinueCard("u2", { pharmacyId: "ph1" }, now);
    expect(m.trainingProgress.findFirst.mock.calls[1][0].where).toMatchObject({ userId: "u2", pharmacyId: "ph1" });
  });

  it("« Mes challenges » : ceux de l'officine de la portée, et MA ligne seulement mise en avant", async () => {
    m.loadTeamChallenges.mockResolvedValue([{ id: "c1", title: "Solaire", laboratory: "Lab", endsOn: "2026-10-31", daysRemaining: 20, target: 50, units: 30, people: [{ userId: "autre", name: "B", units: 20 }, { userId: "u2", name: "A", units: 10 }] }]);
    const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "u2" };
    const [challenge] = await home.loadMyChallenges(scope);
    expect(m.loadTeamChallenges).toHaveBeenCalledWith(scope);
    expect(challenge).toMatchObject({ myUnits: 10, teamUnits: 30, rank: 2, people: 2 });
  });

  it("les nouveautés partenaires exigent relecture, validation réglementaire et publication", async () => {
    m.partnerLaunch.findMany.mockResolvedValue([]);
    await home.loadPartnerLaunches(now);
    expect(m.partnerLaunch.findMany.mock.calls[0][0].where).toMatchObject({ reviewStatus: "APPROVED", regulatoryValidatedAt: { not: null }, publishedAt: { lte: now } });
  });
});
