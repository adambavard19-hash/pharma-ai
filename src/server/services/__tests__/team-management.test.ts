import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Modifier un collaborateur depuis l'espace du titulaire (ou de l'administrateur) : ce qui est éprouvé, c'est que
 * l'identité reste celle d'un COMPTE (jamais renommer chez une autre officine), que les règles de l'équipe s'appliquent
 * avant toute écriture, et qu'un changement refusé n'écrit RIEN.
 */

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  membership: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn() },
  session: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: prismaMock }));
vi.mock("@/server/audit/log", () => auditMock);

const { ensurePrincipal, loadTeam, moveTeamMember, nextSortOrder, updateTeamMember } = await import("../team-management");

type Row = { id: string; userId: string; role: string; isActive: boolean; isPrincipal: boolean; user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; rppsNumber: string | null; memberships: { id: string }[] } };

const row = (userId: string, role: string, extra: Partial<Row> & { elsewhere?: number; first?: string; last?: string } = {}): Row => ({
  id: `m_${userId}`,
  userId,
  role,
  isActive: true,
  isPrincipal: false,
  user: { id: userId, firstName: extra.first ?? userId, lastName: extra.last ?? "Nom", email: `${userId}@pharmacie.fr`, phone: null, rppsNumber: null, memberships: Array.from({ length: extra.elsewhere ?? 0 }, (_, i) => ({ id: `other_${i}` })) },
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => !["elsewhere", "first", "last"].includes(key))),
});

const owner = { kind: "member" as const, userId: "adam", role: "OWNER" as const };

/** « La pharmacie du petit Nicolas » : Adam, titulaire principal ; Donna, pharmacienne ; Léo, préparateur. */
function wireTeam(rows: Row[] = [row("adam", "OWNER", { isPrincipal: true, first: "Adam", last: "Bavard" }), row("donna", "PHARMACIST", { first: "Donna", last: "Benveniste" }), row("leo", "TECHNICIAN")]) {
  prismaMock.membership.findMany.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock) : Promise.all(arg as Promise<unknown>[])));
  prismaMock.user.findFirst.mockResolvedValue(null);
});

describe("modifier l'identité d'un collaborateur", () => {
  it("le titulaire corrige le prénom et le nom d'un collaborateur de son officine", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { firstName: "Donna-Marie", lastName: "BENVENISTE" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toEqual({ ok: true, name: "Donna-Marie BENVENISTE", changed: ["firstName", "lastName"] });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "donna" }, data: { firstName: "Donna-Marie", lastName: "BENVENISTE" } });
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_updated", userId: "adam", metadata: { fields: ["firstName", "lastName"] } }));
  });

  it("n'écrit que ce qui change : rien du tout si tout est identique", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { firstName: "Donna", lastName: "Benveniste" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toEqual({ ok: true, name: "Donna Benveniste", changed: [] });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("un compte qui travaille aussi dans une autre officine garde son identité (le titulaire ne le renomme pas chez l'autre)", async () => {
    wireTeam([row("adam", "OWNER", { isPrincipal: true }), row("donna", "PHARMACIST", { elsewhere: 1, first: "Donna" })]);
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { firstName: "Autre" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/autre officine/) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("…mais on change son poste, et l'administrateur corrige son identité", async () => {
    wireTeam([row("adam", "OWNER", { isPrincipal: true }), row("donna", "PHARMACIST", { elsewhere: 1, first: "Donna" })]);
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { role: "TECHNICIAN" }, actor: owner, audit: { userId: "adam" } })).toMatchObject({ ok: true, changed: ["role"] });
    wireTeam([row("adam", "OWNER", { isPrincipal: true }), row("donna", "PHARMACIST", { elsewhere: 1, first: "Donna" })]);
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { firstName: "Autre" }, actor: { kind: "admin" }, audit: { platformAdminId: "adm" } })).toMatchObject({ ok: true });
  });

  it("chacun modifie son propre nom, même s'il travaille dans deux officines", async () => {
    wireTeam([row("adam", "OWNER", { isPrincipal: true, elsewhere: 1 })]);
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "adam", changes: { lastName: "BAVARD" }, actor: owner, audit: { userId: "adam" } })).toMatchObject({ ok: true });
  });

  it("efface un téléphone et un numéro RPPS quand on les vide", async () => {
    wireTeam([row("adam", "OWNER", { isPrincipal: true }), { ...row("donna", "PHARMACIST"), user: { ...row("donna", "PHARMACIST").user, phone: "0600000000", rppsNumber: "10001234567" } }]);
    await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { phone: "", rppsNumber: null }, actor: owner, audit: { userId: "adam" } });
    expect(prismaMock.user.update.mock.calls[0][0].data).toEqual({ phone: null, rppsNumber: null });
  });
});

