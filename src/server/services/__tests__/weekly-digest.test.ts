import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pharmacies: vi.fn(),
  dispatchFind: vi.fn(),
  memberships: vi.fn(),
  posts: vi.fn(),
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
    membership: { findMany: m.memberships },
    counterPost: { findMany: m.posts },
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

const { previousDay, previousWeek, sendDailyDigests, userFromUnsubscribeToken, weeklyDigestUnsubscribeUrl } = await import("../weekly-digest");

const FRIDAY = new Date("2026-10-16T08:15:00Z"); // vendredi 16 octobre, 10 h 15 à Paris
const MONDAY = new Date("2026-10-19T08:15:00Z"); // lundi 19 octobre, 10 h 15 à Paris
const report = (sales: number, proposed: number, sold: number, revenueCents: number) => ({ sales, proposed, sold, revenueCents });
const user = (id: string, firstName: string) => ({ id, email: `${id}@example.fr`, firstName, lastName: "Martin" });

beforeEach(() => {
  vi.clearAllMocks();
  m.pharmacies.mockResolvedValue([{ id: "ph1", name: "Pharmacie du Port" }, { id: "ph2", name: "Pharmacie des Halles" }]);
  m.dispatchFind.mockResolvedValue(null);
  m.memberships.mockImplementation(async ({ where }: { where: { pharmacyId: string } }) =>
    where.pharmacyId === "ph1"
      ? [
          { role: "OWNER", user: user("owner-ph1", "Anne") },
          { role: "PHARMACIST", user: user("lea", "Léa") },
          { role: "PREPARER", user: user("tom", "Tom") },
        ]
      : [{ role: "OWNER", user: user("owner-ph2", "Paul") }],
  );
  m.posts.mockResolvedValue([{ id: "post-lea", assignedUserId: "lea" }]);
  m.challenges.mockResolvedValue([]);
  m.stockCount.mockResolvedValue(0);
  m.stockFind.mockResolvedValue([]);
  // Toute l'officine, ou un seul membre (onlyFor) : Léa a vendu, Tom n'a rien proposé hier.
  m.report.mockImplementation(async ({ pharmacyId, onlyFor }: { pharmacyId: string; onlyFor?: { userId: string } }) => {
    if (!onlyFor) return pharmacyId === "ph1" ? report(30, 42, 3, 12000) : report(5, 7, 1, 990);
    return onlyFor.userId === "lea" ? report(8, 12, 2, 2380) : report(0, 0, 0, 0);
  });
  m.pdf.mockImplementation(async (pharmacyId: string, _p: unknown, _now: Date, options?: { person?: string }) => ({ bytes: new Uint8Array([37, 80, 68, 70]), fileName: `pharmaboost-performance-${pharmacyId}${options?.person ? "-x" : ""}-2026-10-15-2026-10-16.pdf` }));
  m.sendEmail.mockResolvedValue({ status: "SENT", provider: "test" });
});

describe("la semaine résumée", () => {
  it("la semaine civile écoulée, à Paris, le lundi seulement", () => {
    expect(previousWeek(MONDAY)).toEqual({ monday: "2026-10-12", label: "du lundi 12 au dimanche 18 octobre", isMonday: true });
    expect(previousWeek(FRIDAY).isMonday).toBe(false);
    expect(previousWeek(new Date("2026-11-02T08:00:00Z")).label).toBe("du lundi 26 octobre au dimanche 1 novembre");
  });
  it("la veille, à Paris", () => {
    expect(previousDay(FRIDAY)).toEqual({ day: "2026-10-15", label: "jeudi 15 octobre" });
    // Juste après minuit à Paris (22 h 30 UTC la veille) : la veille est bien le jour qui vient de finir.
    expect(previousDay(new Date("2026-10-15T22:30:00Z")).day).toBe("2026-10-15");
  });
});

