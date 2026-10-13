import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineInput } from "@/core/ai/pipeline";
import type { CatalogProduct, PatientContext } from "@/core/ai/types";

/**
 * La suggestion du robot, de bout en bout côté serveur, avec un modèle SIMULÉ (aucun appel réseau) et une base en mémoire :
 * le cas MAALOX, ce qui part au modèle (rien du patient), l'échec et le délai (la vente part sans), le cache, la sécurité,
 * la démonstration, l'isolation entre officines, la proposition dans la console et le refus mémorisé.
 */

const m = vi.hoisted(() => {
  let seq = 0;
  let clock = 0;
  const tick = () => new Date(1_790_000_000_000 + ++clock);
  const nextId = (prefix: string) => `${prefix}${++seq}`;
  type Row = Record<string, unknown> & { id: string };
  const state = {
    capability: "LIVE",
    pharmacies: new Map<string, { isDemo: boolean }>(),
    suggestions: [] as Row[],
    proposals: [] as Row[],
    usage: [] as Record<string, unknown>[],
    sales: new Map<string, { pharmacyId: string; status: string; runId: string; outcome: string | null; closedAt: Date | null; lines: { id: string; position: number }[] }>(),
    opportunities: [] as Row[],
    recommendations: [] as Row[],
    events: [] as Record<string, unknown>[],
  };
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        const c = condition as { in?: unknown[]; not?: unknown };
        if (c.in) return c.in.includes(row[key]);
        if ("not" in c) return row[key] !== c.not;
      }
      return row[key] === condition;
    });
  const apply = (row: Row, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as object)) row[key] = ((row[key] as number) ?? 0) + (value as { increment: number }).increment;
      else row[key] = value;
    }
    row.updatedAt = tick();
  };
  const pick = (row: Row, select?: Record<string, unknown>) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });
  const proposalOf = (where: Record<string, unknown>) => {
    if (typeof where.id === "string") return state.proposals.find((row) => row.id === where.id);
    const key = where.drugKey_productKey as { drugKey: string; productKey: string };
    return state.proposals.find((row) => row.drugKey === key.drugKey && row.productKey === key.productKey);
  };
  const suggestionOf = (where: Record<string, unknown>) => {
    const key = where.pharmacyId_drugKey as { pharmacyId: string; drugKey: string };
    return state.suggestions.find((row) => row.pharmacyId === key.pharmacyId && row.drugKey === key.drugKey);
  };
  const tx = {
    prescription: {
      findFirst: async ({ where }: { where: { id: string; pharmacyId: string } }) => {
        const sale = state.sales.get(where.id);
        if (!sale || sale.pharmacyId !== where.pharmacyId) return null;
        return {
          status: sale.status,
          isDemo: false,
          counterFollowUp: sale.closedAt ? { closedAt: sale.closedAt } : null,
          analysisRuns: [{ id: sale.runId, outcome: sale.outcome }],
          lines: sale.lines,
          recommendations: state.recommendations.filter((row) => row.prescriptionId === where.id).map((row) => ({ productId: row.productId })),
        };
      },
    },
    adviceOpportunity: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: nextId("opp"), ...data }; state.opportunities.push(row); return { id: row.id }; } },
    recommendation: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: nextId("rec"), ...data }; state.recommendations.push(row); return { id: row.id }; } },
    recommendationEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { state.events.push(data); return data; } },
    analysisRun: { update: async ({ where, data }: { where: { id: string }; data: { outcome: string } }) => { for (const sale of state.sales.values()) if (sale.runId === where.id) sale.outcome = data.outcome; } },
  };
  const prisma = {
    pharmacy: { findUnique: async ({ where }: { where: { id: string } }) => { const found = state.pharmacies.get(where.id); return found ? { isDemo: found.isDemo } : null; } },
    robotRuleProposal: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => state.proposals.filter((row) => matches(row, where)).map((row) => pick(row, select)),
      findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => { const row = proposalOf(where); return row ? pick(row, select) : null; },
      create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        if (proposalOf({ drugKey_productKey: { drugKey: data.drugKey, productKey: data.productKey } })) throw new Error("P2002");
        const row: Row = { id: nextId("prop"), status: "PENDING", occurrences: 1, createdAt: tick(), updatedAt: tick(), ...data };
        state.proposals.push(row);
        return pick(row, select);
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const row = proposalOf(where) as Row; apply(row, data); return { ...row }; },
    },
    robotSuggestion: {
      findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => { const row = suggestionOf(where); return row ? pick(row, select) : null; },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (suggestionOf({ pharmacyId_drugKey: { pharmacyId: data.pharmacyId, drugKey: data.drugKey } })) throw new Error("P2002");
        const row: Row = { id: nextId("sug"), items: null, candidateIds: [], createdAt: tick(), updatedAt: tick(), ...data };
        state.suggestions.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        const row = state.suggestions.find((entry) => entry.id === where.id);
        if (!row || (row.updatedAt as Date).getTime() !== where.updatedAt.getTime()) return { count: 0 };
        apply(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { const row = suggestionOf(where); if (!row) throw new Error("introuvable"); apply(row, data); return { ...row }; },
    },
    aiUsageRecord: { create: async ({ data }: { data: Record<string, unknown> }) => { state.usage.push(data); return data; } },
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };
  const reset = () => {
    state.capability = "LIVE";
    for (const list of [state.suggestions, state.proposals, state.usage, state.opportunities, state.recommendations, state.events]) list.length = 0;
    state.pharmacies.clear();
    state.sales.clear();
  };
  return { state, prisma, reset };
});

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: m.prisma }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ ANTHROPIC_API_KEY: "cle-de-test" }) }));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: () => ({ info: { id: m.state.capability === "LIVE" ? "anthropic:claude-opus-5" : "rule-based", capability: m.state.capability } }) }));

