import { beforeEach, describe, expect, it, vi } from "vitest";

/** « Ouvrir mon espace PharmaBoost » : seul un poste de caisse authentifié par SA clé obtient un lien, à usage unique. */

const mocks = vi.hoisted(() => ({ authenticateAgent: vi.fn(), issuePostLink: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ authenticateAgent: mocks.authenticateAgent }));
vi.mock("@/server/services/post-link", () => ({ issuePostLink: mocks.issuePostLink }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.audit }));

const route = await import("../route");
const POST_AGENT = { connectionId: null, postId: "post_1", scope: { pharmacyId: "ph_port", organizationId: "org_1", userId: "u_1" }, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null };
const ask = () => route.POST(new Request("http://localhost/api/agent/espace", { method: "POST", headers: { authorization: "Bearer cle-du-poste-0123456789" } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.audit.mockResolvedValue(undefined);
});

describe("POST /api/agent/espace", () => {
  it("poste de caisse : un jeton, le chemin à ouvrir, l'échéance ; rien n'est mis en cache ; la trace est gardée", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.issuePostLink.mockResolvedValue({ token: "T".repeat(43), expiresAt: new Date("2026-10-13T09:10:00Z") });
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, jeton: "T".repeat(43), chemin: "/comptoir/lier", expiresAt: "2026-10-13T09:10:00.000Z" });
    expect(mocks.issuePostLink).toHaveBeenCalledWith("post_1");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.link_issued", entityId: "post_1", pharmacyId: "ph_port" }));
  });

  it("clé inconnue ou révoquée : 401 ; clé du serveur de stock (pas de comptoir) : 403 ; poste retiré : 404 — jamais de jeton", async () => {
    mocks.authenticateAgent.mockResolvedValue(null);
    expect((await ask()).status).toBe(401);
    mocks.authenticateAgent.mockResolvedValue({ ...POST_AGENT, connectionId: "conn_1", postId: null });
    expect((await ask()).status).toBe(403);
    expect(mocks.issuePostLink).not.toHaveBeenCalled();
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.issuePostLink.mockResolvedValue(null);
    const response = await ask();
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("jeton");
  });
});
