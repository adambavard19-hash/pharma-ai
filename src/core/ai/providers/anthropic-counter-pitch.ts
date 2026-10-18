import Anthropic from "@anthropic-ai/sdk";
import { PITCH_SCHEMA, PITCH_SYSTEM_PROMPT, PITCH_TOOL_NAME, buildPitchPrompt, validatePitch, type CounterPitch, type CounterPitchRequest } from "../counter-pitch";
import { supportsLowEffort } from "./anthropic-robot";

/** Les deux questions et le conseil en deux phrases, rédigés par un modèle Anthropic (voir `core/ai/counter-pitch.ts`). Rien du patient. */
export class AnthropicCounterPitchWriter {
  readonly providerId: string;
  private readonly client: Anthropic;

  constructor(private readonly config: { apiKey: string; model: string }) {
    this.providerId = `anthropic:${config.model}`;
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: 25_000, maxRetries: 1 });
  }

  async write(request: CounterPitchRequest): Promise<{ pitch: CounterPitch | null; problems: string[]; usage: { inputTokens: number; outputTokens: number; durationMs: number } }> {
    const startedAt = Date.now();
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 1400,
      system: PITCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPitchPrompt(request) }],
      tools: [{ name: PITCH_TOOL_NAME, description: "Enregistre les deux questions et le conseil en deux phrases.", input_schema: PITCH_SCHEMA as never, strict: true } as never],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      ...(supportsLowEffort(this.config.model) ? { output_config: { effort: "low" } } : {}),
    } as never);
    const usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, durationMs: Date.now() - startedAt };
    const tool = response.content.find((block) => block.type === "tool_use" && block.name === PITCH_TOOL_NAME) as { input?: unknown } | undefined;
    if (!tool) return { pitch: null, problems: ["pas de réponse par l'outil"], usage };
    const { pitch, problems } = validatePitch(tool.input, request.candidates ?? []);
    return { pitch, problems, usage };
  }
}