describe("l'envoi du lundi", () => {
  it("le titulaire reçoit toute l'officine, chaque membre SEULEMENT ses ventes, chacun avec son PDF", async () => {
    const run = await sendDailyDigests(MONDAY);
    expect(run).toMatchObject({ day: "2026-10-12", pharmacies: 2, sent: 3, failed: 0 });
    const mails = Object.fromEntries(m.sendEmail.mock.calls.map((call) => [call[0].to, call[0]]));
    expect(Object.keys(mails).sort()).toEqual(["lea@example.fr", "owner-ph1@example.fr", "owner-ph2@example.fr"]);
    expect(mails["owner-ph1@example.fr"].text).toContain("conseils proposés : 42 (dans 30 ventes)");
    expect(mails["owner-ph1@example.fr"].attachments[0]).toMatchObject({ filename: "pharmaboost-performance-ph1-officine-2026-10-12.pdf", contentType: "application/pdf" });
    expect(mails["lea@example.fr"].subject).toBe("Votre performance de la semaine — Pharmacie du Port");
    expect(mails["lea@example.fr"].text).toContain("conseils proposés : 12 (dans 8 ventes)");
    expect(mails["lea@example.fr"].text).not.toContain("42");
    expect(mails["lea@example.fr"].attachments[0].filename).toBe("pharmaboost-performance-ph1-x-mes-ventes-2026-10-12.pdf");
    // Les ventes de Léa : les siennes, ou celles de SON comptoir ; son PDF aussi, à son nom.
    expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph1", onlyFor: { userId: "lea", postIds: ["post-lea"] } }));
    expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph1", onlyFor: { userId: "tom", postIds: [] } }));
    expect(m.pdf).toHaveBeenCalledWith("ph1", { param: "semaine-derniere" }, MONDAY, { onlyFor: { userId: "lea", postIds: ["post-lea"] }, person: "Léa Martin" });
    // La période : du lundi 12 au dimanche 18, de minuit à minuit à Paris.
    const range = m.report.mock.calls[0][0].range;
    expect([range.from.toISOString(), range.to.toISOString()]).toEqual(["2026-10-11T22:00:00.000Z", "2026-10-18T21:59:59.999Z"]);
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "owner-weekly:2026-10-12", pharmacyId: "ph1", userId: "owner-ph1" }));
    expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "member-weekly:2026-10-12", pharmacyId: "ph1", userId: "lea" }));
    const link = /Ne plus recevoir ce bilan : (\S+)/.exec(mails["lea@example.fr"].text)?.[1] ?? "";
    expect(userFromUnsubscribeToken(decodeURIComponent(link.split("/resume-hebdo/")[1]))).toBe("lea");
  });

  it("jamais deux fois la même semaine, rien sans conseil proposé, jamais aux désinscrits", async () => {
    m.dispatchFind.mockImplementation(async ({ where }: { where: { pharmacyId: string; userId?: string } }) => (where.pharmacyId === "ph1" ? { id: "d1" } : null));
    m.report.mockImplementation(async ({ pharmacyId, onlyFor }: { pharmacyId: string; onlyFor?: unknown }) => (pharmacyId === "ph1" && !onlyFor ? report(30, 42, 3, 12000) : pharmacyId === "ph1" ? report(3, 4, 1, 500) : report(2, 0, 0, 0)));
    const run = await sendDailyDigests(MONDAY);
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(run).toMatchObject({ sent: 0 });
    expect(m.memberships.mock.calls[0][0].where.user).toMatchObject({ weeklyDigestOptOutAt: null, deletedAt: null });
  });

  it("un autre jour que le lundi, rien ne part", async () => {
    const run = await sendDailyDigests(FRIDAY);
    expect(run).toMatchObject({ notMonday: true, sent: 0, pharmacies: 0 });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it("sans PDF (erreur de dessin), l'e-mail part quand même, sans pièce jointe ni mention", async () => {
    m.pdf.mockRejectedValue(new Error("pdf"));
    await sendDailyDigests(MONDAY);
    const first = m.sendEmail.mock.calls[0][0];
    expect(first.attachments).toBeUndefined();
    expect(first.text).not.toContain("joint en PDF");
  });

  it("s'arrête à l'heure dite ; une tâche relancée le même lundi reprend sans double envoi", async () => {
    const run = await sendDailyDigests(MONDAY, { deadlineAt: Date.now() - 1 });
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
