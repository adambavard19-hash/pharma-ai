import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le téléchargement du fichier d'une facture : session du directeur
 * obligatoire, pièce jointe, rien de deviné par le navigateur. Ni base, ni
 * stockage : le service est simulé.
 */

const mocks = vi.hoisted(() => ({ getDirectorSession: vi.fn(), getPlatformSession: vi.fn(), getSalesSession: vi.fn(), readInvoiceFile: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/director-session", () => ({ getDirectorSession: mocks.getDirectorSession }));
// Les sessions des autres espaces existent, mais cette route ne les consulte jamais.
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: mocks.getPlatformSession }));
vi.mock("@/server/auth/sales-session", () => ({ getSalesSession: mocks.getSalesSession }));
vi.mock("@/server/services/sales/director-money", () => ({ readInvoiceFile: mocks.readInvoiceFile }));
vi.mock("@/server/services/sales-applications/admin", () => ({
  // L'en-tête réel est testé avec le service des candidatures ; ici seule sa présence compte.
  attachmentDisposition: (name: string) => `attachment; filename="${name}"`,
}));

const route = await import("../route");

const params = (id = "inv_1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/directeur/factures/inv_1/fichier");
const SESSION = { director: { id: "dir_1", fullName: "Diane Directrice" } };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/directeur/factures/[id]/fichier", () => {
  it("sans session de directeur : 401, rien n'est lu", async () => {
    mocks.getDirectorSession.mockResolvedValue(null);
    const response = await route.GET(request(), params());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.readInvoiceFile).not.toHaveBeenCalled();
  });

  it("une session d'administrateur ou de commercial n'ouvre pas ce fichier", async () => {
    mocks.getDirectorSession.mockResolvedValue(null);
    mocks.getPlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
    mocks.getSalesSession.mockResolvedValue({ rep: { id: "rep_1" } });
    const response = await route.GET(request(), params());
    expect(response.status).toBe(401);
    expect(mocks.getPlatformSession).not.toHaveBeenCalled();
    expect(mocks.getSalesSession).not.toHaveBeenCalled();
    expect(mocks.readInvoiceFile).not.toHaveBeenCalled();
  });

  it("avec une session : le PDF en pièce jointe, sans interprétation du navigateur, pour le directeur de la session", async () => {
    mocks.getDirectorSession.mockResolvedValue(SESSION);
    const bytes = new TextEncoder().encode("%PDF-1.7 contenu");
    mocks.readInvoiceFile.mockResolvedValue({ ok: true, bytes, fileName: "facture-marie.pdf" });

    const response = await route.GET(request(), params());

    expect(response.status).toBe(200);
    expect(mocks.readInvoiceFile).toHaveBeenCalledWith("inv_1", { id: "dir_1", label: "Diane Directrice" });
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="facture-marie.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("un fichier sans la signature d'un PDF n'est jamais présenté comme un PDF", async () => {
    mocks.getDirectorSession.mockResolvedValue(SESSION);
    mocks.readInvoiceFile.mockResolvedValue({ ok: true, bytes: new TextEncoder().encode("<html><script>alert(1)</script>"), fileName: "facture.pdf" });
    const response = await route.GET(request(), params());
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("dit proprement ce qui manque : facture, fichier, stockage", async () => {
    mocks.getDirectorSession.mockResolvedValue(SESSION);
    for (const [reason, status] of [
      ["NOT_FOUND", 404],
      ["NO_FILE", 404],
      ["FILE_MISSING", 404],
      ["STORAGE_UNAVAILABLE", 503],
    ] as const) {
      mocks.readInvoiceFile.mockResolvedValueOnce({ ok: false, reason });
      const response = await route.GET(request(), params());
      expect(response.status).toBe(status);
      expect(typeof (await response.json()).error).toBe("string");
      expect(response.headers.get("Content-Disposition")).toBeNull();
    }
  });
});
