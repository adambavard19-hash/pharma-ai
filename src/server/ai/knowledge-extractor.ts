import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/config/env";
import type { UnderstandingMessagesCreate } from "@/core/ai/providers/anthropic-ai";
import { CHUNK_CHARS, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL_NAME, buildExtractionUserPrompt, chunkText } from "@/core/knowledge/extraction";

/**
 * L'appel au modèle d'Anthropic pour lire un document déposé dans la console. Aucune donnée de patient n'y passe : seulement le
 * texte que la pharmacienne de PharmaBoost a déposé. Le modèle ne fait que PROPOSER ; `validateExtraction` vérifie ensuite chaque
 * proposition contre le document, et la pharmacienne tranche.
 */

export type ExtractionOutcome = { ok: true; items: unknown[]; model: string; parts: number } | { ok: false; error: string };

export async function extractFromDocument(
  input: { title: string; note: string | null; text: string },
  deps: { create?: UnderstandingMessagesCreate; model?: string } = {},
): Promise<ExtractionOutcome> {
  const env = getEnv();
  const model = deps.model ?? env.AI_MODEL;
  let create = deps.create;
  if (!create) {
    if (env.AI_PROVIDER !== "anthropic" || !env.ANTHROPIC_API_KEY) {
      return { ok: false, error: "La lecture des documents n'est pas disponible : le modèle d'Anthropic n'est pas branché sur cet environnement." };
    }
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    create = (params) => client.messages.create(params as never) as never;
  }

  const chunks = chunkText(input.text, CHUNK_CHARS);
  const items: unknown[] = [];
  let failures = 0;
  let lastError = "";
  for (const [index, text] of chunks.entries()) {
    try {
      const response = await create({
        model,
        max_tokens: 6000,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildExtractionUserPrompt({ title: input.title, note: input.note, text, part: index + 1, parts: chunks.length }) }],
        tools: [{ name: EXTRACTION_TOOL_NAME, description: "Enregistre les conseils et associations que le document énonce.", input_schema: EXTRACTION_SCHEMA }],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
      });
      const block = response.content.find((entry) => entry.type === "tool_use" && entry.name === EXTRACTION_TOOL_NAME);
      const found = (block?.input as { items?: unknown } | undefined)?.items;
      if (Array.isArray(found)) items.push(...found);
      else if (response.stop_reason === "refusal") throw new Error("le modèle a refusé de lire ce passage");
    } catch (error) {
      failures += 1;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (failures === chunks.length) return { ok: false, error: `Le modèle n'a pas pu lire le document (${lastError.slice(0, 160)}).` };
  return { ok: true, items, model, parts: chunks.length };
}
