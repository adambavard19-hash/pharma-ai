import Anthropic from "@anthropic-ai/sdk";
import { CARD_SCHEMA, CARD_SYSTEM_PROMPT, CARD_TOOL_NAME, buildCardPrompt, validatePatientCard, type PatientCard, type PatientCardRequest } from "../patient-card";
import { supportsLowEffort } from "./anthropic-robot";

/**
 * La fiche patient d'un produit conseillé, rédigée par un modèle Anthropic (voir `core/ai/patient-card.ts`). Ce qui part : le produit
 * (nom, marque, rayon, mots-clés, description et précautions de la fiche de l'officine) et le médicament qui l'a appelé, avec la
 * raison du conseil. Rien du patient. Ce qui revient passe par le validateur : sinon, pas de fiche.
 */

export type CardMessagesCreate = (params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  tools: unknown[];
  tool_choice: unknown;
  output_config?: { effort: "low" };
}) => Promise<{ content: { type: string; name?: string; input?: unknown }[]; stop_reason?: string | null; usage?: { input_tokens?: number; output_tokens?: number } | null }>;

export type PatientCardResult = { card: PatientCard | null; problems: string[]; providerId: string; usage: { inputTokens: number; outputTokens: number; durationMs: number } };

export const CARD_CALL_TIMEOUT_MS = 25_000;

export class AnthropicPatientCardWriter {
  readonly providerId: string;
  private readonly create: CardMessagesCreate;

  constructor(private readonly config: { apiKey: string; model: string; create?: CardMessagesCreate }) {
    this.providerId = `anthropic:${config.model}`;
    if (config.create) this.create = config.create;
    else {
      const client = new Anthropic({ apiKey: config.apiKey, timeout: CARD_CALL_TIMEOUT_MS, maxRetries: 1 });
      this.create = (params) => client.messages.create(params as never) as never;
    }
  }

  async write(request: PatientCardRequest, forbidden: string[]): Promise<PatientCardResult> {
    const startedAt = Date.now();
    const response = await this.create({
      model: this.config.model,
      max_tokens: 1200,
      system: CARD_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCardPrompt(request) }],
      tools: [{ name: CARD_TOOL_NAME, description: "Enregistre la fiche patient du produit conseillé.", input_schema: CARD_SCHEMA, strict: true }],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      ...(supportsLowEffort(this.config.model) ? { output_config: { effort: "low" as const } } : {}),
    });
    const usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, durationMs: Date.now() - startedAt };
    const tool = response.content.find((block) => block.type === "tool_use" && block.name === CARD_TOOL_NAME);
    if (!tool) return { card: null, problems: [response.stop_reason === "refusal" ? "refus du modèle" : "pas de réponse par l'outil"], providerId: this.providerId, usage };
    const { card, problems } = validatePatientCard(tool.input, { productName: request.product.name, forbidden });
    return { card, problems, providerId: this.providerId, usage };
  }
}
