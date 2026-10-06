import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'isolement de la session du directeur : une session de commercial, de la
 * console ou d'une officine n'ouvre PAS son espace ; un directeur désactivé, une
 * session révoquée ou expirée non plus. Cookies, base et redirection simulés.
 */

const store = vi.hoisted(() => ({ jar: new Map<string, string>(), set: vi.fn(), delete: vi.fn() }));
const db = vi.hoisted(() => ({
  salesDirectorSession: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  salesDirector: { update: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (store.jar.has(name) ? { name, value: store.jar.get(name) } : undefined), set: store.set, delete: store.delete }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("@/server/db/client", () => ({ prisma: db }));

const session = await import("../director-session");
const { DIRECTOR_SESSION_COOKIE_NAME, SALES_SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } = await import("@/config/constants");

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const future = () => new Date(Date.now() + 3_600_000);
const row = (overrides: Record<string, unknown> = {}, director: Record<string, unknown> = {}) => ({
  id: "ses_1",
  revokedAt: null,
  expiresAt: future(),
  salesDirector: { id: "dir_1", email: "camille@exemple.test", firstName: "Camille", lastName: "Roux", isActive: true, ...director },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  store.jar.clear();
});

describe("qui ouvre l'espace du directeur", () => {
  it("les quatre cookies de session sont distincts", () => {
    const names = [DIRECTOR_SESSION_COOKIE_NAME, SALES_SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME];
    expect(new Set(names).size).toBe(4);
  });

  it("une session de commercial, de la console ou d'une officine n'ouvre rien : le cookie du directeur seul compte", async () => {
    store.jar.set(SALES_SESSION_COOKIE_NAME, "jeton-commercial-valide");
    store.jar.set(PLATFORM_SESSION_COOKIE_NAME, "jeton-console-valide");
    store.jar.set(SESSION_COOKIE_NAME, "jeton-officine-valide");
    expect(await session.getDirectorSession()).toBeNull();
    expect(db.salesDirectorSession.findUnique).not.toHaveBeenCalled();
    await expect(session.requireDirectorSession()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
  });

  it("sans cookie : aucune lecture, redirection vers la connexion du directeur", async () => {
    expect(await session.getDirectorSession()).toBeNull();
    expect(db.salesDirectorSession.findUnique).not.toHaveBeenCalled();
    await expect(session.requireDirectorSession()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
  });

  it("un jeton valide ouvre la session ; la base est interrogée par empreinte, jamais par le jeton", async () => {
    store.jar.set(DIRECTOR_SESSION_COOKIE_NAME, "jeton-du-directeur");
    db.salesDirectorSession.findUnique.mockResolvedValue(row());
    expect(await session.getDirectorSession()).toEqual({
      director: { id: "dir_1", email: "camille@exemple.test", firstName: "Camille", lastName: "Roux", fullName: "Camille Roux", initials: "CR" },
      sessionId: "ses_1",
    });
    expect(db.salesDirectorSession.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256("jeton-du-directeur") }, include: { salesDirector: true } });
    expect(JSON.stringify(db.salesDirectorSession.findUnique.mock.calls)).not.toContain("jeton-du-directeur");
  });

  it("un directeur désactivé n'accède à rien, même avec une session encore valable", async () => {
    store.jar.set(DIRECTOR_SESSION_COOKIE_NAME, "jeton-du-directeur");
    db.salesDirectorSession.findUnique.mockResolvedValue(row({}, { isActive: false }));
    expect(await session.getDirectorSession()).toBeNull();
    await expect(session.requireDirectorSession()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
  });

  it("une session révoquée, expirée ou inconnue n'ouvre rien", async () => {
    store.jar.set(DIRECTOR_SESSION_COOKIE_NAME, "jeton-du-directeur");
    db.salesDirectorSession.findUnique.mockResolvedValueOnce(row({ revokedAt: new Date() }));
    expect(await session.getDirectorSession()).toBeNull();
    db.salesDirectorSession.findUnique.mockResolvedValueOnce(row({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await session.getDirectorSession()).toBeNull();
    db.salesDirectorSession.findUnique.mockResolvedValueOnce(null);
    expect(await session.getDirectorSession()).toBeNull();
  });
});

describe("ouvrir et fermer la session", () => {
  it("ouvre : n'enregistre que l'empreinte du jeton, pose un cookie inaccessible au script, propre au directeur", async () => {
    await session.createDirectorSession({ salesDirectorId: "dir_1", ipAddress: "203.0.113.7" });
    const created = db.salesDirectorSession.create.mock.calls[0][0].data;
    const [name, token, options] = store.set.mock.calls[0];
    expect(name).toBe(DIRECTOR_SESSION_COOKIE_NAME);
    expect(created).toMatchObject({ salesDirectorId: "dir_1", ipAddress: "203.0.113.7", tokenHash: sha256(token) });
    expect(JSON.stringify(created)).not.toContain(token);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(db.salesDirector.update).toHaveBeenCalledWith({ where: { id: "dir_1" }, data: { lastLoginAt: expect.any(Date) } });
  });

  it("ferme : révoque la session du jeton présenté et efface le cookie du directeur seulement", async () => {
    store.jar.set(DIRECTOR_SESSION_COOKIE_NAME, "jeton-du-directeur");
    db.salesDirectorSession.updateMany.mockResolvedValue({ count: 1 });
    await session.destroyDirectorSession();
    expect(db.salesDirectorSession.updateMany).toHaveBeenCalledWith({ where: { tokenHash: sha256("jeton-du-directeur"), revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith(DIRECTOR_SESSION_COOKIE_NAME);
  });
});
