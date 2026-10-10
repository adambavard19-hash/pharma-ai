import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ pass: vi.fn(), schedule: vi.fn(), after: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-learning", () => ({ runStockLearningPass: m.pass }));
vi.mock("@/server/services/stock-learning-chain", () => ({ MAX_CHAIN_DEPTH: 10, scheduleLearningContinuation: m.schedule }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: m.after }));

const { GET } = await import("../connaissance-du-stock/route");
const call = (query = "", authorization: string | null = "Bearer secret-test") => GET(new Request(`http://localhost/api/cron/connaissance-du-stock${query}`, { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "secret-test");
  m.pass.mockResolvedValue({ pharmacies: 2, processed: 2, skipped: 0, moreToDo: false });
  m.schedule.mockResolvedValue(true);
  m.after.mockImplementation((work: () => Promise<unknown>) => void work());
});

describe("le passage qui apprend le stock", () => {
  it("refuse sans secret configuré (503), sans bon jeton (401) : rien ne tourne", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "secret-test");
    expect((await call("", "Bearer mauvais")).status).toBe(401);
    expect((await call("", null)).status).toBe(401);
    expect(m.pass).not.toHaveBeenCalled();
  });

  it("fait un passage borné dans le temps, limité à une pharmacie si on le demande", async () => {
    const response = await call("?pharmacie=ph1");
    expect(response.status).toBe(200);
    expect(m.pass).toHaveBeenCalledWith({ deadlineAt: expect.any(Number), pharmacyId: "ph1" });
    const budget = (m.pass.mock.calls[0][0].deadlineAt as number) - Date.now();
    expect(budget).toBeGreaterThan(200_000);
    expect(budget).toBeLessThan(241_000);
    expect(await response.json()).toMatchObject({ pharmacies: 2, processed: 2, moreToDo: false, depth: 0 });
    expect(m.schedule).not.toHaveBeenCalled();
  });

  it("quand il reste du travail, il passe le relais avec un cran de plus", async () => {
    m.pass.mockResolvedValue({ pharmacies: 1, processed: 1, skipped: 0, moreToDo: true });
    await call("?pharmacie=ph1&profondeur=3");
    expect(m.schedule).toHaveBeenCalledWith({ pharmacyId: "ph1", depth: 4 });
  });

  it("ne passe plus le relais au bout de dix passages d'affilée", async () => {
    m.pass.mockResolvedValue({ pharmacies: 1, processed: 1, skipped: 0, moreToDo: true });
    await call("?profondeur=10");
    expect(m.schedule).not.toHaveBeenCalled();
    await call("?profondeur=abc");
    expect(m.schedule).toHaveBeenCalledWith({ pharmacyId: undefined, depth: 1 });
  });
});
