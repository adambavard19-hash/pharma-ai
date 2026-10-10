import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ membershipFindMany: vi.fn(), postFindMany: vi.fn(), postFindFirst: vi.fn(), postUpdate: vi.fn(), postUpdateMany: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { membership: { findMany: m.membershipFindMany }, counterPost: { findMany: m.postFindMany, findFirst: m.postFindFirst, update: m.postUpdate, updateMany: m.postUpdateMany } } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));

const { listMembers, listComptoirs, myComptoirs, assignComptoir, renameComptoir } = await import("../comptoirs");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "titulaire" } as never;
const members = [{ role: "OWNER", user: { id: "titulaire", firstName: "Anne", lastName: "Roux" } }, { role: "PHARMACIST", user: { id: "lea", firstName: "Léa", lastName: "Martin" } }];

beforeEach(() => {
  vi.clearAllMocks();
  m.membershipFindMany.mockResolvedValue(members);
  m.postFindMany.mockResolvedValue([
    { id: "p1", label: "Comptoir 1", hostname: "PC-1", assignedUserId: "lea", pairedAt: new Date(), lastSeenAt: null, lastScanAt: null },
    { id: "p2", label: null, hostname: "PC-2", assignedUserId: null, pairedAt: new Date(), lastSeenAt: null, lastScanAt: null },
  ]);
});

describe("l'équipe et les comptoirs d'une pharmacie", () => {
  it("l'équipe, ce sont les membres actifs de CETTE pharmacie", async () => {
    expect(await listMembers("ph1")).toEqual([{ id: "titulaire", name: "Anne Roux", role: "OWNER" }, { id: "lea", name: "Léa Martin", role: "PHARMACIST" }]);
    expect(m.membershipFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ pharmacyId: "ph1", isActive: true }) }));
  });

  it("les comptoirs reliés disent leur nom et leur collaborateur ; seuls les postes reliés et non retirés comptent", async () => {
    const posts = await listComptoirs("ph1");
    expect(posts.map((post) => [post.name, post.assigneeName])).toEqual([["Comptoir 1", "Léa Martin"], ["PC-2", null]]);
    expect(m.postFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph1", revokedAt: null, pairedAt: { not: null } } }));
  });

  it("chacun voit les siens : Léa le comptoir 1, le titulaire aucun (plusieurs comptoirs, aucun pour lui)", async () => {
    expect((await myComptoirs({ pharmacyId: "ph1", userId: "lea" })).postIds).toEqual(["p1"]);
    expect(await myComptoirs({ pharmacyId: "ph1", userId: "titulaire" })).toMatchObject({ postIds: [], mode: "NONE" });
  });
});

describe("attribuer et renommer un comptoir", () => {
  it("attribue un comptoir de la pharmacie à un membre de l'équipe, et garde la trace", async () => {
    m.postFindFirst.mockResolvedValue({ id: "p2", label: null, hostname: "PC-2", assignedUserId: null });
    expect(await assignComptoir(scope, "p2", "lea")).toEqual({ ok: true, name: "PC-2", assignee: "Léa Martin" });
    expect(m.postFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "p2", pharmacyId: "ph1", revokedAt: null }) }));
    expect(m.postUpdate).toHaveBeenCalledWith({ where: { id: "p2" }, data: { assignedUserId: "lea" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.assigned", pharmacyId: "ph1", metadata: { from: null, to: "lea" } }));
  });

  it("refuse quelqu'un qui n'est pas dans l'équipe de la pharmacie (ni d'une autre), et un comptoir d'une autre pharmacie", async () => {
    m.postFindFirst.mockResolvedValue({ id: "p2", label: null, hostname: "PC-2", assignedUserId: null });
    expect(await assignComptoir(scope, "p2", "quelqu-un-d-une-autre-pharmacie")).toMatchObject({ ok: false });
    m.postFindFirst.mockResolvedValue(null);
    expect(await assignComptoir(scope, "p-autre", "lea")).toMatchObject({ ok: false, error: "Comptoir introuvable." });
    expect(m.postUpdate).not.toHaveBeenCalled();
  });

  it("peut retirer l'attribution", async () => {
    m.postFindFirst.mockResolvedValue({ id: "p1", label: "Comptoir 1", hostname: "PC-1", assignedUserId: "lea" });
    expect(await assignComptoir(scope, "p1", null)).toEqual({ ok: true, name: "Comptoir 1", assignee: null });
    expect(m.postUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { assignedUserId: null } });
  });

  it("renomme seulement un comptoir de SA pharmacie, avec un nom net", async () => {
    m.postUpdateMany.mockResolvedValue({ count: 1 });
    expect(await renameComptoir(scope, "p1", "  Caisse   arrière ")).toEqual({ ok: true, name: "Caisse arrière" });
    expect(m.postUpdateMany).toHaveBeenCalledWith({ where: { id: "p1", pharmacyId: "ph1", revokedAt: null }, data: { label: "Caisse arrière" } });
    m.postUpdateMany.mockResolvedValue({ count: 0 });
    expect(await renameComptoir(scope, "p-autre", "Caisse")).toMatchObject({ ok: false });
    expect((await renameComptoir(scope, "p1", "a")).ok).toBe(false);
  });
});
