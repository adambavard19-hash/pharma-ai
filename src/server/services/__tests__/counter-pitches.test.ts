import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les questions du comptoir (19 oct. 2026) : corrigées dans la console, elles valent pour toutes les pharmacies et l'IA n'y touche
 * plus ; écrites avec une ancienne consigne, elles restent affichées et sont réécrites en arrière-plan.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    counterPitch: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    product: { findMany: vi.fn(async () => []) },
  },
  write: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ ANTHROPIC_API_KEY: "cle" }) }));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: () => ({ info: { capability: "LIVE", id: "anthropic:claude-test" } }) }));
vi.mock("@/core/ai/providers/anthropic-counter-pitch", () => ({ AnthropicCounterPitchWriter: class { write = mocks.write; } }));

import { checkManualPitch, ensurePitch, PITCH_SOURCE_AI, PITCH_SOURCE_MANUAL, saveManualPitch } from "../counter-pitches";

const TARGET = { ruleKey: "regle", productEan: "8032472034230", productName: "NEOBIANACID CITRON CPR 70", request: { trigger: "GAVISCON", product: { name: "NEOBIANACID CITRON CPR 70" }, candidates: [] } };
const OLD = { ask: ["Q1 ?", "Q2 ?"], pitch: "Ancien.", answers: [], source: "AI" };
const NEW = { pitch: { ask: ["Nouvelle 1 ?", "Nouvelle 2 ?"], pitch: "Nouveau.", answers: [] }, problems: [] };

beforeEach(() => vi.clearAllMocks());

describe("réécriture des questions de l'IA", () => {
  it("une question écrite avec une ancienne consigne est réécrite, sans jamais écraser une correction de la console", async () => {
    mocks.prisma.counterPitch.findUnique.mockResolvedValueOnce(OLD).mockResolvedValueOnce({ ...OLD, ...NEW.pitch, source: PITCH_SOURCE_AI });
    mocks.write.mockResolvedValue(NEW);
    const result = await ensurePitch(TARGET);
    expect(result?.ask).toEqual(["Nouvelle 1 ?", "Nouvelle 2 ?"]);
    expect(mocks.prisma.counterPitch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ source: { not: PITCH_SOURCE_MANUAL } }), data: expect.objectContaining({ source: PITCH_SOURCE_AI }) }));
  });

  it("une correction de la console n'est jamais réécrite par l'IA", async () => {
    mocks.prisma.counterPitch.findUnique.mockResolvedValue({ ...OLD, source: PITCH_SOURCE_MANUAL });
    const result = await ensurePitch(TARGET);
    expect(result?.pitch).toBe("Ancien.");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("si la réécriture échoue, l'ancienne version reste affichée", async () => {
    mocks.prisma.counterPitch.findUnique.mockResolvedValue(OLD);
    mocks.write.mockResolvedValue({ pitch: null, problems: ["réponses incomplètes"] });
    expect((await ensurePitch(TARGET))?.pitch).toBe("Ancien.");
  });
});

describe("correction dans la console", () => {
  const base = { key: "k", ask: ["Les brûlures arrivent après les repas", "Avez-vous du mal à avaler ?"] as [string, string], pitch: "Un comprimé après le repas.", answers: [] };

  it("ajoute le point d'interrogation, garde les réponses complètes, enregistre comme correction", async () => {
    mocks.prisma.counterPitch.updateMany.mockResolvedValue({ count: 1 });
    const answers = [
      { ask: 0 as const, label: "Après les repas", say: "Je vous propose ce produit.", ean: null },
      { ask: 0 as const, label: "La nuit", say: "Au coucher, tête surélevée.", ean: "8032472006916" },
    ];
    expect(await saveManualPitch({ fullName: "Donna Benveniste" }, { ...base, answers })).toEqual({ ok: true });
    const call = mocks.prisma.counterPitch.updateMany.mock.calls[0][0];
    expect(call.data.ask[0]).toBe("Les brûlures arrivent après les repas ?");
    expect(call.data.source).toBe(PITCH_SOURCE_MANUAL);
    expect(call.data.updatedByName).toBe("Donna Benveniste");
  });

  it("refuse une question vide, une réponse à moitié écrite, une seule réponse, un code-barres faux", () => {
    expect(checkManualPitch({ ...base, ask: ["", "Q ?"] }).ok).toBe(false);
    expect(checkManualPitch({ ...base, answers: [{ ask: 0, label: "Oui", say: "", ean: null }] }).ok).toBe(false);
    expect(checkManualPitch({ ...base, answers: [{ ask: 0, label: "Oui", say: "Proposer.", ean: null }] }).ok).toBe(false);
    expect(checkManualPitch({ ...base, answers: [{ ask: 0, label: "Oui", say: "Proposer.", ean: "12" }, { ask: 0, label: "Non", say: "Rien.", ean: null }] }).ok).toBe(false);
    expect(checkManualPitch(base).ok).toBe(true);
  });
});
