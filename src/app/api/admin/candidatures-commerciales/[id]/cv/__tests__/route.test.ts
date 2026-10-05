import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le téléchargement du CV : session console obligatoire, pièce jointe, rien
 * de deviné par le navigateur. Ni base, ni stockage : le service est simulé.
 */

const mocks = vi.hoisted(() => ({ getPlatformSession: vi.fn(), readSalesApplicationCv: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: mocks.getPlatformSession }));
vi.mock("@/server/services/sales-applications/admin", () => ({
  readSalesApplicationCv: mocks.readSalesApplicationCv,
  // L'en-tête réel est testé avec le service ; ici seule sa présence compte.
  attachmentDisposition: (name: string) => `attachment; filename="${name}"`,
}));

const route = await import("../route");

const params = (id = "app_1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/admin/candidatures-commerciales/app_1/cv");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/admin/candidatures-commerciales/[id]/cv", () => {
  it("sans session console : 401, rien n'est lu", async () => {
    mocks.getPlatformSession.mockResolvedValue(null);
    const response = await route.GET(request(), params());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.readSalesApplicationCv).not.toHaveBeenCalled();
  });

  it("avec une session : le PDF en pièce jointe, sans interprétation du navigateur, avec l'administrateur de la session", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    const bytes = new TextEncoder().encode("%PDF-1.7 contenu");
    mocks.readSalesApplicationCv.mockResolvedValue({ ok: true, bytes, fileName: "cv-marie.pdf" });

    const response = await route.GET(request(), params());

    expect(response.status).toBe(200);
    expect(mocks.readSalesApplicationCv).toHaveBeenCalledWith("app_1", "adm_1");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cv-marie.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("un fichier sans la signature d'un PDF n'est jamais présenté comme un PDF", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    mocks.readSalesApplicationCv.mockResolvedValue({ ok: true, bytes: new TextEncoder().encode("<html><script>alert(1)</script>"), fileName: "cv.pdf" });
    const response = await route.GET(request(), params());
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("dit proprement ce qui manque : candidature, CV, fichier, stockage", async () => {
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    for (const [reason, status] of [
      ["NOT_FOUND", 404],
      ["NO_CV", 404],
      ["FILE_MISSING", 404],
      ["STORAGE_UNAVAILABLE", 503],
    ] as const) {
      mocks.readSalesApplicationCv.mockResolvedValueOnce({ ok: false, reason });
      const response = await route.GET(request(), params());
      expect(response.status).toBe(status);
      expect(typeof (await response.json()).error).toBe("string");
      expect(response.headers.get("Content-Disposition")).toBeNull();
    }
  });
});
