import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Télécharger PharmaBoost » : un POST d'une personne connectée à son officine prépare UN comptoir et rend
 * l'installateur, le jeton dans le nom du fichier. Rien n'est préparé si l'installateur n'est pas vérifié.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimited: vi.fn(),
  createLink: vi.fn(),
  listPosts: vi.fn(),
  loadInstaller: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/http/rate-limit", () => ({ rateLimited: mocks.rateLimited }));
vi.mock("@/server/services/stock-sync", () => ({ createPostInstallLink: mocks.createLink, listCounterPosts: mocks.listPosts }));
vi.mock("@/server/services/installer-file", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/installer-file")>("@/server/services/installer-file");
  return { ...actual, loadInstaller: mocks.loadInstaller };
});

const { PERMISSIONS } = await import("@/server/rbac/permissions");
const { POST } = await import("../route");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const SESSION = { scope: SCOPE, permissions: new Set([PERMISSIONS.PRODUCT_IMPORT]) };
const BYTES = new Uint8Array(200_000).fill(7);
const TOKEN = "AbCdEfGhIjKlMnOpQrSt";

const request = (headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/connexion/installateur", { method: "POST", headers: { host: "localhost:3000", ...headers } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.rateLimited.mockReturnValue(false);
  mocks.listPosts.mockResolvedValue([]);
  mocks.createLink.mockResolvedValue({ token: TOKEN, expiresAt: new Date("2026-10-15T00:00:00Z"), postId: "post_1" });
  mocks.loadInstaller.mockResolvedValue({ status: { available: true, bytes: BYTES.length, sha256: "x", version: "1.0.0", agent: "0.5.1", signed: false, builtAt: null }, bytes: BYTES });
});

describe("POST /api/connexion/installateur", () => {
  it("prépare « Comptoir 1 » pour l'officine de la session et rend l'installateur, le jeton dans le nom du fichier", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.createLink).toHaveBeenCalledWith(SCOPE, "Comptoir 1");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="PharmaBoost-Installation-${TOKEN}.exe"`);
    expect((await response.arrayBuffer()).byteLength).toBe(BYTES.length);
  });

  it("nomme le suivant « Comptoir 3 » quand il y en a déjà deux, en ne listant que l'officine de la session", async () => {
    mocks.listPosts.mockResolvedValue([{ label: "Comptoir 1", hostname: "A" }, { label: null, hostname: "CAISSE2" }]);
    await POST(request());
    expect(mocks.listPosts).toHaveBeenCalledWith("ph_1");
    expect(mocks.createLink).toHaveBeenCalledWith(SCOPE, "Comptoir 3");
  });

  it("sans session, ou sans la permission d'importer : 403, rien n'est préparé", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    mocks.getSession.mockResolvedValue({ scope: SCOPE, permissions: new Set() });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("une requête venue d'un autre site est refusée", async () => {
    const response = await POST(request({ origin: "https://autre-site.example" }));
    expect(response.status).toBe(403);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("une requête venue de PharmaBoost même est acceptée", async () => {
    expect((await POST(request({ origin: "http://localhost:3000" }))).status).toBe(200);
  });

  it("trop de téléchargements : 429, rien n'est préparé", async () => {
    mocks.rateLimited.mockReturnValue(true);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("installateur indisponible ou non vérifié : 503, et AUCUN comptoir « en attente » n'est créé", async () => {
    mocks.loadInstaller.mockResolvedValue({ status: { available: false, reason: "empreinte" }, bytes: null });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/pas disponible/);
    expect(mocks.listPosts).not.toHaveBeenCalled();
    expect(mocks.createLink).not.toHaveBeenCalled();
  });
});