const { withRobotSuggestions, resetRobotInflightForTests } = await import("../robot-suggestions");
const { trustedRobotRuleKeys } = await import("../robot-trust");
const { AnthropicRobotSuggester } = await import("@/core/ai/providers/anthropic-robot");
const { runAnalysisPipeline } = await import("@/core/ai/pipeline");
const { ROBOT_LABEL, robotRuleKey } = await import("@/core/ai/robot-suggestion");
const { drug, officialFacts, patient, product } = await import("@/core/ai/__tests__/fixtures");

const MAALOX = "MAALOX MAUX D'ESTOMAC, suspension buvable en sachet";
const maaloxKnowledge = drug({ id: "maalox", name: "MAALOX", inn: "hydroxyde d'aluminium", atcCode: "A02AD01", therapeuticClass: "Antiacides", commonSideEffects: [], origin: "AI_CLASSIFICATION" });
const maaloxFacts = officialFacts({ cisCode: "60000001", name: MAALOX, substances: ["HYDROXYDE D'ALUMINIUM", "HYDROXYDE DE MAGNÉSIUM"], prescriptionConditions: [] });

const pharmacyStock = (suffix = "", overrides: Partial<CatalogProduct> = {}): CatalogProduct[] => [
  product({ id: `p-probio${suffix}`, name: "LACTIBIANE Référence gélules", brand: "Pileje", category: "PROBIOTIQUES", subCategory: null, description: null, commercialClaims: [], matchingTags: ["probiotique", "flore intestinale"], ean: "3401000000011", stockQuantity: 12, ...overrides }),
  product({ id: `p-tisane${suffix}`, name: "Tisane digestion Bio 20 sachets", brand: "Herbesan", category: "PHYTOTHERAPIE", subCategory: null, description: null, commercialClaims: [], matchingTags: ["digestion"], ean: "3401000000028", stockQuantity: 5 }),
  product({ id: `p-creme${suffix}`, name: "Crème hydratante visage", brand: "Avène", category: "DERMOCOSMETIQUE", subCategory: null, description: null, commercialClaims: [], matchingTags: ["hydratation"], ean: "3401000000073", stockQuantity: 6 }),
];

