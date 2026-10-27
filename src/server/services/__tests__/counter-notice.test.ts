import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La fenêtre du poste lue en base : une association du pharmacien (recommandation « RULE » d'une opportunité
 * « association:… ») garde sa place, même quand les trois conseils du moteur ont de meilleurs scores.
 */

const m = vi.hoisted(() => ({ prescription: { findFirst: vi.fn() }, pharmacy: { findUnique: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { prescription: m.prescription, pharmacy: m.pharmacy } }));
vi.mock("@/server/services/central-advice", () => ({ loadCentralAdvice: async () => ({ removed: [], custom: [] }) }));
vi.mock("@/server/services/challenges", () => ({ activeChallengesFor: async () => new Map() }));
vi.mock("@/server/services/stock-lots", () => ({ nearestShortDatesFor: async () => new Map() }));

const { readCounterNotice } = await import("../counter-notice");
const { ADVICE_RULES } = await import("@/core/ai/engines/advice");

const NOW = new Date("2026-10-12T10:00:00Z");

const rec = (id: string, name: string, totalScore: number, origin: "AI" | "RULE", ruleKey: string) => ({
  id,
  status: "PROPOSED",
  origin,
  productId: `p_${id}`,
  presentationId: null,
  opportunity: { ruleKey, triggeredLineIds: ["l1"] },
  shortReason: `Pourquoi ${name}`,
  justification: "",
  totalScore,
  product: { name, salePriceCents: 790, imageUrl: null, stockItem: { quantity: 5, alertThreshold: 1 } },
  presentation: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.pharmacy.findUnique.mockResolvedValue({ stockSyncedAt: NOW });
});

describe("la fenêtre du poste et les associations du pharmacien", () => {
  it("trois cartes au plus (fondateur, 27 oct. 2026) : les conseils du moteur d'abord, puis les associations", async () => {
    const [k1, k2, k3] = ADVICE_RULES.filter((rule) => !rule.key.startsWith("association:")).map((rule) => rule.key);
    m.prescription.findFirst.mockResolvedValue({
      reference: "ORD-0042",
      status: "ANALYZED",
      counterFollowUp: null,
      lines: [{ id: "l1", drugName: "ROXITHROMYCINE 150 mg, comprimé", drugSpecialtyId: "sp_1" }],
      analysisRuns: [{ outcome: "PROPOSALS", safetyFindings: [], opportunities: [] }],
      questionAnswers: [],
      // L'ordre de la base : le score, du meilleur au moins bon.
      recommendations: [
        rec("e1", "Probiotique", 0.89, "AI", k1),
        rec("e2", "Spray nasal", 0.88, "AI", k2),
        rec("e3", "Pastilles", 0.77, "AI", k3),
        rec("a1", "Brosse à dents", 0.7, "RULE", "association:a1"),
        rec("a2", "Mouchoirs", 0.68, "RULE", "association:a2"),
      ],
    });
    const read = await readCounterNotice("ph_1", "rx_1", NOW);
    expect(read?.notice.items.map((item) => item.name)).toEqual(["Probiotique", "Spray nasal", "Pastilles"]);
    expect(m.prescription.findFirst.mock.calls[0][0].where).toEqual({ id: "rx_1", pharmacyId: "ph_1", source: "COUNTER_SCAN" });
  });
});
