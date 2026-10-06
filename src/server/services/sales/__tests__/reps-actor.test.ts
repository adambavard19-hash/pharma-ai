import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La généralisation de l'acteur dans `reps.ts` : les appelants historiques (une
 * chaîne = un administrateur) restent valides, le directeur laisse une ligne
 * d'audit à son nom. Ni base, ni e-mail : tout est simulé.
 */

const db = vi.hoisted(() => ({
  salesRep: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  salesRepSession: { updateMany: vi.fn() },
}));
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(), sendEmail: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://exemple.test${path}` }));
vi.mock("@/server/security/password", () => ({ hashPassword: async () => "hash", validatePasswordStrength: () => [] }));

const reps = await import("../reps");

const INPUT = { firstName: "Marie", lastName: "Dupont", email: "Marie@Exemple.fr", commissionType: "FIXED" as const, commissionValue: 25000 };
const DIRECTOR = { type: "DIRECTOR" as const, id: "dir_1", label: "Diane Directrice" };
const ADMIN = { type: "ADMIN" as const, id: "adm_1", label: "Alice Admin" };

beforeEach(() => {
  vi.resetAllMocks();
  db.salesRep.create.mockImplementation(async ({ data }: { data: { email: string } }) => ({ id: "rep_1", email: data.email }));
  db.salesRep.findUniqueOrThrow.mockResolvedValue({ id: "rep_1", firstName: "Marie", email: "marie@exemple.fr" });
  mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "test", detail: "ok" });
});

describe("créer un commercial", () => {
  it("la forme historique : l'administrateur de la console, sans salesDirectorId", async () => {
    await reps.createSalesRep(INPUT, "adm_1");
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.rep_created", entityType: "SalesRep", entityId: "rep_1", platformAdminId: "adm_1", metadata: { email: "marie@exemple.fr" } });
  });

  it("un acteur administrateur : même ligne d'audit", async () => {
    await reps.createSalesRep(INPUT, ADMIN);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ platformAdminId: "adm_1" });
    expect(mocks.recordAudit.mock.calls[0][0]).not.toHaveProperty("salesDirectorId");
  });

  it("le directeur : l'audit porte son identifiant, jamais un administrateur", async () => {
    await reps.createSalesRep(INPUT, DIRECTOR);
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: "sales.rep_created", entityId: "rep_1", salesDirectorId: "dir_1" });
    expect(audit).not.toHaveProperty("platformAdminId");
  });

  it("le mot de passe initial n'est jamais celui de la saisie ni journalisé", async () => {
    await reps.createSalesRep(INPUT, DIRECTOR);
    expect(db.salesRep.create.mock.calls[0][0].data.passwordHash).toBe("hash");
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("hash");
  });
});

describe("modifier un commercial", () => {
  it("désactiver par le directeur révoque ses sessions et laisse l'audit à son nom", async () => {
    await reps.updateSalesRep("rep_1", { isActive: false }, DIRECTOR);
    expect(db.salesRepSession.updateMany).toHaveBeenCalledWith({ where: { salesRepId: "rep_1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.rep_updated", entityType: "SalesRep", entityId: "rep_1", salesDirectorId: "dir_1", metadata: { fields: ["isActive"] } });
  });

  it("la forme historique reste un administrateur", async () => {
    await reps.updateSalesRep("rep_1", { zone: "Lyon" }, "adm_1");
    expect(db.salesRepSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.rep_updated", entityType: "SalesRep", entityId: "rep_1", platformAdminId: "adm_1", metadata: { fields: ["zone"] } });
  });
});

describe("l'invitation", () => {
  it("par le directeur : le message part, l'audit est à son nom avec l'issue, sans le lien", async () => {
    const outcome = await reps.sendSalesInvitation("rep_1", DIRECTOR);
    expect(outcome).toEqual({ status: "SENT", detail: "ok" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "sales.rep_invited", entityType: "SalesRep", entityId: "rep_1", salesDirectorId: "dir_1", metadata: { status: "SENT" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("mot-de-passe");
  });

  it("la forme historique (administrateur) et l'envoi sans acteur restent valides", async () => {
    await reps.sendSalesInvitation("rep_1", "adm_1");
    await reps.sendSalesInvitation("rep_1", null);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ platformAdminId: "adm_1" });
    expect(mocks.recordAudit.mock.calls[1][0]).toMatchObject({ platformAdminId: null });
  });

  it("le lien d'invitation est personnel : l'empreinte seule est en base, jamais le jeton", async () => {
    await reps.sendSalesInvitation("rep_1", DIRECTOR);
    const stored = db.salesRep.update.mock.calls.find(([arg]) => arg.data.passwordResetTokenHash)?.[0].data;
    const sent = mocks.sendEmail.mock.calls[0][0].text as string;
    const token = /mot-de-passe\/([A-Za-z0-9_-]+)/.exec(sent)?.[1] ?? "";
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(stored.passwordResetTokenHash).toBeTruthy();
    expect(stored.passwordResetTokenHash).not.toBe(token);
    // Valable 7 jours.
    expect(stored.passwordResetExpiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(stored.passwordResetExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
  });
});
