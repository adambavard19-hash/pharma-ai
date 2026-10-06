import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordCounterScan: vi.fn(),
  closeLiveCounterSales: vi.fn(),
  resolveDemoDrugsByKey: vi.fn(),
  counterPost: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { counterPost: mocks.counterPost } }));
vi.mock("@/server/services/counter-scan", () => ({ recordCounterScan: mocks.recordCounterScan, closeLiveCounterSales: mocks.closeLiveCounterSales }));
vi.mock("../resolve", () => ({ resolveDemoDrugsByKey: mocks.resolveDemoDrugsByKey }));

const { simulateScan, codesForScenario } = await import("../simulate");
const { findDemoScenario } = await import("@/core/demo/scenarios");

const scope = { pharmacyId: "ph_demo", organizationId: "org_demo", userId: "usr_1", isDemo: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.counterPost.findFirst.mockResolvedValue({ id: "post_1" });
  mocks.resolveDemoDrugsByKey.mockResolvedValue(
    new Map([
      ["augmentin-adulte", { cip13: "3400935337023", name: "AUGMENTIN 500 mg" }],
      ["doliprane-1000", { cip13: "3400935955838", name: "DOLIPRANE 1000 mg" }],
    ]),
  );
  mocks.recordCounterScan.mockImplementation(async (_agent: unknown, input: { code: string }) => ({ ok: true, prescriptionId: "rx_1", reference: "ORD-1", lineCount: 1, drugName: `boîte ${input.code}`, created: true, kind: "DRUG" }));
});

describe("les bips d'un scénario", () => {
  it("passent par le service de la douchette, au nom du poste de démonstration et de l'officine de démonstration", async () => {
    const result = await simulateScan({ scope, scenarioId: "angine", step: 0 });
    expect(result).toEqual({ ok: true, prescriptionId: "rx_1", drugName: "boîte 3400935337023", step: 0, total: 2, done: false });
    const [agent, input] = mocks.recordCounterScan.mock.calls[0];
    expect(agent).toMatchObject({ postId: "post_1", pharmacyIsDemo: true, scope, connectionId: null });
    expect(input).toMatchObject({ code: "3400935337023", post: "poste-demo" });
    expect(input.scannedAt).toBeInstanceOf(Date);
  });

  it("le dernier bip le dit, et chaque bip suit l'ordre du scénario", async () => {
    mocks.recordCounterScan.mockClear();
    const second = await simulateScan({ scope, scenarioId: "angine", step: 1 });
    expect(second).toMatchObject({ ok: true, step: 1, done: true });
    expect(mocks.recordCounterScan.mock.calls[0][1].code).toBe("3400935955838");
  });

  it("le premier bip vide le comptoir, comme « Nouveau patient » : la délivrance précédente ne reprend pas ces boîtes", async () => {
    await simulateScan({ scope, scenarioId: "angine", step: 0 });
    expect(mocks.closeLiveCounterSales).toHaveBeenCalledWith(scope);
    expect(mocks.counterPost.update).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastScanAt: null } });
  });

  it("les bips suivants ne vident rien : ils complètent la même délivrance", async () => {
    await simulateScan({ scope, scenarioId: "angine", step: 1 });
    expect(mocks.closeLiveCounterSales).not.toHaveBeenCalled();
    expect(mocks.counterPost.update).not.toHaveBeenCalled();
  });

  it("un scénario inconnu, une étape hors limites ou une demande sans ordonnance ne bippent rien", async () => {
    expect(await simulateScan({ scope, scenarioId: "nope", step: 0 })).toEqual({ ok: false, error: "Scénario inconnu." });
    expect(await simulateScan({ scope, scenarioId: "sans-ordonnance-gorge", step: 0 })).toEqual({ ok: false, error: "Scénario inconnu." });
    expect(await simulateScan({ scope, scenarioId: "angine", step: 2 })).toEqual({ ok: false, error: "Étape inconnue." });
    expect(await simulateScan({ scope, scenarioId: "angine", step: -1 })).toEqual({ ok: false, error: "Étape inconnue." });
    expect(mocks.recordCounterScan).not.toHaveBeenCalled();
  });

  it("dit clairement quand le catalogue national n'est pas chargé, sans rien bipper", async () => {
    mocks.resolveDemoDrugsByKey.mockResolvedValue(new Map());
    const result = await simulateScan({ scope, scenarioId: "angine", step: 0 });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("catalogue national") });
    expect(mocks.recordCounterScan).not.toHaveBeenCalled();
  });

  it("dit quand le poste de démonstration manque (il faut réinitialiser la démo)", async () => {
    mocks.counterPost.findFirst.mockResolvedValue(null);
    expect(await simulateScan({ scope, scenarioId: "angine", step: 0 })).toMatchObject({ ok: false, error: expect.stringContaining("réinitialisez la démo") });
  });

  it("transmet le refus d'un bip (code inconnu) au lieu de le taire", async () => {
    mocks.recordCounterScan.mockResolvedValue({ ok: false, code: "UNKNOWN_CODE", error: "Ce code ne ressemble pas à un code-barres de produit." });
    expect(await simulateScan({ scope, scenarioId: "angine", step: 0 })).toEqual({ ok: false, error: "Ce code ne ressemble pas à un code-barres de produit." });
  });
});

describe("les codes d'un scénario", () => {
  it("une boîte de parapharmacie se bippe par son code-barres, les quantités se répètent", async () => {
    const scenario = { ...(findDemoScenario("angine") as NonNullable<ReturnType<typeof findDemoScenario>>), items: [{ product: "serum-physiologique", quantity: 2 }, { drug: "doliprane-1000" }] };
    const codes = await codesForScenario(scenario);
    expect(codes).toEqual({ ok: true, codes: ["3400900000906", "3400900000906", "3400935955838"] });
  });
});
