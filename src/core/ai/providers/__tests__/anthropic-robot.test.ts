import { describe, expect, it, vi } from "vitest";
import { AnthropicRobotSuggester, supportsLowEffort, type RobotMessagesCreate } from "../anthropic-robot";
import { ROBOT_SCHEMA, ROBOT_TOOL_NAME, type RobotCandidate, type RobotDrug } from "../../robot-suggestion";

/** L'adaptateur Anthropic de la suggestion du robot, avec un fournisseur simulé : aucun appel réseau. */

const drug: RobotDrug = { lineIndex: 1, drugName: "MAALOX MAUX D'ESTOMAC, suspension buvable en sachet", drugKey: "atc:A02AD01", atcCode: "A02AD01", therapeuticClass: "Antiacides", substances: ["HYDROXYDE D'ALUMINIUM"] };
const candidates: RobotCandidate[] = [
  { shortId: "P01", productId: "p-probio", productKey: "ean:3401000000011", name: "LACTIBIANE Référence gélules", brand: "Pileje", ean: "3401000000011", category: "PROBIOTIQUES", tags: ["probiotique"] },
  { shortId: "P02", productId: "p-tisane", productKey: "ean:3401000000028", name: "Tisane digestion", brand: null, ean: "3401000000028", category: "PHYTOTHERAPIE", tags: ["digestion"] },
];
const answer = (input: unknown) => ({ content: [{ type: "tool_use", name: ROBOT_TOOL_NAME, input }], stop_reason: "tool_use", usage: { input_tokens: 1800, output_tokens: 140 } });

describe("l'appel au modèle", () => {
  it("outil à schéma strict, choix d'outil « auto », effort réduit ; le texte ne porte que le médicament et la liste", async () => {
    const create = vi.fn<RobotMessagesCreate>(async () => answer({ produits: [] }));
    await new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create }).suggest({ drug, candidates });
    const params = create.mock.calls[0][0];
    expect(params.tools).toEqual([expect.objectContaining({ name: ROBOT_TOOL_NAME, input_schema: ROBOT_SCHEMA, strict: true })]);
    expect(params.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.messages[0].content).toContain("MAALOX");
    expect(params.messages[0].content).toContain("P02 · Tisane digestion");
  });

  it("l'effort réduit n'est envoyé qu'aux modèles qui l'acceptent", () => {
    expect(supportsLowEffort("claude-opus-5")).toBe(true);
    expect(supportsLowEffort("claude-opus-5-5")).toBe(true);
    expect(supportsLowEffort("claude-haiku-4-5")).toBe(false);
  });

  it("une liste vide ne coûte rien : aucun appel", async () => {
    const create = vi.fn<RobotMessagesCreate>();
    const response = await new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create }).suggest({ drug, candidates: [] });
    expect(create).not.toHaveBeenCalled();
    expect(response).toMatchObject({ answered: true, choices: [] });
  });
});

describe("la réponse", () => {
  it("les choix validés et la consommation", async () => {
    const create = vi.fn<RobotMessagesCreate>(async () => answer({ produits: [{ id: "P01", besoin: "DIGESTIVE_COMFORT", raison: "Accompagne le confort digestif avec un antiacide.", phrase: "Je peux vous proposer {product} pour votre confort digestif." }, { id: "P42", besoin: "DIGESTIVE_COMFORT", raison: "Hors de la liste, inventé par le modèle.", phrase: "Je vous propose {product}." }] }));
    const response = await new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create }).suggest({ drug, candidates });
    expect(response.answered).toBe(true);
    expect(response.choices).toEqual([{ shortId: "P01", need: "DIGESTIVE_COMFORT", reason: "Accompagne le confort digestif avec un antiacide.", counterScript: "Je peux vous proposer {product} pour votre confort digestif." }]);
    expect(response.warnings.join(" ")).toMatch(/P42.*hors de la liste/);
    expect(response.usage).toMatchObject({ inputTokens: 1800, outputTokens: 140 });
    expect(response.providerId).toBe("anthropic:claude-opus-5");
  });

  it("sans outil (texte libre, refus) : un échec, jamais « aucun produit »", async () => {
    const text = vi.fn<RobotMessagesCreate>(async () => ({ content: [{ type: "text" }], stop_reason: "end_turn", usage: null }));
    expect(await new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create: text }).suggest({ drug, candidates })).toMatchObject({ answered: false });
    const refusal = vi.fn<RobotMessagesCreate>(async () => ({ content: [], stop_reason: "refusal", usage: null }));
    const refused = await new AnthropicRobotSuggester({ apiKey: "test", model: "claude-opus-5", create: refusal }).suggest({ drug, candidates });
    expect(refused).toMatchObject({ answered: false, warnings: ["Le modèle a refusé de répondre."] });
  });
});
