import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les comptoirs : un nouveau lien pour un comptoir pas encore installé, et la vérification qu'un jeton est bien
 * celui d'un lien de CETTE officine avant d'envoyer quoi que ce soit. Prisma est simulé ; les empreintes sont vraies.
 */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const db = vi.hoisted(() => ({
  counterPost: { findFirst: vi.fn(), update: vi.fn() },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: audit.recordAudit }));
vi.mock("../notifications", () => ({ createNotification: vi.fn() }));
vi.mock("../stock-import", () => ({ analyseStockImport: vi.fn(), commitStockImport: vi.fn() }));

const service = await import("../stock-sync");

const NOW = new Date("2026-10-08T09:00:00.000Z");
const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_owner" };
const TOKEN = "AbCdEfGhIjKlMnOpQrSt";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reissuePostInstallLink : un nouveau lien pour un comptoir pas encore installé", () => {
  it("cherche le comptoir dans l'officine de la session, jamais ailleurs", async () => {
    db.counterPost.findFirst.mockResolvedValue({ id: "post_2", label: "Comptoir 2", pairedAt: null });
    db.counterPost.update.mockResolvedValue({});
    await service.reissuePostInstallLink(SCOPE, "post_2");
    expect(db.counterPost.findFirst).toHaveBeenCalledWith({ where: { id: "post_2", pharmacyId: "ph_1", revokedAt: null }, select: { id: true, label: true, pairedAt: true } });
  });

  it("remplace l'empreinte (l'ancien lien cesse de marcher) et rend un nouveau jeton valable sept jours", async () => {
    db.counterPost.findFirst.mockResolvedValue({ id: "post_2", label: "Comptoir 2", pairedAt: null });
    db.counterPost.update.mockResolvedValue({});
    const result = await service.reissuePostInstallLink(SCOPE, "post_2");
    if (!result.ok) throw new Error("attendu");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(7 * 24 * 3600 * 1000);
    const update = db.counterPost.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "post_2" });
    expect(update.data.pairingCodeHash).toBe(sha(result.token));
    // Le jeton n'est écrit nulle part, ni en base ni dans l'audit.
    expect(JSON.stringify(update.data)).not.toContain(result.token);
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toContain(result.token);
  });

  it("un comptoir déjà installé n'en reçoit pas : un second lien en ferait un autre poste", async () => {
    db.counterPost.findFirst.mockResolvedValue({ id: "post_1", label: "Comptoir 1", pairedAt: new Date() });
    const result = await service.reissuePostInstallLink(SCOPE, "post_1");
    expect(result.ok).toBe(false);
    expect(db.counterPost.update).not.toHaveBeenCalled();
  });

  it("le comptoir d'une autre officine (ou retiré) : introuvable, rien n'est écrit", async () => {
    db.counterPost.findFirst.mockResolvedValue(null);
    const result = await service.reissuePostInstallLink(SCOPE, "post_autre");
    expect(result).toEqual({ ok: false, error: "Comptoir introuvable." });
    expect(db.counterPost.update).not.toHaveBeenCalled();
  });
});

describe("findOwnPostInstallLink : un jeton n'est reconnu que pour son officine", () => {
  it("cherche par empreinte, dans l'officine de la session, un lien pas encore utilisé", async () => {
    db.counterPost.findFirst.mockResolvedValue({ label: "Comptoir 2", pairingExpiresAt: new Date(NOW.getTime() + 3600_000), pharmacy: { name: "Pharmacie Test" } });
    const link = await service.findOwnPostInstallLink(SCOPE, TOKEN);
    expect(link).toEqual({ label: "Comptoir 2", expiresAt: new Date(NOW.getTime() + 3600_000), pharmacyName: "Pharmacie Test" });
    expect(db.counterPost.findFirst).toHaveBeenCalledWith({
      where: { pharmacyId: "ph_1", pairingCodeHash: sha(TOKEN), revokedAt: null, pairedAt: null },
      select: { label: true, pairingExpiresAt: true, pharmacy: { select: { name: true } } },
    });
  });

  it("expiré, inconnu ou d'une autre officine : null", async () => {
    db.counterPost.findFirst.mockResolvedValueOnce({ label: "x", pairingExpiresAt: new Date(NOW.getTime() - 1000), pharmacy: { name: "P" } });
    expect(await service.findOwnPostInstallLink(SCOPE, TOKEN)).toBeNull();
    db.counterPost.findFirst.mockResolvedValueOnce(null);
    expect(await service.findOwnPostInstallLink(SCOPE, TOKEN)).toBeNull();
  });

  it("ce qui n'a pas la forme d'un jeton n'atteint même pas la base", async () => {
    expect(await service.findOwnPostInstallLink(SCOPE, "123456")).toBeNull();
    expect(await service.findOwnPostInstallLink(SCOPE, "' OR 1=1 --")).toBeNull();
    expect(db.counterPost.findFirst).not.toHaveBeenCalled();
  });
});