function maaloxInput(catalog: CatalogProduct[] = pharmacyStock(), who: Partial<PatientContext> = {}): PipelineInput {
  return {
    lines: [{ lineIndex: 1, drugName: MAALOX, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[MAALOX.toLowerCase(), maaloxKnowledge]]),
    official: new Map([[MAALOX.toLowerCase(), maaloxFacts]]),
    patient: patient(who),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
    maxRecommendations: 3,
    stock: { configured: true, referenceCount: catalog.length },
  };
}

/** Le modèle simulé : il lit la liste reçue et choisit le produit nommé, par son identifiant court. */
type Params = { messages: { content: string }[] };
const prompts: string[] = [];
function simulated(pick: (prompt: string) => unknown) {
  return vi.fn(async (params: Params) => {
    prompts.push(params.messages[0].content);
    return { content: [{ type: "tool_use", name: "choisir_produits", input: pick(params.messages[0].content) }], stop_reason: "tool_use", usage: { input_tokens: 1900, output_tokens: 150 } };
  });
}
const idOf = (prompt: string, name: string) => prompt.split("\n").find((line) => line.includes(name))?.split(" · ")[0] ?? "P99";
const choose = (name: string) => (prompt: string) => ({ produits: [{ id: idOf(prompt, name), besoin: "DIGESTIVE_COMFORT", raison: "Accompagne le confort digestif pendant la prise d'un antiacide.", phrase: "Pour votre confort digestif, je peux vous proposer {product}." }] });
const suggesterWith = (create: ReturnType<typeof simulated>) => new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create: create as never });

const scope = (pharmacyId = "ph-a", extra: Record<string, unknown> = {}) => ({ pharmacyId, organizationId: `org-${pharmacyId}`, userId: "u1", ...extra }) as never;

async function analyse(input: PipelineInput, deps: Parameters<typeof withRobotSuggestions>[1], pharmacyId = "ph-a", isDemo = false) {
  return withRobotSuggestions({ scope: scope(pharmacyId), prescriptionId: `vente-${pharmacyId}`, isDemo, input, result: runAnalysisPipeline(input) }, { waitMs: 200, schedule: () => undefined, ...deps });
}

beforeEach(() => {
  m.reset();
  resetRobotInflightForTests();
  prompts.length = 0;
  m.state.pharmacies.set("ph-a", { isDemo: false });
  m.state.pharmacies.set("ph-b", { isDemo: false });
});

