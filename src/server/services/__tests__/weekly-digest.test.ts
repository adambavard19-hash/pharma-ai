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
  pdf: vi.fn(),
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
vi.mock("@/server/services/counter-history", () => ({ loadSalesReport: m.report }));
vi.mock("@/server/services/sales-report-file", () => ({ salesReportPdfFile: m.pdf }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.app${path}` }));

const { previousWeek, sendWeeklyOwnerDigests, userFromUnsubscribeToken, weeklyDigestUnsubscribeUrl } = await import("../weekly-digest");

const MONDAY = new Date("2026-10-12T06:00:00Z"); // lundi 12 octobre, 8 h à Paris
const report = (sales: number, proposed: number, sold: number, revenueCents: number) => ({ sales, proposed, sold, revenueCents });

beforeEach(() => {
  vi.clearAllMocks();
  m.pharmacies.mockResolvedValue([{ id: "ph1", name: "Pharmacie du Port" }, { id: "ph2", name: "Pharmacie des Halles" }]);
  m.dispatchFind.mockResolvedValue(null);
  m.owners.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) => [{ user: { id: `owner-${where.pharmacyId}`, email: `${where.pharmacyId}@example.fr`, firstName: "Anne" } }]);
  m.challenges.mockResolvedValue([]);
  m.stockCount.mockResolvedValue(0);
  m.stockFind.mockResolvedValue([]);
  // La semaine résumée (du lundi 5 au dimanche 11 octobre), puis la semaine d'avant pour l'évolution.
  m.report.mockImplementation(async ({ pharmacyId, range }: { pharmacyId: string; range: { from: Date } }) =>
    range.from.toISOString().startsWith("2026-10-04") ? report(20, pharmacyId === "ph1" ? 42 : 7, 3, 12000) : report(10, 20, 2, 6000),
  );
  m.pdf.mockImplementation(async (pharmacyId: string) => ({ bytes: new Uint8Array([37, 80, 68, 70]), fileName: `bilan-${pharmacyId}.pdf` }));
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
    expect(first.text).toContain("conseils proposés : 42 (+110 % vs semaine d'avant)");
    expect(first.text).toContain("conseils vendus : 3 (+50 % vs semaine d'avant)");
    expect(first.text).toContain("120 €");
    // Le rapport PDF de la semaine (celui de la console) est joint, et l'e-mail le dit.
    expect(first.attachments).toEqual([{ filename: "bilan-ph1.pdf", content: expect.any(Uint8Array), contentType: "application/pdf" }]);
    expect(first.text).toContain("joint en PDF");
    expect(m.pdf).toHaveBeenCalledWith("ph1", { param: "semaine-derniere" }, MONDAY);
    expect(second.to).toBe("ph2@example.fr");
    expect(second.text).toContain("conseils proposés : 7");
    expect(second.text).not.toContain("Pharmacie du Port");
    // Les chiffres de chaque officine sont lus avec SON identifiant.
    expect(m.report.mock.calls.map((call) => call[0].pharmacyId)).toEqual(["ph1", "ph1", "ph2", "ph2"]);
    // La semaine résumée va du lundi 5 (minuit à Paris) au dimanche 11 octobre inclus.
    expect(m.report.mock.calls[0][0].range.from.toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(m.report.mock.calls[0][0].range.to.toISOString()).toBe("2026-10-11T21:59:59.999Z");
    expect(m.challenges.mock.calls.every((call, i) => call[0].where.pharmacyId === ["ph1", "ph2"][i])).toBe(true);
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: "OWNER_WEEKLY", templateKey: "owner-weekly:2026-10-05", pharmacyId: "ph1" }));
    const link = /Ne plus recevoir ce résumé : (\S+)/.exec(first.text)?.[1] ?? "";
    expect(userFromUnsubscribeToken(decodeURIComponent(link.split("/resume-hebdo/")[1]))).toBe("owner-ph1");
  });

  it("ne renvoie pas une semaine déjà envoyée, n'écrit pas quand il n'y a rien à dire, ni aux désinscrits", async () => {
    m.dispatchFind.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) => (where.pharmacyId === "ph1" ? { id: "d1" } : null));
    m.report.mockResolvedValue(report(0, 0, 0, 0));
    const run = await sendWeeklyOwnerDigests(MONDAY);
    expect(run).toMatchObject({ sent: 0, skipped: 2 });
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.owners.mock.calls[0][0].where.user).toMatchObject({ weeklyDigestOptOutAt: null, deletedAt: null });
  });

  it("sans PDF (erreur de dessin), l'e-mail part quand même, sans pièce jointe ni mention", async () => {
    m.pdf.mockRejectedValue(new Error("pdf"));
    await sendWeeklyOwnerDigests(MONDAY);
    const [first] = m.sendEmail.mock.calls.map((call) => call[0]);
    expect(first.attachments).toBeUndefined();
    expect(first.text).not.toContain("joint en PDF");
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
