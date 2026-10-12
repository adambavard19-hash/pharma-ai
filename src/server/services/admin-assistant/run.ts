import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/config/env";
import { ASSISTANT_MAX_STEPS, ASSISTANT_SYSTEM_PROMPT, ASSISTANT_TOOLS, assistantDateContext, boundedHistory, type AssistantTurn } from "@/core/admin-assistant/assistant";
import { runAssistantTool } from "./tools";

/**
 * Une question au robot de la console : le modèle lit les données avec les
 * outils (lecture seule), autant d'allers-retours que nécessaire (borné), et
 * sa réponse est transmise au fil de l'eau. Les blocs renvoyés par le modèle
 * sont réinjectés tels quels d'un aller-retour à l'autre (jamais modifiés).
 */

export type AssistantEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "text"; delta: string }
  | { type: "done"; steps: number }
  | { type: "error"; message: string };

/** Ce que le robot dit faire pendant qu'il cherche. */
export const TOOL_LABELS: Record<string, string> = {
  vue_d_ensemble: "Je fais le tour du tableau de bord…",
  rechercher: "Je cherche…",
  officines: "Je regarde les officines…",
  fiche_officine: "J'ouvre la fiche de l'officine…",
  demonstrations: "Je regarde les démos…",
  dossiers: "Je regarde le pipeline…",
  facturation: "Je regarde les abonnements et les paiements…",
  equipe_commerciale: "Je regarde l'équipe commerciale…",
  commissions_et_factures: "Je regarde les commissions et les factures…",
  support: "Je regarde le support…",
  conseils_a_valider: "Je regarde ce qui attend Donna…",
  usage: "Je compte l'usage au comptoir…",
  journal: "Je lis le journal…",
  notifications: "Je lis les notifications…",
};

const MAX_TOOL_RESULT_CHARS = 24_000;

export function assistantAvailable(): { ok: true } | { ok: false; reason: string } {
  if (!getEnv().ANTHROPIC_API_KEY) return { ok: false, reason: "Le robot n'a pas de clé Anthropic sur ce serveur (ANTHROPIC_API_KEY)." };
  return { ok: true };
}

type StreamFactory = (params: Anthropic.Beta.Messages.MessageCreateParamsStreaming) => {
  on: (event: "text", listener: (delta: string) => void) => unknown;
  finalMessage: () => Promise<Anthropic.Beta.Messages.BetaMessage>;
};

export async function runAssistant(
  turns: AssistantTurn[],
  emit: (event: AssistantEvent) => void,
  deps: { stream?: StreamFactory; now?: Date; signal?: AbortSignal } = {},
): Promise<void> {
  const env = getEnv();
  const history = boundedHistory(turns);
  if (!history.length || history[history.length - 1].role !== "user") {
    emit({ type: "error", message: "Pose une question." });
    return;
  }
  const client = deps.stream ? null : new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  const stream: StreamFactory = deps.stream ?? ((params) => client!.beta.messages.stream(params, { signal: deps.signal }));

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((turn) => ({ role: turn.role, content: turn.text }));
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: ASSISTANT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: assistantDateContext(deps.now ?? new Date()) },
  ];
  // Les entrées sont relues par chaque outil (bornes, types) : un argument inattendu ne casse rien.
  const tools = ASSISTANT_TOOLS as Anthropic.Beta.Messages.BetaTool[];

  for (let step = 1; step <= ASSISTANT_MAX_STEPS; step++) {
    if (deps.signal?.aborted) return;
    const call = stream({
      model: env.ADMIN_ASSISTANT_MODEL,
      max_tokens: 16_000,
      system,
      tools,
      messages,
      output_config: { effort: env.ADMIN_ASSISTANT_EFFORT },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      stream: true,
    });
    call.on("text", (delta) => emit({ type: "text", delta }));
    const message = await call.finalMessage();

    if (message.stop_reason === "refusal") {
      emit({ type: "text", delta: "\n\nJe ne peux pas répondre à cette demande." });
      emit({ type: "done", steps: step });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (message.stop_reason === "max_tokens") emit({ type: "text", delta: "\n\n(Réponse coupée : pose une question plus précise.)" });
      emit({ type: "done", steps: step });
      return;
    }

    messages.push({ role: "assistant", content: message.content });
    for (const use of toolUses) emit({ type: "tool", name: use.name, label: TOOL_LABELS[use.name] ?? "Je cherche…" });
    // Les outils demandés ensemble s'exécutent ensemble ; tous les résultats repartent dans UN message.
    const results = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> => {
        const { ok, output } = await runAssistantTool(use.name, use.input);
        const text = JSON.stringify(output);
        return { type: "tool_result", tool_use_id: use.id, is_error: !ok, content: text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… (tronqué : demande moins de lignes)` : text };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  emit({ type: "text", delta: "\n\nJ'ai dû m'arrêter : la question demande trop de recherches. Essaie de la découper." });
  emit({ type: "done", steps: ASSISTANT_MAX_STEPS });
}
