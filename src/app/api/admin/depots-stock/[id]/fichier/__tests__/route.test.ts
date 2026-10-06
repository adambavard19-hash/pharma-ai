import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le téléchargement du fichier de stock d'un dépôt : session console
 * obligatoire, pièce jointe, rien de deviné par le navigateur. Ni base ni
 * stockage : le service est simulé.
 */

const mocks = vi.hoisted(() => ({ getPlatformSession: vi.fn(), getDepositFile: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: mocks.getPlatformSession }));
vi.mock("@/server/services/stock-deposits", () => ({ getDepositFile: mocks.getDepositFile }));
vi.mock("@/server/services/sales-applications/admin", () => ({
  // L'en-tête réel est testé avec son service ; ici seule sa présence compte.
  attachmentDisposition: (name: string) => `attachment; filename="${name}"`,
}));

const route = await import("../route");

const params = (id = "dep_1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/admin/depots-stock/dep_1/fichier");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/admin/depots-stock/[id]/fichier", () => {
  it("sans session console : 401, rien n'est lu", async () => {
    mocks.getPlatformSession.mockResolvedValue(null);
    const response = await route.GET(request(), params());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getDepositFile).not.toHaveBeenCalled();
  });

  it("avec une session : le fichier en pièce jointe, sans interprétation du navigateur", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    const bytes = new TextEncoder().encode("cip;quantite\n3400930000001;4\n");
    mocks.getDepositFile.mockResolvedValue({ ok: true, bytes, fileName: "stock du jour.csv" });

    const response = await route.GET(request(), params());

    expect(response.status).toBe(200);
    // Le téléchargement est tracé par le service au nom de l'administrateur de la session.
    expect(mocks.getDepositFile).toHaveBeenCalledWith("dep_1", "adm_1");
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="stock du jour.csv"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("un fichier qui ressemble à du HTML n'est jamais présenté comme tel", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    mocks.getDepositFile.mockResolvedValue({ ok: true, bytes: new TextEncoder().encode("<html><script>alert(1)</script>"), fileName: "stock.txt" });
    const response = await route.GET(request(), params());
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("dit proprement ce qui manque : dépôt, fichier purgé, fichier perdu, stockage", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    for (const [reason, status] of [
      ["NOT_FOUND", 404],
      ["NO_FILE", 404],
      ["FILE_MISSING", 404],
      ["STORAGE_UNAVAILABLE", 503],
    ] as const) {
      mocks.getDepositFile.mockResolvedValueOnce({ ok: false, reason });
      const response = await route.GET(request(), params());
      expect(response.status, reason).toBe(status);
      expect(typeof (await response.json()).error).toBe("string");
      expect(response.headers.get("Content-Disposition")).toBeNull();
    }
  });
});
