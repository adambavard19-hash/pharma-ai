import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le logiciel après le paiement (fondateur, 5 nov. 2026) : bloqué pour les officines des nouveaux parcours, débloqué une
 * seule fois (première facture payée, ou clic du fondateur), et alors seulement le guide d'installation part.
 */
const db = vi.hoisted(() => ({
  pharmacy: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  membership: { findFirst: vi.fn() },
}));
const guide = vi.hoisted(() => ({ sendInstallationGuide: vi.fn() }));
const password = vi.hoisted(() => ({ sendUserPasswordLink: vi.fn() }));
const notifications = vi.hoisted(() => ({ notifyAdmins: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/services/sales/notifications", () => notifications);
vi.mock("@/server/services/platform-onboarding", () => guide);
vi.mock("@/server/services/user-password", () => password);

const gate = await import("@/server/services/software-gate");

beforeEach(() => {
  vi.clearAllMocks();
  db.pharmacy.findUnique.mockResolvedValue({ name: "Pharmacie du Port", softwareGate: true, softwareUnlockedAt: null });
  db.pharmacy.updateMany.mockResolvedValue({ count: 1 });
  db.membership.findFirst.mockResolvedValue({ user: { id: "u-1", lastLoginAt: new Date() } });
  guide.sendInstallationGuide.mockResolvedValue({ status: "SENT", detail: "", sentTo: "marc@port.fr" });
  password.sendUserPasswordLink.mockResolvedValue({ status: "SENT", detail: "", url: "" });
});

describe("le logiciel attend le paiement", () => {
  it("bloqué tant que rien n'est débloqué ; jamais bloqué pour une officine d'avant", async () => {
    expect(await gate.softwareAvailable("ph-1")).toBe(false);
    db.pharmacy.findUnique.mockResolvedValueOnce({ softwareGate: false, softwareUnlockedAt: null });
    expect(await gate.softwareAvailable("ph-1")).toBe(true);
    db.pharmacy.findUnique.mockResolvedValueOnce({ softwareGate: true, softwareUnlockedAt: new Date() });
    expect(await gate.softwareAvailable("ph-1")).toBe(true);
  });

  it("payé : débloqué une fois, le guide d'installation part, la console est prévenue", async () => {
    expect(await gate.unlockSoftware("ph-1", { reason: "PAID" })).toBe(true);
    expect(db.pharmacy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ph-1", softwareGate: true, softwareUnlockedAt: null } }));
    expect(guide.sendInstallationGuide).toHaveBeenCalledWith("ph-1", expect.objectContaining({ reason: "SUBSCRIPTION_PAID" }));
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "SOFTWARE_UNLOCKED" }));
    // Le titulaire s'est déjà connecté (lien de bienvenue après la démo) : pas de second accueil.
    expect(password.sendUserPasswordLink).not.toHaveBeenCalled();
  });

  it("déjà débloqué (webhook rejoué) : rien ne repart", async () => {
    db.pharmacy.updateMany.mockResolvedValue({ count: 0 });
    expect(await gate.unlockSoftware("ph-1", { reason: "PAID" })).toBe(false);
    expect(guide.sendInstallationGuide).not.toHaveBeenCalled();
  });

  it("souscription du site : le titulaire n'a jamais eu son accès, il le reçoit avec le logiciel", async () => {
    db.membership.findFirst.mockResolvedValue({ user: { id: "u-1", lastLoginAt: null } });
    await gate.unlockSoftware("ph-1", { reason: "PAID" });
    expect(password.sendUserPasswordLink).toHaveBeenCalledWith("u-1", "welcome");
  });

  it("le fondateur débloque depuis la console : le guide part au nom de l'admin", async () => {
    await gate.unlockSoftware("ph-1", { reason: "ADMIN", adminId: "adm-1" });
    expect(guide.sendInstallationGuide).toHaveBeenCalledWith("ph-1", { adminId: "adm-1", reason: "ADMIN" });
  });

  it("après un paiement, chaque officine de l'organisation qui attendait est débloquée", async () => {
    db.pharmacy.findMany.mockResolvedValue([{ id: "ph-1" }, { id: "ph-2" }]);
    await gate.unlockSoftwareAfterPayment("org-1");
    expect(db.pharmacy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", softwareGate: true, softwareUnlockedAt: null } }));
    expect(db.pharmacy.updateMany).toHaveBeenCalledTimes(2);
  });
});
