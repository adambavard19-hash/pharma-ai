import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** L'accès direct au compte de démonstration : seulement avec la bonne clé, seulement l'officine de démonstration. */

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), createSession: vi.fn(), recordAudit: vi.fn(), redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/db/client", () => ({ prisma: { membership: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/auth/session", () => ({ createSession: mocks.createSession }));
vi.mock("@/server/http/request-meta", () => ({ getRequestMeta: async () => ({ ipAddress: "1.2.3.4", userAgent: "test" }) }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

const { GET } = await import("../route");
const KEY = "cle-secrete-de-demonstration-123456";
const call = (cle: string) => GET(new Request(`https://pharmaboost.app/acces-demo/${cle}`), { params: Promise.resolve({ cle }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEMO_ACCESS_KEY = KEY;
  mocks.findFirst.mockResolvedValue({ userId: "usr_demo", pharmacyId: "ph_demo" });
});
afterEach(() => {
  delete process.env.DEMO_ACCESS_KEY;
});

describe("accès direct au compte de démonstration", () => {
  it("la bonne clé ouvre la session du compte démo et mène à la démo", async () => {
    await expect(call(KEY)).rejects.toThrow("REDIRECT");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "usr_demo", pharmacyId: "ph_demo" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/demo");
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ user: { email: "demo@pharmaboost.test" }, pharmacy: { slug: "pharmacie-demo-pharmaboost", isDemo: true } });
  });

  it("une mauvaise clé, ou aucune clé configurée, n'ouvre rien", async () => {
    expect((await call("mauvaise-cle-mauvaise-cle-123456")).status).toBe(404);
    process.env.DEMO_ACCESS_KEY = "";
    expect((await call("")).status).toBe(404);
    process.env.DEMO_ACCESS_KEY = "courte";
    expect((await call("courte")).status).toBe(404);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("sans officine de démonstration installée, rien ne s'ouvre", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await call(KEY)).status).toBe(404);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
