import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pharmacies: vi.fn(),
  dispatchFind: vi.fn(),
  owners: vi.fn(),
  challenges: vi.fn(),
  stockCount: vi.fn(),
  stockFind: vi.fn(),
  userUpdateMany: vi.fn(),
  userFindFirst: vi.fn(),
  report: vi.fn(),
  sendEmail: vi.fn(),
  trace: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    pharmacy: { findMany: m.pharmacies },
    emailDispatch: { findFirst: m.dispatchFind },
    membership: { findMany: m.owners },
    labChallenge: { findMany: m.challenges },
    stockItem: { count: m.stockCount, findMany: m.stockFind, fields: { alertThreshold: "alertThreshold" } },
    user: { updateMany: m.userUpdateMany, findFirst: m.userFindFirst },
  },
}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "x".repeat(40) }) }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { id: "test" }, sendEmail: m.sendEmail }) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: m.trace }));
vi.mock("@/server/services/email-context", () => ({ platformEmailContext: async () => ({ baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } }) }));
vi.mock("@/server/services/performance", () => ({ loadPerformanceReport: m.report }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.app${path}` }));

const { previousWeek, sendWeeklyOwnerDigests, userFromUnsubscribeToken, weeklyDigestUnsubscribeUrl } = await import("../weekly-digest");

const MONDAY = new Date("2026-10-12T06:00:00Z"); // lundi 12 octobre, 8 h à Paris
const metric = (value: number) => ({ value, previous: 0, deltaPct: null, trend: value > 0 ? "up" : "none" });

beforeEach(() => {
  vi.clearAllMocks();
  m.pharmacies.mockResolvedValue([{ id: "ph1", name: "Pharmacie du Port" }, { id: "ph2", name: "Pharmacie des Halles" }]);
  m.dispatchFind.mockResolvedValue(null);
  m.owners.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) => [{ user: { id: `owner-${where.pharmacyId}`, email: `${where.pharmacyId}@example.fr`, firstName: "Anne" } }]);
  m.challenges.mockResolvedValue([]);
  m.stockCount.mockResolvedValue(0);
  m.stockFind.mockResolvedValue([]);
  m.report.mockImplementation(async ({ pharmacyId }: { pharmacyId: string }) => ({ empty: false, funnel: { proposed: metric(pharmacyId === "ph1" ? 42 : 7), purchased: metric(3) }, revenue: { confirmedTtcCents: metric(12000) } }));
  m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test" });
});

describe("la semaine résumée", () => {
  it("le lundi : la semaine du lundi au dimanche d'avant", () => {
    expect(previousWeek(MONDAY)).toMatchObject({ from: "2026-10-05", to: "2026-10-11", weekday: 0, label: "du 5 au 11 octobre" });
    expect(previousWeek(new Date("2026-11-02T08:00:00Z")).label).toBe("du 26 octobre au 1 novembre");
  });
});

describe("l'envoi aux titulaires", () => {
  it("chaque officine reçoit SES chiffres, une fois, avec un lien de désinscription personnel", async () => {
    const run = await sendWeeklyOwnerDigests(MONDAY);
    expect(run).toMatchObject({ week: "2026-10-05", pharmacies: 2, sent: 2, failed: 0 });
    const [first, second] = m.sendEmail.mock.calls.map((call) => call[0]);
    expect(first.to).toBe("ph1@example.fr");
    expect(first.text).toContain("conseils proposés : 42");
    expect(second.to).toBe("ph2@example.fr");
    expect(second.text).toContain("conseils proposés : 7");
    expect(second.text).not.toContain("Pharmacie du Port");
    // Les chiffres de chaque officine sont lus avec SON identifiant.
    expect(m.report.mock.calls.map((call) => call[0].pharmacyId)).toEqual(["ph1", "ph2"]);
    expect(m.challenges.mock.calls.every((call, i) => call[0].where.pharmacyId === ["ph1", "ph2"][i])).toBe(true);
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: "OWNER_WEEKLY", templateKey: "owner-weekly:2026-10-05", pharmacyId: "ph1" }));
    const link = /Ne plus recevoir ce résumé : (\S+)/.exec(first.text)?.[1] ?? "";
    expect(userFromUnsubscribeToken(decodeURIComponent(link.split("/resume-hebdo/")[1]))).toBe("owner-ph1");
  });

  it("ne renvoie pas une semaine déjà envoyée, n'écrit pas quand il n'y a rien à dire, ni aux désinscrits", async () => {
    m.dispatchFind.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) => (where.pharmacyId === "ph1" ? { id: "d1" } : null));
    m.report.mockResolvedValue({ empty: true, funnel: { proposed: metric(0), purchased: metric(0) }, revenue: { confirmedTtcCents: metric(0) } });
    const run = await sendWeeklyOwnerDigests(MONDAY);
    expect(run).toMatchObject({ sent: 0, skipped: 2 });
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.owners.mock.calls[0][0].where.user).toMatchObject({ weeklyDigestOptOutAt: null, deletedAt: null });
  });

  it("le jeudi : rien (la semaine résumée est trop loin)", async () => {
    const run = await sendWeeklyOwnerDigests(new Date("2026-10-15T08:00:00Z"));
    expect(run.week).toBeNull();
    expect(m.pharmacies).not.toHaveBeenCalled();
  });

  it("s'arrête à l'heure dite ; la tâche du lendemain reprend sans double envoi", async () => {
    const run = await sendWeeklyOwnerDigests(MONDAY, { deadlineAt: Date.now() - 1 });
    expect(run).toMatchObject({ stoppedEarly: true, sent: 0 });
  });
});

describe("le lien de désinscription", () => {
  it("désigne la personne ; un lien trafiqué ne désigne personne", () => {
    const url = weeklyDigestUnsubscribeUrl("u42");
    const token = decodeURIComponent(url.split("/resume-hebdo/")[1]);
    expect(userFromUnsubscribeToken(token)).toBe("u42");
    expect(userFromUnsubscribeToken(`${token}x`)).toBeNull();
    expect(userFromUnsubscribeToken("")).toBeNull();
  });
});
