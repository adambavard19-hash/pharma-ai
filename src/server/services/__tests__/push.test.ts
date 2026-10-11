import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const env: Record<string, string | undefined> = {};
vi.mock("@/config/env", () => ({ getEnv: () => env }));
const db = {
  notification: { count: vi.fn() },
  membership: { findMany: vi.fn() },
  pushDevice: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
};
vi.mock("@/server/db/client", () => ({ prisma: db }));

const { pushRecipientsFor, pushForNotification, registerPushDevice, sendPushToUsers } = await import("../push");

const notification = { id: "n1", pharmacyId: "ph_a", userId: null, type: "LOW_STOCK" as const, createdAt: new Date("2026-10-11T10:00:00Z"), linkUrl: "/stock" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(env)) delete env[key];
});

describe("qui reçoit le push d'une notification", () => {
  it("toute l'équipe ACTIVE de cette officine seulement — jamais une autre officine", async () => {
    db.notification.count.mockResolvedValue(0);
    db.membership.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    expect(await pushRecipientsFor(notification)).toEqual(["u1", "u2"]);
    const where = db.membership.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ pharmacyId: "ph_a", isActive: true, user: { deletedAt: null, status: "ACTIVE" } });
    expect(where).not.toHaveProperty("userId");
  });

  it("une notification personnelle : la personne visée, si elle est de l'officine", async () => {
    db.notification.count.mockResolvedValue(0);
    db.membership.findMany.mockResolvedValue([{ userId: "u9" }]);
    await pushRecipientsFor({ ...notification, userId: "u9" });
    expect(db.membership.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_a", userId: "u9" });
  });

  it("une rafale de la même sorte dans la demi-heure ne sonne qu'une fois", async () => {
    db.notification.count.mockResolvedValue(3);
    expect(await pushRecipientsFor(notification)).toEqual([]);
    expect(db.membership.findMany).not.toHaveBeenCalled();
    expect(db.notification.count.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_a", type: "LOW_STOCK", id: { not: "n1" } });
  });
});

describe("sans clé Apple", () => {
  it("rien ne part et la base n'est même pas lue", async () => {
    await pushForNotification(notification);
    expect(await sendPushToUsers(["u1"], "BONUS_VALIDATED", "/m/moi")).toEqual({ sent: 0, disabled: 0 });
    expect(db.notification.count).not.toHaveBeenCalled();
    expect(db.pushDevice.findMany).not.toHaveBeenCalled();
  });
});

describe("enregistrer un téléphone", () => {
  it("refuse ce qui n'est pas un jeton d'Apple, rattache le jeton au compte connecté", async () => {
    expect(await registerPushDevice("u1", "pas-un-jeton", "production")).toBe(false);
    expect(db.pushDevice.upsert).not.toHaveBeenCalled();
    expect(await registerPushDevice("u1", "ab".repeat(32), "production")).toBe(true);
    expect(db.pushDevice.upsert.mock.calls[0][0]).toMatchObject({ where: { token: "ab".repeat(32) }, create: { userId: "u1" }, update: { userId: "u1", disabledAt: null } });
  });
});
