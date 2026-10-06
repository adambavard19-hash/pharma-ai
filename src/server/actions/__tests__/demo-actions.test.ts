import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Simuler une délivrance » et « Réinitialiser la démo » n'existent que dans l'officine de
 * démonstration commerciale. Toute autre session reçoit un refus avant la moindre lecture.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  simulateScan: vi.fn(),
  installDemoPharmacy: vi.fn(),
  recordAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/demo/simulate", () => ({ simulateScan: mocks.simulateScan }));
vi.mock("@/server/services/demo/provision", () => ({ installDemoPharmacy: mocks.installDemoPharmacy }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

const { simulateDeliveryStepAction, resetDemoAction } = await import("../demo");

const session = (overrides: { slug?: string; isDemo?: boolean } = {}) => ({
  pharmacy: { slug: overrides.slug ?? "pharmacie-demo-pharmaboost", isDemo: overrides.isDemo ?? true },
  scope: { pharmacyId: "ph_demo", organizationId: "org_demo", userId: "usr_1", isDemo: overrides.isDemo ?? true },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(session());
  mocks.simulateScan.mockResolvedValue({ ok: true, prescriptionId: "rx_1", drugName: "DOLIPRANE", step: 0, total: 2, done: false });
  mocks.installDemoPharmacy.mockResolvedValue({ counts: { sales: 390, recommendations: 1100 } });
});

describe("simuler une délivrance", () => {
  it("joue un bip du scénario avec l'officine DE LA SESSION, jamais celle d'un formulaire", async () => {
    const result = await simulateDeliveryStepAction({ scenarioId: "angine", step: 0 });
    expect(result).toMatchObject({ ok: true, data: { prescriptionId: "rx_1", total: 2, done: false } });
    expect(mocks.simulateScan).toHaveBeenCalledWith({ scope: session().scope, scenarioId: "angine", step: 0 });
  });

  it("n'écrit la trace qu'une fois par délivrance (au premier bip)", async () => {
    await simulateDeliveryStepAction({ scenarioId: "angine", step: 0 });
    await simulateDeliveryStepAction({ scenarioId: "angine", step: 1 });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "demo.delivery_simulated", pharmacyId: "ph_demo", metadata: { scenario: "angine" } });
  });

  it("refuse toute autre officine, même marquée démonstration, avant tout bip", async () => {
    for (const other of [session({ isDemo: false }), session({ slug: "pharmacie-saint-michel" }), session({ slug: "pharmacie-saint-michel", isDemo: false })]) {
      mocks.requirePermission.mockResolvedValue(other);
      expect(await simulateDeliveryStepAction({ scenarioId: "angine", step: 0 })).toEqual({ ok: false, error: "Ce geste n'existe que dans l'officine de démonstration." });
    }
    expect(mocks.simulateScan).not.toHaveBeenCalled();
  });

  it("refuse un scénario inconnu ou une étape absurde sans rien jouer", async () => {
    expect(await simulateDeliveryStepAction({ scenarioId: "nope", step: 0 })).toMatchObject({ ok: false });
    expect(await simulateDeliveryStepAction({ scenarioId: "angine", step: -3 })).toMatchObject({ ok: false });
    expect(await simulateDeliveryStepAction({ scenarioId: "angine", step: 999 })).toMatchObject({ ok: false });
    expect(mocks.simulateScan).not.toHaveBeenCalled();
  });

  it("transmet l'échec d'un bip tel quel", async () => {
    mocks.simulateScan.mockResolvedValue({ ok: false, error: "Étape inconnue." });
    expect(await simulateDeliveryStepAction({ scenarioId: "angine", step: 0 })).toEqual({ ok: false, error: "Étape inconnue." });
  });
});

describe("réinitialiser la démo", () => {
  it("remet l'officine de la session à l'état initial, laisse les mots de passe, et le trace", async () => {
    const result = await resetDemoAction();
    expect(result).toMatchObject({ ok: true, data: { sales: 390 } });
    expect(mocks.installDemoPharmacy).toHaveBeenCalledWith({});
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ action: "demo.reset", pharmacyId: "ph_demo" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuse toute autre officine : une vraie officine ne peut jamais déclencher la réinitialisation", async () => {
    mocks.requirePermission.mockResolvedValue(session({ slug: "pharmacie-du-port", isDemo: false }));
    expect(await resetDemoAction()).toEqual({ ok: false, error: "Ce geste n'existe que dans l'officine de démonstration." });
    expect(mocks.installDemoPharmacy).not.toHaveBeenCalled();
  });

  it("une panne se dit simplement, sans fuite technique", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.installDemoPharmacy.mockRejectedValue(new Error("connexion perdue à postgres://secret"));
    const result = await resetDemoAction();
    expect(result).toEqual({ ok: false, error: "La réinitialisation n'a pas abouti. Réessayez dans un instant." });
    expect(JSON.stringify(result)).not.toContain("postgres");
  });
});
