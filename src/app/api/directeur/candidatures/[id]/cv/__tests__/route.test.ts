import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le téléchargement du CV par le directeur : SA session obligatoire (ni celle
 * d'un administrateur, ni celle d'un commercial), pièce jointe, rien de deviné
 * par le navigateur. Ni base, ni stockage : le service est simulé.
 */

const mocks = vi.hoisted(() => ({ getDirectorSession: vi.fn(), getPlatformSession: vi.fn(), getSalesSession: vi.fn(), readSalesApplicationCv: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/director-session", () => ({ getDirectorSession: mocks.getDirectorSession }));
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: mocks.getPlatformSession }));
vi.mock("@/server/auth/sales-session", () => ({ getSalesSession: mocks.getSalesSession }));
vi.mock("@/server/services/sales-applications/admin", () => ({
  readSalesApplicationCv: mocks.readSalesApplicationCv,
  // L'en-tête réel est testé avec le service ; ici seule sa présence compte.
  attachmentDisposition: (name: string) => `attachment; filename="${name}"`,
}));

const route = await import("../route");

const params = (id = "app_1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/directeur/candidatures/app_1/cv");
const DIRECTOR_SESSION = { director: { id: "dir_1", fullName: "Diane Directrice" }, sessionId: "s_1" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/directeur/candidatures/[id]/cv", () => {
  it("sans session de directeur : 401, rien n'est lu — même avec une session console ou commerciale", async () => {
    mocks.getDirectorSession.mockResolvedValue(null);
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    mocks.getSalesSession.mockResolvedValue({ rep: { id: "rep_1" } });

    const response = await route.GET(request(), params());

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.readSalesApplicationCv).not.toHaveBeenCalled();
    // La route ne consulte que la session du directeur.
    expect(mocks.getPlatformSession).not.toHaveBeenCalled();
    expect(mocks.getSalesSession).not.toHaveBeenCalled();
  });

  it("avec une session : le PDF en pièce jointe, sans interprétation du navigateur, tracé au nom du directeur", async () => {
    mocks.getDirectorSession.mockResolvedValue(DIRECTOR_SESSION);
    const bytes = new TextEncoder().encode("%PDF-1.7 contenu");
    mocks.readSalesApplicationCv.mockResolvedValue({ ok: true, bytes, fileName: "cv-marie.pdf" });

    const response = await route.GET(request(), params());

    expect(response.status).toBe(200);
    expect(mocks.readSalesApplicationCv).toHaveBeenCalledWith("app_1", { type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" });
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cv-marie.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("un fichier sans la signature d'un PDF n'est jamais présenté comme un PDF", async () => {
    mocks.getDirectorSession.mockResolvedValue(DIRECTOR_SESSION);
    mocks.readSalesApplicationCv.mockResolvedValue({ ok: true, bytes: new TextEncoder().encode("<html><script>alert(1)</script>"), fileName: "cv.pdf" });
    const response = await route.GET(request(), params());
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("dit proprement ce qui manque : candidature, CV, fichier, stockage", async () => {
    mocks.getDirectorSession.mockResolvedValue(DIRECTOR_SESSION);
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