describe("changer l'adresse de connexion", () => {
  it("ferme les sessions de la personne et annule son lien de mot de passe en attente", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "leo", changes: { email: "Leo.Nouveau@Pharmacie.fr" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toMatchObject({ ok: true, changed: ["email"] });
    expect(prismaMock.user.update.mock.calls[0][0].data).toMatchObject({ email: "leo.nouveau@pharmacie.fr", passwordResetTokenHash: null, passwordResetExpiresAt: null });
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({ where: { userId: "leo", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("une adresse déjà prise est « indisponible », sans dire par qui", async () => {
    wireTeam();
    prismaMock.user.findFirst.mockResolvedValue({ id: "autre" });
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "leo", changes: { email: "pris@ailleurs.fr" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toEqual({ ok: false, error: "Cette adresse e-mail n'est pas disponible." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("on ne change pas sa propre adresse de connexion (la session en cours serait fermée), l'administrateur le peut", async () => {
    wireTeam();
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "adam", changes: { email: "nouveau@pharmacie.fr" }, actor: owner, audit: { userId: "adam" } })).toMatchObject({ ok: false, error: expect.stringMatching(/déconnecté/) });
    wireTeam();
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "adam", changes: { email: "nouveau@pharmacie.fr" }, actor: { kind: "admin" }, audit: { platformAdminId: "adm" } })).toMatchObject({ ok: true });
  });
});

describe("le poste et le titulaire principal", () => {
  it("le titulaire change le poste de Donna : pharmacienne → préparatrice", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { role: "TECHNICIAN" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toMatchObject({ ok: true, changed: ["role"] });
    expect(prismaMock.membership.update).toHaveBeenCalledWith({ where: { id: "m_donna" }, data: { role: "TECHNICIAN", isPrincipal: false } });
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_role_changed", metadata: { from: "PHARMACIST", role: "TECHNICIAN" } }));
  });

  it("nommer Donna titulaire principal : elle devient titulaire, Adam cesse de l'être — d'un seul geste", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { role: "OWNER", isPrincipal: true }, actor: owner, audit: { userId: "adam" } });
    expect(result).toMatchObject({ ok: true, changed: ["role", "principal"] });
    const writes = prismaMock.membership.update.mock.calls.map((call) => call[0]);
    expect(writes).toContainEqual({ where: { id: "m_donna" }, data: { role: "OWNER", isPrincipal: true } });
    expect(writes).toContainEqual({ where: { id: "m_adam" }, data: { role: "OWNER", isPrincipal: false } });
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.principal_changed", metadata: { principal: "donna", previous: "adam" } }));
  });

  it("un refus n'écrit rien : même si le prénom était valide, le poste refusé annule tout", async () => {
    wireTeam();
    const result = await updateTeamMember({ pharmacyId: "ph", userId: "adam", changes: { firstName: "Adam-Louis", role: "PHARMACIST" }, actor: owner, audit: { userId: "adam" } });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/titulaire principal/) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("une pharmacienne ne se nomme pas titulaire elle-même", async () => {
    wireTeam();
    const adjoint = { kind: "member" as const, userId: "donna", role: "PHARMACIST" as const };
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "donna", changes: { role: "OWNER" }, actor: adjoint, audit: { userId: "donna" } })).toMatchObject({ ok: false, error: expect.stringMatching(/Seul un titulaire/) });
  });

  it("un collaborateur d'une autre officine est introuvable", async () => {
    wireTeam();
    expect(await updateTeamMember({ pharmacyId: "ph", userId: "etranger", changes: { role: "VIEWER" }, actor: owner, audit: { userId: "adam" } })).toEqual({ ok: false, error: "Collaborateur introuvable dans cette équipe." });
    // La recherche est bornée à l'officine et aux comptes non supprimés.
    expect(prismaMock.membership.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph", user: { deletedAt: null } });
  });

  it("l'administrateur est tracé sous son nom, pas sous celui d'un membre", async () => {
    wireTeam();
    await updateTeamMember({ pharmacyId: "ph", userId: "leo", changes: { role: "STUDENT" }, actor: { kind: "admin" }, audit: { platformAdminId: "adm_1" } });
    const entry = auditMock.recordAudit.mock.calls[0][0];
    expect(entry.platformAdminId).toBe("adm_1");
    expect(entry.userId).toBeUndefined();
  });
});

