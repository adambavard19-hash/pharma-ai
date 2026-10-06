import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les comptes de directeur commercial, côté console : création + invitation
 * automatique, adresse unique, désactivation qui ferme les sessions,
 * suppression, renvoi. Base simulée en mémoire (la vraie contrainte d'unicité
 * y est reproduite), e-mail simulé : rien ne part, rien n'est écrit en base.
 */

vi.mock("server-only", () => ({}));

type Row = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  createdByAdminId: string | null;
  createdAt: Date;
};

const state = vi.hoisted(() => ({ rows: new Map<string, unknown>(), seq: 0 }));
const rows = () => state.rows as Map<string, Row>;

const pick = (row: Row, select?: Record<string, boolean>) => (select ? Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, row[key as keyof Row]])) : { ...row });
const byWhere = (where: { id?: string; email?: string }) => [...rows().values()].find((row) => (where.id !== undefined ? row.id === where.id : row.email === where.email));
const prismaError = (code: string) => Object.assign(new Error(code), { code });

const prismaMock = vi.hoisted(() => ({
  salesDirector: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  salesDirectorSession: { updateMany: vi.fn() },
  salesRep: { count: vi.fn() },
}));
const auditMock = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const emailMock = vi.hoisted(() => ({ sendEmail: vi.fn() }));
const passwordMock = vi.hoisted(() => ({ hashPassword: vi.fn(async (plain: string) => `hash(${plain})`) }));
const linkMock = vi.hoisted(() => ({ issueDirectorPasswordLink: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: prismaMock }));
vi.mock("@/server/audit/log", () => auditMock);
vi.mock("@/server/security/password", () => passwordMock);
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => emailMock }));
vi.mock("@/server/services/sales/director-auth", () => linkMock);

const service = await import("../directors");
const { SalesDirectorError } = service;

const EXPIRES = new Date("2026-10-13T08:00:00Z");

function seed(overrides: Partial<Row> = {}): Row {
  const id = overrides.id ?? `dir_${++state.seq}`;
  const row: Row = {
    id,
    email: `${id}@exemple.test`,
    passwordHash: "hash(ancien)",
    firstName: "Camille",
    lastName: "Durand",
    phone: null,
    isActive: true,
    invitedAt: null,
    lastLoginAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    createdByAdminId: "adm_0",
    createdAt: new Date("2026-10-01T08:00:00Z"),
    ...overrides,
  };
  rows().set(id, row);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rows.clear();
  state.seq = 0;

  prismaMock.salesDirector.findUnique.mockImplementation(async ({ where, select }) => {
    const row = byWhere(where);
    return row ? pick(row, select) : null;
  });
  prismaMock.salesDirector.findMany.mockImplementation(async ({ select }) => [...rows().values()].map((row) => pick(row, select)));
  prismaMock.salesDirector.create.mockImplementation(async ({ data, select }) => {
    if (byWhere({ email: data.email })) throw prismaError("P2002");
    const row = seed({ ...data, id: `dir_${++state.seq}` });
    return pick(row, select);
  });
  prismaMock.salesDirector.update.mockImplementation(async ({ where, data }) => {
    const row = byWhere(where);
    if (!row) throw prismaError("P2025");
    Object.assign(row, data);
    return { ...row };
  });
  prismaMock.salesDirector.updateMany.mockImplementation(async ({ where, data }) => {
    const row = byWhere({ id: where.id });
    if (!row || (where.isActive !== undefined && row.isActive !== where.isActive)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  prismaMock.salesDirector.delete.mockImplementation(async ({ where }) => {
    const row = byWhere(where);
    if (!row) throw prismaError("P2025");
    rows().delete(row.id);
    return row;
  });
  prismaMock.salesDirectorSession.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.salesRep.count.mockResolvedValue(0);

  linkMock.issueDirectorPasswordLink.mockImplementation(async (id: string) => ({ url: `https://pharmaboost.test/directeur/mot-de-passe/jeton-${id}`, expiresAt: EXPIRES }));
  emailMock.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "message accepté" });
});

const auditActions = () => auditMock.recordAudit.mock.calls.map(([call]) => call.action);

