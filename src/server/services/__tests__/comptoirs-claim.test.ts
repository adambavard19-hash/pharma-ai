import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ membershipFindMany: vi.fn(), postFindMany: vi.fn(), postFindFirst: vi.fn(), postUpdate: vi.fn(), postUpdateMany: vi.fn(), audit: vi.fn(), notify: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { membership: { findMany: m.membershipFindMany }, counterPost: { findMany: m.postFindMany, findFirst: m.postFindFirst, update: m.postUpdate, updateMany: m.postUpdateMany }, $transaction: m.transaction } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/services/notifications", () => ({ createNotification: m.notify }));

const { claimComptoir, releaseComptoir } = await import("../comptoirs");
const scope = { pharmacyId: "ph1", organizationId: "org1", userId: "lea" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.membershipFindMany.mockResolvedValue([{ role: "TECHNICIAN", user: { id: "lea", firstName: "Léa", lastName: "Martin" } }, { role: "PHARMACIST", user: { id: "hugo", firstName: "Hugo", lastName: "Lambert" } }]);
  m.postFindMany.mockResolvedValue([
    { id: "p1", label: "Comptoir 1", hostname: "PC-1", assignedUserId: "lea" },
    { id: "p2", label: "Comptoir 2", hostname: "PC-2", assignedUserId: null },
    { id: "p3", label: "Comptoir 3", hostname: "PC-3", assignedUserId: "hugo" },
  ]);
  m.transaction.mockImplementation(async (operations: unknown[]) => operations);
  m.notify.mockResolvedValue(undefined);
  m.audit.mockResolvedValue(undefined);
});

describe("« Je travaille ici » : s'identifier au comptoir sans réinstaller", () => {
  it("prend un comptoir libre, libère l'ancien, garde la trace", async () => {
    expect(await claimComptoir(scope, "p2")).toEqual({ ok: true, name: "Comptoir 2", changed: true });
    expect(m.postFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph1", revokedAt: null, pairedAt: { not: null } } }));
    expect(m.postUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1"] }, pharmacyId: "ph1", assignedUserId: "lea" }, data: { assignedUserId: null } });
    expect(m.postUpdate).toHaveBeenCalledWith({ where: { id: "p2" }, data: { assignedUserId: "lea" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.claimed", pharmacyId: "ph1", userId: "lea", metadata: { previous: null, released: ["p1"] } }));
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("prendre le comptoir de quelqu'un le prévient, et la trace dit qui l'occupait", async () => {
    await claimComptoir(scope, "p3");
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph1", userId: "hugo", title: "Léa Martin a pris Comptoir 3" }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { previous: "hugo", released: ["p1"] } }));
  });

  it("reprendre son propre comptoir n'écrit rien", async () => {
    expect(await claimComptoir(scope, "p1")).toEqual({ ok: true, name: "Comptoir 1", changed: false });
    expect(m.postUpdate).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("un comptoir d'une autre pharmacie est introuvable ; quelqu'un qui n'est pas de l'équipe ne peut rien prendre", async () => {
    expect(await claimComptoir(scope, "p-autre")).toEqual({ ok: false, error: "Comptoir introuvable." });
    expect(m.postUpdate).not.toHaveBeenCalled();
    m.membershipFindMany.mockResolvedValue([{ role: "OWNER", user: { id: "titulaire", firstName: "Anne", lastName: "Roux" } }]);
    expect(await claimComptoir(scope, "p2")).toMatchObject({ ok: false });
    expect(m.postUpdate).not.toHaveBeenCalled();
  });

  it("libérer ne touche qu'à SON comptoir", async () => {
    m.postFindFirst.mockResolvedValue({ id: "p1", label: "Comptoir 1", hostname: "PC-1" });
    expect(await releaseComptoir(scope, "p1")).toEqual({ ok: true, name: "Comptoir 1" });
    expect(m.postFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", pharmacyId: "ph1", revokedAt: null, assignedUserId: "lea" } }));
    expect(m.postUpdateMany).toHaveBeenCalledWith({ where: { id: "p1", pharmacyId: "ph1", assignedUserId: "lea" }, data: { assignedUserId: null } });
    m.postFindFirst.mockResolvedValue(null);
    expect(await releaseComptoir(scope, "p3")).toMatchObject({ ok: false });
  });
});
