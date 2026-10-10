import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ APP_URL: "https://pharmaboost.app" }) }));

const { MAX_CHAIN_DEPTH, continuationUrl, scheduleLearningContinuation } = await import("../stock-learning-chain");

describe("le relais d'un passage de connaissance du stock", () => {
  const saved = process.env.CRON_SECRET;
  beforeEach(() => { process.env.CRON_SECRET = "secret-test"; });
  afterEach(() => { process.env.CRON_SECRET = saved; vi.useRealTimers(); });

  it("écrit l'adresse du passage suivant, pour une pharmacie ou pour toutes", () => {
    expect(continuationUrl("https://pharmaboost.app", { depth: 2 })).toBe("https://pharmaboost.app/api/cron/connaissance-du-stock?profondeur=2");
    expect(continuationUrl("https://pharmaboost.app/", { pharmacyId: "ph1", depth: 1 })).toBe("https://pharmaboost.app/api/cron/connaissance-du-stock?pharmacie=ph1&profondeur=1");
  });

  it("envoie la demande avec le secret, sans attendre la fin du passage suivant", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const sent = scheduleLearningContinuation({ pharmacyId: "ph1", depth: 1 }, fetchImpl as never);
    await vi.advanceTimersByTimeAsync(2100);
    expect(await sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://pharmaboost.app/api/cron/connaissance-du-stock?pharmacie=ph1&profondeur=1", expect.objectContaining({ headers: { authorization: "Bearer secret-test" } }));
  });

  it("ne relaie jamais au-delà de dix passages, ni sans secret", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    expect(await scheduleLearningContinuation({ depth: MAX_CHAIN_DEPTH + 1 }, fetchImpl as never)).toBe(false);
    delete process.env.CRON_SECRET;
    expect(await scheduleLearningContinuation({ depth: 1 }, fetchImpl as never)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("un échec du relais n'est pas une panne", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("réseau"); });
    expect(await scheduleLearningContinuation({ depth: 1 }, fetchImpl as never)).toBe(true);
  });
});