describe("ajouter un directeur commercial", () => {
  const INPUT = { firstName: " Camille ", lastName: "Durand", email: "  Camille.Durand@Exemple.TEST ", phone: " 06 12 34 56 78 " };

  it("crée le compte, envoie AUTOMATIQUEMENT l'invitation et rend l'issue réelle de l'envoi", async () => {
    const result = await service.createSalesDirector(INPUT, "adm_1");

    expect(result).toEqual({ id: "dir_1", invitation: { status: "SENT", detail: "message accepté" } });
    const row = rows().get("dir_1")!;
    expect(row).toMatchObject({ email: "camille.durand@exemple.test", firstName: "Camille", lastName: "Durand", phone: "06 12 34 56 78", isActive: true, createdByAdminId: "adm_1" });
    expect(row.invitedAt).toBeInstanceOf(Date);

    expect(linkMock.issueDirectorPasswordLink).toHaveBeenCalledWith("dir_1");
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);
    const mail = emailMock.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("camille.durand@exemple.test");
    expect(mail.subject).toBe("Votre espace de direction commerciale — PharmaBoost");
    expect(mail.text).toContain("https://pharmaboost.test/directeur/mot-de-passe/jeton-dir_1");
    expect(mail.html).toContain('href="https://pharmaboost.test/directeur/mot-de-passe/jeton-dir_1"');
  });

  it("trace la création et l'invitation, signées de l'administrateur de la console", async () => {
    await service.createSalesDirector(INPUT, "adm_1");
    expect(auditActions()).toEqual(["sales.director_created", "sales.director_invited"]);
    expect(auditMock.recordAudit.mock.calls[0][0]).toMatchObject({ entityType: "SalesDirector", entityId: "dir_1", platformAdminId: "adm_1", metadata: { email: "camille.durand@exemple.test" } });
    expect(auditMock.recordAudit.mock.calls[1][0]).toMatchObject({ entityType: "SalesDirector", entityId: "dir_1", platformAdminId: "adm_1", metadata: { status: "SENT" } });
  });

  it("le mot de passe initial est aléatoire, inconnu, et ne sort jamais : ni e-mail, ni audit, ni réponse", async () => {
    const first = await service.createSalesDirector(INPUT, "adm_1");
    await service.createSalesDirector({ ...INPUT, email: "autre@exemple.test" }, "adm_1");

    const [one, two] = passwordMock.hashPassword.mock.calls.map(([plain]) => plain as string);
    expect(one).not.toBe(two);
    expect(one.length).toBeGreaterThanOrEqual(32);
    expect(rows().get("dir_1")!.passwordHash).toBe(`hash(${one})`);

    const everythingOut = JSON.stringify([emailMock.sendEmail.mock.calls, auditMock.recordAudit.mock.calls, first]);
    expect(everythingOut).not.toContain(one);
    expect(everythingOut).not.toContain(two);
    expect(everythingOut).not.toMatch(/passwordHash|hash\(/);
  });

  it("refuse une adresse déjà prise, quelle que soit la casse : rien n'est créé ni envoyé", async () => {
    seed({ email: "camille.durand@exemple.test" });
    const attempt = service.createSalesDirector({ ...INPUT, email: "CAMILLE.DURAND@exemple.test" }, "adm_1");
    await expect(attempt).rejects.toBeInstanceOf(SalesDirectorError);
    await expect(attempt).rejects.toMatchObject({ code: "EMAIL_TAKEN", message: "Un directeur commercial existe déjà avec cette adresse e-mail." });
    expect(rows().size).toBe(1);
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("deux créations simultanées : l'adresse est le verrou, la perdante est refusée proprement", async () => {
    prismaMock.salesDirector.findUnique.mockResolvedValueOnce(null);
    seed({ email: "camille.durand@exemple.test" });
    await expect(service.createSalesDirector(INPUT, "adm_1")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("e-mail non parti (prestataire en mode simulé) : le compte existe, l'issue est dite telle quelle, « invité » n'est pas affirmé", async () => {
    emailMock.sendEmail.mockResolvedValue({ status: "SIMULATED", provider: "console", detail: "messagerie non branchée" });
    const result = await service.createSalesDirector(INPUT, "adm_1");
    expect(result.invitation).toEqual({ status: "SIMULATED", detail: "messagerie non branchée" });
    expect(rows().get(result.id)!.invitedAt).toBeNull();
    expect(auditMock.recordAudit.mock.calls[1][0].metadata).toEqual({ status: "SIMULATED" });
  });

  it("panne du prestataire : le geste ne tombe pas, le compte existe, l'échec est dit", async () => {
    emailMock.sendEmail.mockRejectedValue(new Error("réseau coupé"));
    const result = await service.createSalesDirector(INPUT, "adm_1");
    expect(result.invitation.status).toBe("FAILED");
    expect(result.invitation.detail).toMatch(/renvoyez l'invitation/);
    expect(rows().has(result.id)).toBe(true);
    expect(rows().get(result.id)!.invitedAt).toBeNull();
  });

  it("lien impossible à émettre : même issue honnête, aucun e-mail", async () => {
    linkMock.issueDirectorPasswordLink.mockRejectedValue(new Error("base indisponible"));
    const result = await service.createSalesDirector(INPUT, "adm_1");
    expect(result.invitation.status).toBe("FAILED");
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe("désactiver et réactiver", () => {
  it("désactiver ferme ses sessions immédiatement et laisse une trace avant / après", async () => {
    const director = seed();
    await expect(service.setSalesDirectorActive(director.id, false, "adm_1")).resolves.toEqual({ changed: true });
    expect(rows().get(director.id)!.isActive).toBe(false);
    expect(prismaMock.salesDirectorSession.updateMany).toHaveBeenCalledWith({ where: { salesDirectorId: director.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales.director_updated", platformAdminId: "adm_1", metadata: { fields: ["isActive"], changes: { isActive: { from: true, to: false } } } }));
  });

  it("désactiver efface le lien de mot de passe : un vieux lien de la boîte mail ne revit pas à la réactivation", async () => {
    const director = seed({ passwordResetTokenHash: "empreinte-ancienne", passwordResetExpiresAt: new Date(Date.now() + 86_400_000) });
    await service.setSalesDirectorActive(director.id, false, "adm_1");
    expect(rows().get(director.id)).toMatchObject({ isActive: false, passwordResetTokenHash: null, passwordResetExpiresAt: null });
    await service.setSalesDirectorActive(director.id, true, "adm_1");
    expect(rows().get(director.id)).toMatchObject({ isActive: true, passwordResetTokenHash: null });
  });

  it("réactiver ne touche pas aux sessions", async () => {
    const director = seed({ isActive: false });
    await expect(service.setSalesDirectorActive(director.id, true, "adm_1")).resolves.toEqual({ changed: true });
    expect(rows().get(director.id)!.isActive).toBe(true);
    expect(prismaMock.salesDirectorSession.updateMany).not.toHaveBeenCalled();
  });

  it("déjà dans l'état demandé : rien n'est écrit ni journalisé", async () => {
    const director = seed();
    await expect(service.setSalesDirectorActive(director.id, true, "adm_1")).resolves.toEqual({ changed: false });
    expect(prismaMock.salesDirector.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.salesDirectorSession.updateMany).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un autre geste a eu lieu entre la lecture et l'écriture : rien n'est écrit, rien n'est tracé", async () => {
    const director = seed();
    prismaMock.salesDirector.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.setSalesDirectorActive(director.id, false, "adm_1")).resolves.toEqual({ changed: false });
    expect(prismaMock.salesDirectorSession.updateMany).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un directeur inconnu est refusé", async () => {
    await expect(service.setSalesDirectorActive("dir_inconnu", false, "adm_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("renvoyer l'invitation", () => {
  it("émet un nouveau lien, envoie l'e-mail, marque l'invitation et trace", async () => {
    const director = seed({ firstName: "Camille", email: "camille@exemple.test" });
    const outcome = await service.resendDirectorInvitation(director.id, "adm_1");
    expect(outcome).toEqual({ status: "SENT", detail: "message accepté" });
    expect(linkMock.issueDirectorPasswordLink).toHaveBeenCalledWith(director.id);
    expect(emailMock.sendEmail.mock.calls[0][0]).toMatchObject({ to: "camille@exemple.test", subject: "Votre espace de direction commerciale — PharmaBoost" });
    expect(rows().get(director.id)!.invitedAt).toBeInstanceOf(Date);
    expect(auditActions()).toEqual(["sales.director_invited"]);
  });

  it("un compte désactivé ne peut pas utiliser le lien : refus, aucun lien émis", async () => {
    const director = seed({ isActive: false });
    await expect(service.resendDirectorInvitation(director.id, "adm_1")).rejects.toMatchObject({ code: "INACTIVE", message: expect.stringContaining("réactivez-le") });
    expect(linkMock.issueDirectorPasswordLink).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("un directeur inconnu est refusé", async () => {
    await expect(service.resendDirectorInvitation("dir_inconnu", "adm_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("e-mail non parti : l'issue est rendue telle quelle", async () => {
    const director = seed();
    emailMock.sendEmail.mockResolvedValue({ status: "FAILED", provider: "resend", detail: "adresse refusée" });
    await expect(service.resendDirectorInvitation(director.id, "adm_1")).resolves.toEqual({ status: "FAILED", detail: "adresse refusée" });
    expect(rows().get(director.id)!.invitedAt).toBeNull();
  });
});

describe("supprimer", () => {
  it("supprime le compte et consigne qui il était (sans secret)", async () => {
    const director = seed({ email: "camille@exemple.test" });
    await service.deleteSalesDirector(director.id, "adm_1");
    expect(rows().has(director.id)).toBe(false);
    expect(auditMock.recordAudit).toHaveBeenCalledWith({
      action: "sales.director_deleted",
      entityType: "SalesDirector",
      entityId: director.id,
      platformAdminId: "adm_1",
      metadata: { before: { email: "camille@exemple.test", firstName: "Camille", lastName: "Durand", isActive: true } },
    });
    expect(JSON.stringify(auditMock.recordAudit.mock.calls)).not.toMatch(/hash/i);
  });

  it("un directeur inconnu est refusé, sans trace", async () => {
    await expect(service.deleteSalesDirector("dir_inconnu", "adm_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("supprimé entre-temps par un autre administrateur : refus lisible, aucune trace en double", async () => {
    const director = seed();
    prismaMock.salesDirector.delete.mockRejectedValueOnce(prismaError("P2025"));
    await expect(service.deleteSalesDirector(director.id, "adm_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });
});

describe("corriger l'identité", () => {
  it("modifie le prénom, le nom et le téléphone, et trace l'avant / l'après", async () => {
    const director = seed({ phone: null });
    const result = await service.updateSalesDirector(director.id, { firstName: " Camila ", phone: "06 00 00 00 00" }, "adm_1");
    expect(result).toEqual({ emailChanged: false });
    expect(rows().get(director.id)).toMatchObject({ firstName: "Camila", lastName: "Durand", phone: "06 00 00 00 00" });
    expect(prismaMock.salesDirectorSession.updateMany).not.toHaveBeenCalled();
    expect(auditMock.recordAudit.mock.calls[0][0]).toMatchObject({ action: "sales.director_updated", platformAdminId: "adm_1", metadata: { fields: ["firstName", "phone"], changes: { firstName: { from: "Camille", to: "Camila" }, phone: { from: null, to: "06 00 00 00 00" } } } });
  });

  it("un prénom ou un nom vidé est ignoré ; un téléphone vidé est retiré", async () => {
    const director = seed({ phone: "06" });
    await service.updateSalesDirector(director.id, { firstName: "  ", lastName: "", phone: " " }, "adm_1");
    expect(rows().get(director.id)).toMatchObject({ firstName: "Camille", lastName: "Durand", phone: null });
  });

  it("changer l'adresse invalide le lien envoyé à l'ancienne adresse, ferme les sessions et remet l'invitation à faire", async () => {
    const director = seed({ email: "ancienne@exemple.test", invitedAt: new Date("2026-10-02T08:00:00Z"), passwordResetTokenHash: "empreinte", passwordResetExpiresAt: EXPIRES });
    const result = await service.updateSalesDirector(director.id, { email: "  Nouvelle@Exemple.test " }, "adm_1");
    expect(result).toEqual({ emailChanged: true });
    expect(rows().get(director.id)).toMatchObject({ email: "nouvelle@exemple.test", invitedAt: null, passwordResetTokenHash: null, passwordResetExpiresAt: null });
    expect(prismaMock.salesDirectorSession.updateMany).toHaveBeenCalledWith({ where: { salesDirectorId: director.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(auditMock.recordAudit.mock.calls[0][0].metadata).toMatchObject({ fields: ["email"], changes: { email: { from: "ancienne@exemple.test", to: "nouvelle@exemple.test" } } });
    // Rien ne part tout seul : le geste suivant, c'est « Renvoyer l'invitation ».
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse l'adresse d'un autre directeur, sans rien modifier", async () => {
    const director = seed({ email: "a@exemple.test" });
    seed({ email: "b@exemple.test" });
    await expect(service.updateSalesDirector(director.id, { email: "B@exemple.test", firstName: "Zoé" }, "adm_1")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(rows().get(director.id)).toMatchObject({ email: "a@exemple.test", firstName: "Camille" });
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("rien à changer : aucune écriture, aucune trace", async () => {
    const director = seed({ email: "a@exemple.test" });
    await expect(service.updateSalesDirector(director.id, { email: "A@exemple.test", firstName: "Camille" }, "adm_1")).resolves.toEqual({ emailChanged: false });
    expect(prismaMock.salesDirector.update).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un directeur inconnu est refusé", async () => {
    await expect(service.updateSalesDirector("dir_inconnu", { firstName: "X" }, "adm_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("lister", () => {
  it("rend nom, e-mail, statut, invitation, dernière connexion, actifs d'abord — jamais le hachage ni l'empreinte du lien", async () => {
    seed({ id: "dir_a", firstName: "Alice", invitedAt: new Date("2026-10-02T08:00:00Z"), lastLoginAt: new Date("2026-10-04T08:00:00Z"), passwordResetExpiresAt: EXPIRES, passwordResetTokenHash: "empreinte-secrète" });
    const list = await service.listSalesDirectors();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "dir_a", firstName: "Alice", lastName: "Durand", email: "dir_a@exemple.test", isActive: true, linkExpiresAt: EXPIRES });
    expect(JSON.stringify(list)).not.toMatch(/hash|empreinte/i);
    const call = prismaMock.salesDirector.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ isActive: "desc" }, { createdAt: "asc" }]);
    expect(call.select).not.toHaveProperty("passwordHash");
    expect(call.select).not.toHaveProperty("passwordResetTokenHash");
  });

  it("aucun directeur : liste vide, honnête", async () => {
    await expect(service.listSalesDirectors()).resolves.toEqual([]);
  });

  it("l'équipe vue par le directeur : tous les commerciaux de la plateforme, actifs et au total", async () => {
    prismaMock.salesRep.count.mockImplementation(async (args?: { where?: { isActive?: boolean } }) => (args?.where?.isActive ? 4 : 6));
    await expect(service.salesTeamCounts()).resolves.toEqual({ active: 4, total: 6 });
  });
});

describe("où en est l'accès d'un directeur", () => {
  const NOW = new Date("2026-10-06T10:00:00Z");
  const base = { invitedAt: null, lastLoginAt: null, linkExpiresAt: null };

  it("déjà connecté : rien à faire", () => {
    expect(service.directorInvitationState({ ...base, invitedAt: new Date("2026-10-01T00:00:00Z"), lastLoginAt: new Date("2026-10-05T00:00:00Z") }, NOW)).toEqual({ label: "Connecté", tone: "success", hint: null });
  });

  it("jamais invité : le dit, et propose de renvoyer", () => {
    expect(service.directorInvitationState(base, NOW)).toMatchObject({ label: "Invitation non envoyée", tone: "warning", hint: "Renvoyez l'invitation." });
  });

  it("invité, lien encore valable : en attente", () => {
    expect(service.directorInvitationState({ ...base, invitedAt: new Date("2026-10-05T00:00:00Z"), linkExpiresAt: EXPIRES }, NOW)).toMatchObject({ label: "Invitation en attente", tone: "info" });
  });

  it("invité, lien expiré : à renvoyer", () => {
    expect(service.directorInvitationState({ ...base, invitedAt: new Date("2026-09-20T00:00:00Z"), linkExpiresAt: new Date("2026-09-27T00:00:00Z") }, NOW)).toMatchObject({ label: "Lien expiré", tone: "warning", hint: "Renvoyez l'invitation." });
  });
});