describe("MAALOX, sans règle : le robot propose", () => {
  it("le modèle simulé choisit un produit de la liste : la vente part avec la suggestion, marquée « à confirmer »", async () => {
    const create = simulated(choose("LACTIBIANE"));
    const { result } = await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({ productId: "p-probio", patientReason: "", counterScript: "Pour votre confort digestif, je peux vous proposer LACTIBIANE Référence gélules." });
    expect(result.recommendations[0].shortReason).not.toContain(ROBOT_LABEL);
    expect(result.outcome).toBe("PROPOSALS");
  });

  it("la proposition arrive dans la console, la réponse est mise en cache, la consommation est journalisée", async () => {
    await analyse(maaloxInput(), { suggester: suggesterWith(simulated(choose("LACTIBIANE"))) });
    expect(m.state.proposals).toEqual([expect.objectContaining({ drugKey: "atc:A02AD01", productKey: "ean:3401000000011", productName: "LACTIBIANE Référence gélules", need: "DIGESTIVE_COMFORT", status: "PENDING", pharmacyIds: ["ph-a"], atcCode: "A02AD01" })]);
    expect(m.state.suggestions).toEqual([expect.objectContaining({ pharmacyId: "ph-a", drugKey: "atc:A02AD01", status: "READY", items: [expect.objectContaining({ productId: "p-probio", proposalId: m.state.proposals[0].id })] })]);
    expect(m.state.usage).toEqual([expect.objectContaining({ operation: "counter.robot_suggestion", pharmacyId: "ph-a", inputTokens: 1900, outputTokens: 150, succeeded: true, provider: "anthropic:claude-opus-5" })]);
  });

  it("aucune donnée du patient ne part au modèle : seulement le médicament et la liste", async () => {
    const create = simulated(choose("LACTIBIANE"));
    const who: Partial<PatientContext> = { patientId: "patient-secret-42", ageYears: 87, sex: "FEMALE", isPregnant: true, allergies: ["arachide"], chronicConditions: ["insuffisance rénale"], currentTreatments: ["kardegic"] };
    await analyse(maaloxInput(pharmacyStock(), who), { suggester: suggesterWith(create) });
    const sent = JSON.stringify(create.mock.calls[0][0]);
    for (const secret of ["patient-secret-42", "arachide", "rénale", "kardegic", "enceinte", "grossesse", "FEMALE", "87 ans"]) expect(sent).not.toContain(secret);
    expect(sent).not.toMatch(/\b87\b/);
    expect(sent).toContain("MAALOX");
    expect(sent).toContain("LACTIBIANE Référence gélules");
  });

  it("un identifiant hors de la liste est rejeté : rien n'est proposé, la réponse est gardée comme « aucun produit »", async () => {
    const create = simulated(() => ({ produits: [{ id: "P77", besoin: "DIGESTIVE_COMFORT", raison: "Un produit qui n'est pas dans la liste.", phrase: "Je vous propose {product}." }] }));
    const { result } = await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    expect(result.recommendations).toEqual([]);
    expect(m.state.proposals).toEqual([]);
    expect(m.state.suggestions[0]).toMatchObject({ status: "READY", items: [] });
    expect(String(m.state.suggestions[0].error)).toMatch(/hors de la liste/);
  });
});

describe("le comptoir n'attend jamais le robot", () => {
  it("échec du modèle (crédit épuisé) : la vente part sans, et l'on ne redemande pas pendant 30 minutes", async () => {
    const create = vi.fn(async () => {
      throw new Error("Your credit balance is too low");
    });
    const first = await analyse(maaloxInput(), { suggester: suggesterWith(create as never) });
    expect(first.result.recommendations).toEqual([]);
    expect(m.state.suggestions[0]).toMatchObject({ status: "FAILED" });
    expect(m.state.usage).toEqual([expect.objectContaining({ operation: "counter.robot_suggestion", succeeded: false })]);
    const second = await analyse(maaloxInput(), { suggester: suggesterWith(create as never) });
    expect(second.result.recommendations).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("au-delà du délai, la vente part sans ; la suggestion la rejoint dès qu'elle arrive", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pick = choose("LACTIBIANE");
    const create = vi.fn(async (params: Params) => {
      await gate;
      return { content: [{ type: "tool_use", name: "choisir_produits", input: pick(params.messages[0].content) }], stop_reason: "tool_use", usage: { input_tokens: 1900, output_tokens: 150 } };
    });
    m.state.sales.set("vente-ph-a", { pharmacyId: "ph-a", status: "ANALYZED", runId: "run-1", outcome: "NO_RELEVANT_NEED", closedAt: null, lines: [{ id: "ligne-1", position: 1 }] });
    const startedAt = Date.now();
    const hook = await analyse(maaloxInput(), { suggester: suggesterWith(create as never), waitMs: 30 });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(hook.result.recommendations).toEqual([]);
    const task = hook.settle("run-1");
    expect(task).not.toBeNull();
    release();
    await task;
    expect(m.state.recommendations).toEqual([expect.objectContaining({ prescriptionId: "vente-ph-a", productId: "p-probio", origin: "AI", status: "PROPOSED", patientReason: null })]);
    expect(String(m.state.recommendations[0].shortReason)).not.toContain(ROBOT_LABEL);
    expect(m.state.opportunities).toEqual([expect.objectContaining({ analysisRunId: "run-1", ruleKey: robotRuleKey(m.state.proposals[0].id), triggeredLineIds: ["ligne-1"], needKey: "DIGESTIVE_COMFORT" })]);
    expect(m.state.sales.get("vente-ph-a")?.outcome).toBe("PROPOSALS");
  });

  it("…mais pas si la vente a bougé entre-temps (un nouveau bip relance l'analyse, qui s'en charge)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pick = choose("LACTIBIANE");
    const create = vi.fn(async (params: Params) => {
      await gate;
      return { content: [{ type: "tool_use", name: "choisir_produits", input: pick(params.messages[0].content) }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } };
    });
    m.state.sales.set("vente-ph-a", { pharmacyId: "ph-a", status: "ANALYZED", runId: "run-1", outcome: null, closedAt: null, lines: [{ id: "ligne-1", position: 1 }] });
    const hook = await analyse(maaloxInput(), { suggester: suggesterWith(create as never), waitMs: 10 });
    const task = hook.settle("run-1");
    (m.state.sales.get("vente-ph-a") as { status: string }).status = "NEEDS_VERIFICATION";
    release();
    await task;
    expect(m.state.recommendations).toEqual([]);
    // La réponse est quand même gardée : le scan suivant la lira sans rappeler le modèle.
    expect(m.state.suggestions[0]).toMatchObject({ status: "READY" });
  });
});

