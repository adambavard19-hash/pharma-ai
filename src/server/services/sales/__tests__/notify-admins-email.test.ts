import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificationCreate: vi.fn(),
  notificationDeleteMany: vi.fn(),
  adminFindMany: vi.fn(),
  sendEmail: vi.fn(),
  traceDispatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { extranetNotification: { create: mocks.notificationCreate, deleteMany: mocks.notificationDeleteMany }, platformAdmin: { findMany: mocks.adminFindMany } } }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));

const { dismissFormSubmission, notifyAdmins } = await import("../notifications");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notificationCreate.mockResolvedValue({});
  mocks.adminFindMany.mockResolvedValue([{ email: "fondateur@exemple.test" }, { email: "Associe@exemple.test" }]);
  mocks.sendEmail.mockResolvedValue({ status: "SENT" });
});

describe("chaque notification de l'équipe part aussi par e-mail à chaque administrateur (fondateur, 21 oct. 2026)", () => {
  it("une candidature : la cloche, puis un e-mail à chaque administrateur actif, avec le lien vers la console, tracé", async () => {
    await notifyAdmins({ type: "PARTNER_APPLICATION", title: "Candidature partenaire — Avène", body: "Pierre Fabre · Jean Dupont", linkUrl: "/admin/partenaires/candidatures/c1" });
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
    expect(mocks.adminFindMany.mock.calls[0][0].where).toEqual({ isActive: true });
    expect(mocks.sendEmail.mock.calls.map(([mail]) => mail.to)).toEqual(["fondateur@exemple.test", "associe@exemple.test"]);
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe("Candidature partenaire — Avène");
    expect(mail.text).toContain("https://pharmaboost.test/admin/partenaires/candidatures/c1");
    expect(mocks.traceDispatch).toHaveBeenCalledTimes(2);
    expect(mocks.traceDispatch.mock.calls[0][0]).toMatchObject({ kind: "TEAM_ALERT", recipient: "fondateur@exemple.test" });
  });

  it("le message détaillé fourni remplace le message simple ; une adresse déjà prévenue n'est pas servie deux fois", async () => {
    await notifyAdmins({ type: "SITE_LEAD", title: "t", body: "b", email: { subject: "Démo réservée", text: "détail", html: "<p>détail</p>" }, alreadySentTo: ["ASSOCIE@exemple.test"] });
    expect(mocks.sendEmail.mock.calls.map(([mail]) => [mail.to, mail.subject])).toEqual([["fondateur@exemple.test", "Démo réservée"]]);
  });

  it("une panne d'envoi n'est jamais renvoyée par e-mail, et une panne du prestataire ne fait pas échouer l'appelant", async () => {
    await notifyAdmins({ type: "EMAIL_FAILED", title: "t", body: "b" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    mocks.adminFindMany.mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyAdmins({ type: "SITE_LEAD", title: "t", body: "b" })).resolves.toBeUndefined();
  });
});

describe("la croix de « Formulaires reçus » (fondateur, 21 oct. 2026)", () => {
  it("n'efface que la notification d'un formulaire, pour l'équipe : jamais une autre alerte, jamais le dossier", async () => {
    mocks.notificationDeleteMany.mockResolvedValue({ count: 1 });
    expect(await dismissFormSubmission("n1")).toBe(true);
    const where = mocks.notificationDeleteMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "n1", audience: "ADMIN" });
    expect(where.type.in).toEqual(expect.arrayContaining(["SITE_LEAD", "PARTNER_APPLICATION", "SALES_APPLICATION"]));
    expect(where.type.in).not.toContain("PAYMENT_FAILED");
    mocks.notificationDeleteMany.mockResolvedValue({ count: 0 });
    expect(await dismissFormSubmission("autre")).toBe(false);
  });
});
