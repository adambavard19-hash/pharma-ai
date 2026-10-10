import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  groupBy: vi.fn(),
  followUps: vi.fn(),
  recs: vi.fn(),
  dispatchFind: vi.fn(),
  pharmacy: vi.fn(),
  sendEmail: vi.fn(),
  trace: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    counterSaleFollowUp: { groupBy: m.groupBy, findMany: m.followUps },
    recommendation: { findMany: m.recs },
    emailDispatch: { findFirst: m.dispatchFind },
    pharmacy: { findUnique: m.pharmacy },
  },
}));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { id: "test" }, sendEmail: m.sendEmail }) }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: m.trace }));
vi.mock("@/server/services/comptoirs", () => ({ listMembers: async () => [{ id: "lea", name: "Léa Martin", role: "PHARMACIST" }] }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ APP_URL: "https://pharmaboost.app" }) }));

const { loadCounterResults, sendMonthlyCounterReports } = await import("../counter-results");

const followUp = (over = {}) => ({ prescriptionId: "p1", closedPost: "Comptoir 1", prescription: { handledByUserId: "lea" }, proposedCount: 3, soldCount: 1, notSoldCount: 1, unansweredCount: 1, emailEncrypted: null, consentAt: null, reportStatus: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.followUps.mockResolvedValue([followUp()]);
  m.recs.mockResolvedValue([{ outcomePost: "Comptoir 1", product: { name: "ELUDAY GENCIVE, flacon" }, presentation: null, events: [{ metadata: { challenge: "Challenge Avène", shortDateOn: "2026-11-30" } }] }]);
  m.groupBy.mockResolvedValue([{ pharmacyId: "ph1" }]);
  m.dispatchFind.mockResolvedValue(null);
  m.pharmacy.mockResolvedValue({ name: "Pharmacie du Port", isDemo: false, isActive: true, memberships: [{ user: { id: "u1", email: "titulaire@pharmacie.fr" } }] });
  m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" });
});

describe("les résultats du comptoir", () => {
  it("lit les ventes TERMINÉES de la période et le contexte gardé au moment de la réponse", async () => {
    const results = await loadCounterResults({ pharmacyId: "ph1", since: new Date("2026-10-01"), until: new Date("2026-11-01") });
    expect(m.followUps).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph1", closedAt: { gte: new Date("2026-10-01"), lt: new Date("2026-11-01") } } }));
    expect(m.recs).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "PURCHASED", outcomeSource: "COUNTER_DECLARED", pharmacyId: "ph1" }) }));
    expect(results).toMatchObject({ salesClosed: 1, proposed: 3, sold: 1, challengeSold: 1, shortDateSold: 1, products: [{ name: "ELUDAY GENCIVE", sold: 1 }] });
    // Chacun sous son nom : le collaborateur du comptoir ; sans collaborateur, le nom du comptoir.
    expect(results.byPost[0].post).toBe("Léa Martin");
  });

  it("ne lit aucun conseil quand aucune vente n'est terminée", async () => {
    m.followUps.mockResolvedValue([]);
    const results = await loadCounterResults({ pharmacyId: "ph1", since: new Date("2026-10-01"), until: new Date("2026-11-01") });
    expect(results.salesClosed).toBe(0);
    expect(m.recs).not.toHaveBeenCalled();
  });
});

describe("le bilan mensuel envoyé au titulaire", () => {
  const NOW = new Date("2026-10-01T05:30:00Z");

  it("envoie le bilan du mois écoulé au titulaire, une trace dans le journal des e-mails", async () => {
    const run = await sendMonthlyCounterReports(NOW);
    expect(run).toEqual({ month: "2026-09", pharmacies: 1, sent: 1, skipped: 0, failed: 0 });
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    expect(m.sendEmail.mock.calls[0][0]).toMatchObject({ to: "titulaire@pharmacie.fr", subject: "Votre bilan du comptoir — septembre 2026" });
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: "COUNTER_MONTHLY", templateKey: "counter-monthly:2026-09", pharmacyId: "ph1" }));
  });

  it("ne renvoie pas un bilan déjà envoyé pour ce mois", async () => {
    m.dispatchFind.mockResolvedValue({ id: "d1" });
    const run = await sendMonthlyCounterReports(NOW);
    expect(run).toMatchObject({ sent: 0, skipped: 1 });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("n'écrit ni à une officine de démonstration, ni à une officine sans titulaire, ni quand rien n'a été vendu", async () => {
    m.pharmacy.mockResolvedValueOnce({ name: "Démo", isDemo: true, isActive: true, memberships: [{ user: { id: "u", email: "d@d.fr" } }] });
    expect((await sendMonthlyCounterReports(NOW)).skipped).toBe(1);
    m.pharmacy.mockResolvedValueOnce({ name: "Sans titulaire", isDemo: false, isActive: true, memberships: [] });
    expect((await sendMonthlyCounterReports(NOW)).skipped).toBe(1);
    m.pharmacy.mockResolvedValueOnce({ name: "Pharmacie", isDemo: false, isActive: true, memberships: [{ user: { id: "u", email: "t@t.fr" } }] });
    m.followUps.mockResolvedValueOnce([]);
    expect((await sendMonthlyCounterReports(NOW)).skipped).toBe(1);
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("compte un échec d'envoi comme tel", async () => {
    m.sendEmail.mockResolvedValue({ status: "FAILED", provider: "test", detail: "refusé" });
    expect(await sendMonthlyCounterReports(NOW)).toMatchObject({ sent: 0, failed: 1 });
  });
});
