import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const limit = vi.hoisted(() => ({ rateLimited: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => session);
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/audit/log", () => audit);
vi.mock("@/server/http/rate-limit", () => limit);

const { suggestLabAction } = await import("../assortment");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph-1", userId: "u-1" }, pharmacy: { name: "Pharmacie Saint-Michel" } });
  limit.rateLimited.mockReturnValue(false);
});

describe("signaler un laboratoire à PharmaBoost", () => {
  it("exige la permission du titulaire (partenaires) avant tout", async () => {
    session.requirePermission.mockRejectedValue(new Error("403"));
    await expect(suggestLabAction({ name: "Laboratoire Test" })).rejects.toThrow();
    expect(session.requirePermission).toHaveBeenCalledWith(PERMISSIONS.PARTNERS_MANAGE);
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("transmet la suggestion à l'équipe PharmaBoost, avec le nom de l'officine, et la trace sans donnée patient", async () => {
    const result = await suggestLabAction({ name: "Laboratoire Test", need: "Chaud ou froid sur la douleur", note: "Mes patients le demandent" });
    expect(result.ok).toBe(true);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "LAB_SUGGESTION", title: "Laboratoire suggéré — Pharmacie Saint-Michel", linkUrl: "/admin/pharmacies/ph-1", body: expect.stringContaining("Laboratoire Test") }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "assortment.lab_suggested", pharmacyId: "ph-1", userId: "u-1", metadata: { name: "Laboratoire Test", need: "Chaud ou froid sur la douleur" } }));
  });

  it("refuse un nom vide ou trop long, sans rien envoyer", async () => {
    for (const bad of [{ name: "" }, { name: "x" }, { name: "x".repeat(121) }, { name: "Labo", note: "y".repeat(601) }]) {
      expect((await suggestLabAction(bad)).ok).toBe(false);
    }
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("limite le nombre de suggestions par officine et par jour", async () => {
    limit.rateLimited.mockReturnValue(true);
    expect((await suggestLabAction({ name: "Laboratoire Test" })).ok).toBe(false);
    expect(limit.rateLimited).toHaveBeenCalledWith("lab-suggestion:ph-1", 10, 24 * 60 * 60 * 1000);
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });
});
