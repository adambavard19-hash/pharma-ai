import "server-only";
import type { AssistantTurn } from "@/core/admin-assistant/assistant";
import { PHARMACY_TOOL_LABELS, pharmacyDateContext, pharmacySystemPrompt, pharmacyToolsFor } from "@/core/pharmacy-assistant/assistant";
import { runAssistantLoop, type AssistantEvent, type StreamFactory } from "@/server/services/admin-assistant/run";
import { runPharmacyTool, type PharmacyToolContext } from "./tools";

/** Questions pour une seule réponse du robot de l'officine : moins que la console, les questions sont plus simples. */
export const PHARMACY_ASSISTANT_MAX_STEPS = 6;

/**
 * Une question au robot du logiciel officine : même moteur que le robot de la console, avec la consigne de l'officine
 * et les seuls outils que cette personne peut faire lire (filtrés par rôle, toujours dans l'officine active).
 */
export async function runPharmacyAssistant(
  ctx: PharmacyToolContext & { pharmacyName: string; firstName: string; roleLabel: string },
  turns: AssistantTurn[],
  emit: (event: AssistantEvent) => void,
  deps: { stream?: StreamFactory; now?: Date; signal?: AbortSignal } = {},
): Promise<void> {
  return runAssistantLoop(
    {
      systemPrompt: pharmacySystemPrompt({ pharmacyName: ctx.pharmacyName, firstName: ctx.firstName, roleLabel: ctx.roleLabel }),
      dateContext: pharmacyDateContext,
      tools: pharmacyToolsFor(ctx.viewer),
      runTool: (name, input) => runPharmacyTool(ctx, name, input),
      labels: PHARMACY_TOOL_LABELS,
      maxSteps: PHARMACY_ASSISTANT_MAX_STEPS,
    },
    turns,
    emit,
    deps,
  );
}