describe("le cache", () => {
  it("le deuxième scan du même médicament ne rappelle pas le modèle", async () => {
    const create = simulated(choose("LACTIBIANE"));
    await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    const second = await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.result.recommendations.map((item) => item.productId)).toEqual(["p-probio"]);
    expect(m.state.usage).toHaveLength(1);
  });

  it("un stock qui a notablement changé fait redemander", async () => {
    const create = simulated(choose("LACTIBIANE"));
    await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    const bigger = [...pharmacyStock(), ...Array.from({ length: 6 }, (_, index) => product({ id: `p-new${index}`, name: `Probiotique nouveau ${index}`, category: "PROBIOTIQUES", matchingTags: ["probiotique"], ean: `34019999000${index}`, stockQuantity: 3 }))];
    await analyse(maaloxInput(bigger), { suggester: suggesterWith(create) });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("la sécurité et la démonstration", () => {
  it("un produit écarté par la sécurité (allergie du patient) n'est jamais proposé, même choisi par le modèle", async () => {
    const create = simulated(choose("LACTIBIANE"));
    const { result } = await analyse(maaloxInput(pharmacyStock("", { contraindications: ["lactose"] }), { allergies: ["lactose"] }), { suggester: suggesterWith(create) });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.recommendations).toEqual([]);
  });

  it("démonstration commerciale : jamais (vente de démonstration, session de démonstration, officine de démonstration)", async () => {
    const create = simulated(choose("LACTIBIANE"));
    const input = maaloxInput();
    await analyse(input, { suggester: suggesterWith(create) }, "ph-a", true);
    await withRobotSuggestions({ scope: scope("ph-a", { isDemo: true }), prescriptionId: "v", isDemo: false, input, result: runAnalysisPipeline(input) }, { suggester: suggesterWith(create), schedule: () => undefined });
    m.state.pharmacies.set("ph-demo", { isDemo: true });
    await analyse(input, { suggester: suggesterWith(create) }, "ph-demo");
    expect(create).not.toHaveBeenCalled();
    expect(m.state.suggestions).toEqual([]);
  });

  it("fournisseur non configuré ou non autorisé (déterministe) : rien, sans appel", async () => {
    m.state.capability = "SIMULATED";
    const input = maaloxInput();
    const hook = await withRobotSuggestions({ scope: scope(), prescriptionId: "v", isDemo: false, input, result: runAnalysisPipeline(input) }, { schedule: () => undefined });
    expect(hook.result.recommendations).toEqual([]);
    expect(m.state.suggestions).toEqual([]);
  });

  it("stock non configuré : rien", async () => {
    const create = simulated(choose("LACTIBIANE"));
    await analyse({ ...maaloxInput(), stock: { configured: false, referenceCount: 0 } }, { suggester: suggesterWith(create) });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("l'isolation entre officines", () => {
  it("chaque officine a sa liste et son cache : jamais le produit, ni le nom d'un produit, d'une autre", async () => {
    const create = simulated(() => ({ produits: [{ id: "P01", besoin: "DIGESTIVE_COMFORT", raison: "Accompagne le confort digestif pendant la prise d'un antiacide.", phrase: "Je peux vous proposer {product}." }] }));
    const a = await analyse(maaloxInput(pharmacyStock("-a")), { suggester: suggesterWith(create) }, "ph-a");
    const onlyB = [product({ id: "p-sirop-b", name: "Sirop pectoral Officine B", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3401000000999", stockQuantity: 4 })];
    const b = await analyse(maaloxInput(onlyB), { suggester: suggesterWith(create) }, "ph-b");
    expect(create).toHaveBeenCalledTimes(2);
    expect(a.result.recommendations.map((item) => item.productId)).toEqual(["p-probio-a"]);
    expect(b.result.recommendations.map((item) => item.productId)).toEqual(["p-sirop-b"]);
    expect(prompts[1]).not.toContain("LACTIBIANE");
    expect(m.state.suggestions.map((row) => row.pharmacyId).sort()).toEqual(["ph-a", "ph-b"]);
  });

  it("la même proposition dans deux officines (même code-barres) n'en fait qu'une, vue deux fois", async () => {
    const create = simulated(choose("LACTIBIANE"));
    await analyse(maaloxInput(pharmacyStock("-a")), { suggester: suggesterWith(create) }, "ph-a");
    await analyse(maaloxInput(pharmacyStock("-b")), { suggester: suggesterWith(create) }, "ph-b");
    expect(m.state.proposals).toHaveLength(1);
    expect(m.state.proposals[0]).toMatchObject({ occurrences: 2, pharmacyIds: ["ph-a", "ph-b"] });
  });
});

describe("le refus de la pharmacienne de PharmaBoost", () => {
  it("une proposition refusée n'est plus jamais suggérée pour ce médicament, et sa carte se tait au comptoir", async () => {
    const create = simulated(choose("LACTIBIANE"));
    const first = await analyse(maaloxInput(), { suggester: suggesterWith(create) });
    expect(first.result.recommendations).toHaveLength(1);
    const key = robotRuleKey(m.state.proposals[0].id);
    expect(await trustedRobotRuleKeys([key])).toEqual(new Set([key]));

    m.state.proposals[0].status = "REFUSED";
    expect(await trustedRobotRuleKeys([key])).toEqual(new Set());
    const again = await analyse(maaloxInput(), { suggester: suggesterWith(simulated(choose("LACTIBIANE"))) });
    expect(again.result.recommendations.map((item) => item.productId)).not.toContain("p-probio");
    // Le cache ne servait plus (son seul produit a quitté la liste) : le modèle a été réinterrogé sur une liste sans lui.
    expect(prompts.at(-1)).not.toContain("LACTIBIANE");
  });
});

describe("un robot en panne ne casse jamais l'analyse", () => {
  it("une base qui ne connaît pas encore les tables du robot (serveur non relancé) : l'analyse continue, inchangée", async () => {
    const saved = m.prisma.robotRuleProposal;
    (m.prisma as unknown as Record<string, unknown>).robotRuleProposal = undefined;
    try {
      const input = maaloxInput();
      const base = runAnalysisPipeline(input);
      const hook = await withRobotSuggestions({ scope: scope(), prescriptionId: "v", isDemo: false, input, result: base }, { suggester: suggesterWith(simulated(choose("LACTIBIANE"))), schedule: () => undefined });
      expect(hook.result).toBe(base);
      expect(hook.settle("run-1")).toBeNull();
      expect(await trustedRobotRuleKeys([robotRuleKey("x")])).toEqual(new Set());
    } finally {
      m.prisma.robotRuleProposal = saved;
    }
  });
});
