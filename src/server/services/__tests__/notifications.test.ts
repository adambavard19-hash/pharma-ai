import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), create: vi.fn(), readCreateMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { notification: { count: m.count, findMany: m.findMany, create: m.create }, notificationRead: { createMany: m.readCreateMany } } }));

const { countUnreadNotifications, listNotifications, markAllNotificationsRead, markNotificationsRead } = await import("../notifications");
const lea = { pharmacyId: "ph1", organizationId: "org1", userId: "lea" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.readCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
});

describe("la cloche, pour chacun et dans son officine", () => {
  it("compte les non lues de SON officine, à elle ou à l'équipe, ni lues avant, ni lues par elle", async () => {
    m.count.mockResolvedValue(3);
    expect(await countUnreadNotifications(lea)).toBe(3);
    expect(m.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph1", OR: [{ userId: null }, { userId: "lea" }], readAt: null, reads: { none: { userId: "lea" } } } });
  });

  it("une notification d'équipe lue par un collègue reste non lue pour elle ; lue par elle ou avant, elle est lue", async () => {
    m.findMany.mockResolvedValue([
      { id: "a", type: "LOW_STOCK", severity: "WARNING", title: "t", body: "b", linkUrl: null, createdAt: new Date(), readAt: null, reads: [] },
      { id: "b", type: "TEAM_EVENT", severity: "INFO", title: "t", body: "b", linkUrl: null, createdAt: new Date(), readAt: null, reads: [{ userId: "lea" }] },
      { id: "c", type: "SYSTEM", severity: "INFO", title: "t", body: "b", linkUrl: null, createdAt: new Date(), readAt: new Date(), reads: [] },
    ]);
    const rows = await listNotifications(lea);
    expect(rows.map((row) => [row.id, row.read])).toEqual([["a", false], ["b", true], ["c", true]]);
    const query = m.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ pharmacyId: "ph1", OR: [{ userId: null }, { userId: "lea" }] });
    // On ne lit que SES marques de lecture, jamais celles des collègues.
    expect(query.select.reads).toEqual({ where: { userId: "lea" }, select: { userId: true } });
  });

  it("marquer lu ne vise que des notifications qu'elle voit encore non lues, et n'écrit que pour elle", async () => {
    m.findMany.mockResolvedValue([{ id: "a" }]);
    expect(await markNotificationsRead(lea, ["a", "a", "autre-officine"])).toBe(1);
    expect(m.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph1", id: { in: ["a", "autre-officine"] }, reads: { none: { userId: "lea" } } });
    expect(m.readCreateMany).toHaveBeenCalledWith({ data: [{ notificationId: "a", userId: "lea" }], skipDuplicates: true });
  });

  it("rien à marquer : aucune écriture", async () => {
    expect(await markNotificationsRead(lea, [])).toBe(0);
    m.findMany.mockResolvedValue([]);
    expect(await markAllNotificationsRead(lea)).toBe(0);
    expect(m.readCreateMany).not.toHaveBeenCalled();
  });

  it("tout marquer comme lu : seulement les siennes, dans son officine", async () => {
    m.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await markAllNotificationsRead(lea)).toBe(2);
    expect(m.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph1" });
    expect(m.readCreateMany.mock.calls[0][0].data.every((row: { userId: string }) => row.userId === "lea")).toBe(true);
  });
});