describe("l'ordre de l'équipe", () => {
  const ordered = [
    { id: "m_adam", userId: "adam", sortOrder: 1, user: { firstName: "Adam", lastName: "Bavard" } },
    { id: "m_donna", userId: "donna", sortOrder: 2, user: { firstName: "Donna", lastName: "Benveniste" } },
    { id: "m_leo", userId: "leo", sortOrder: 3, user: { firstName: "Léo", lastName: "Martin" } },
  ];

  it("monter Donna d'un cran : elle passe devant Adam, les places sont renumérotées", async () => {
    prismaMock.membership.findMany.mockResolvedValue(ordered);
    const result = await moveTeamMember({ pharmacyId: "ph", userId: "donna", direction: "up", audit: { userId: "adam" } });
    expect(result).toEqual({ ok: true, moved: true, name: "Donna Benveniste" });
    const writes = prismaMock.membership.update.mock.calls.map((call) => call[0]);
    expect(writes).toContainEqual({ where: { id: "m_donna" }, data: { sortOrder: 1 } });
    expect(writes).toContainEqual({ where: { id: "m_adam" }, data: { sortOrder: 2 } });
    expect(writes).toHaveLength(2); // Léo ne bouge pas : seules les places qui changent sont écrites
    expect(auditMock.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_reordered", metadata: { direction: "up" } }));
  });

  it("monter le premier ne fait rien et n'écrit rien", async () => {
    prismaMock.membership.findMany.mockResolvedValue(ordered);
    expect(await moveTeamMember({ pharmacyId: "ph", userId: "adam", direction: "up", audit: { userId: "adam" } })).toEqual({ ok: true, moved: false, name: "Adam Bavard" });
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
    expect(auditMock.recordAudit).not.toHaveBeenCalled();
  });

  it("répare des places en double (équipe créée avant ce lot) en les numérotant 1…n", async () => {
    prismaMock.membership.findMany.mockResolvedValue(ordered.map((member) => ({ ...member, sortOrder: 0 })));
    await moveTeamMember({ pharmacyId: "ph", userId: "leo", direction: "up", audit: { userId: "adam" } });
    const places = Object.fromEntries(prismaMock.membership.update.mock.calls.map((call) => [call[0].where.id, call[0].data.sortOrder]));
    expect(places).toEqual({ m_adam: 1, m_leo: 2, m_donna: 3 });
  });

  it("un collaborateur d'une autre officine est introuvable", async () => {
    prismaMock.membership.findMany.mockResolvedValue(ordered);
    expect(await moveTeamMember({ pharmacyId: "ph", userId: "etranger", direction: "up", audit: { userId: "adam" } })).toMatchObject({ ok: false });
  });

  it("un nouveau collaborateur arrive en dernier", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ sortOrder: 7 });
    expect(await nextSortOrder(prismaMock as never, "ph")).toBe(8);
    prismaMock.membership.findFirst.mockResolvedValue(null);
    expect(await nextSortOrder(prismaMock as never, "ph")).toBe(1);
  });
});

describe("toujours un titulaire principal", () => {
  it("désigne le premier titulaire actif de la liste quand il n'y en a plus", async () => {
    prismaMock.membership.findMany.mockResolvedValue([{ id: "m_sam", isPrincipal: false }, { id: "m_zoe", isPrincipal: false }]);
    await ensurePrincipal(prismaMock as never, "ph");
    expect(prismaMock.membership.update).toHaveBeenCalledWith({ where: { id: "m_sam" }, data: { isPrincipal: true } });
  });

  it("ne touche à rien quand il y en a un, ou quand il n'y a aucun titulaire actif", async () => {
    prismaMock.membership.findMany.mockResolvedValue([{ id: "m_adam", isPrincipal: true }, { id: "m_sam", isPrincipal: false }]);
    await ensurePrincipal(prismaMock as never, "ph");
    prismaMock.membership.findMany.mockResolvedValue([]);
    await ensurePrincipal(prismaMock as never, "ph");
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
  });
});

describe("la liste affichée", () => {
  it("lit l'équipe dans l'ordre choisi, sans les comptes supprimés, et signale les comptes partagés", async () => {
    prismaMock.membership.findMany.mockResolvedValue([
      { id: "m1", role: "OWNER", isActive: true, isPrincipal: true, sortOrder: 1, user: { id: "adam", firstName: "Adam", lastName: "Bavard", email: "a@p.fr", phone: null, rppsNumber: null, lastLoginAt: null, _count: { memberships: 2 } } },
      { id: "m2", role: "PHARMACIST", isActive: true, isPrincipal: false, sortOrder: 2, user: { id: "donna", firstName: "Donna", lastName: "Benveniste", email: "d@p.fr", phone: null, rppsNumber: null, lastLoginAt: null, _count: { memberships: 1 } } },
    ]);
    const team = await loadTeam("ph");
    expect(team.map((member) => [member.userId, member.isPrincipal, member.sharedAccount])).toEqual([["adam", true, true], ["donna", false, false]]);
    const args = prismaMock.membership.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ pharmacyId: "ph", user: { deletedAt: null } });
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
  });
});
