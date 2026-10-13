import Anthropic from "@anthropic-ai/sdk";
import {
  ROBOT_SCHEMA,
  ROBOT_SYSTEM_PROMPT,
  ROBOT_TOOL_NAME,
  buildRobotPrompt,
  validateRobotChoices,
  type RobotCandidate,
  type RobotChoice,
  type RobotDrug,
} from "../robot-suggestion";

/**
 * La suggestion du robot par un modèle Anthropic (voir `core/ai/robot-suggestion.ts`).
 *
 * Ce que l'adaptateur transmet : le médicament (nom, substance, famille) et la liste fermée des produits du stock de
 * l'officine, préparée côté serveur. Rien du patient : la requête ne le reçoit pas. Ce qu'il rend : les choix déjà
 * passés au validateur du domaine (identifiant hors liste, besoin inconnu, texte vide, trop long, chiffré ou prometteur :
 * rejetés). Ce n'est pas lui qui décide d'un conseil : le moteur fait passer chaque choix par tous ses garde-fous.
 *
 * Le choix d'outil reste « auto » (une consigne demande l'outil) : les modèles récents refusent l'outil imposé, et une
 * réponse sans outil est traitée comme un échec, jamais comme « aucun produit ».
 */

export type RobotSuggestionRequest = { drug: RobotDrug; candidates: RobotCandidate[] };

export type RobotSuggestionResponse = {
  /** Le modèle a répondu par l'outil. Faux (refus, texte libre, réponse tronquée) : un échec, pas « aucun produit ». */
  answered: boolean;
  choices: RobotChoice[];
  warnings: string[];
  providerId: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; durationMs: number };
};

export interface RobotSuggester {
  readonly providerId: string;
  readonly model: string;
  suggest(request: RobotSuggestionRequest): Promise<RobotSuggestionResponse>;
}

/** Injectable pour les tests : aucun test n'appelle le réseau. */
export type RobotMessagesCreate = (params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
  tools: unknown[];
  tool_choice: unknown;
  output_config?: { effort: "low" };
}) => Promise<{
  content: { type: string; name?: string; input?: unknown }[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}>;

/** L'appel continue en arrière-plan après l'attente du comptoir (1,5 s) ; au-delà de ce délai, il est abandonné. */
export const ROBOT_CALL_TIMEOUT_MS = 30_000;

/** Les modèles qui acceptent un effort réduit (moins de réflexion : plus rapide, moins cher, assez pour choisir dans une liste). */
export function supportsLowEffort(model: string): boolean {
  return /^claude-(?:opus-(?:4-[5-9]|5)|sonnet-(?:4-6|5)|fable-5|mythos-5|haiku-5)/.test(model);
}

export class AnthropicRobotSuggester implements RobotSuggester {
  readonly providerId: string;
  readonly model: string;
  private readonly create: RobotMessagesCreate;

  constructor(config: { apiKey: string; model: string; create?: RobotMessagesCreate }) {
    this.model = config.model;
    this.providerId = `anthropic:${config.model}`;
    if (config.create) {
      this.create = config.create;
    } else {
      const client = new Anthropic({ apiKey: config.apiKey, timeout: ROBOT_CALL_TIMEOUT_MS, maxRetries: 1 });
      this.create = (params) => client.messages.create(params as never) as never;
    }
  }

  async suggest(request: RobotSuggestionRequest): Promise<RobotSuggestionResponse> {
    const base = { providerId: this.providerId, model: this.model };
    if (request.candidates.length === 0) return { ...base, answered: true, choices: [], warnings: [], usage: { inputTokens: 0, outputTokens: 0, durationMs: 0 } };

    const startedAt = Date.now();
    const response = await this.create({
      model: this.model,
      max_tokens: 2048,
      system: ROBOT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildRobotPrompt(request.drug, request.candidates) }],
      tools: [
        {
          name: ROBOT_TOOL_NAME,
          description: "Enregistre les produits choisis dans la liste (de 0 à 2), avec le besoin, la raison pour le pharmacien et la phrase de comptoir.",
          input_schema: ROBOT_SCHEMA,
          strict: true,
        },
      ],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      ...(supportsLowEffort(this.model) ? { output_config: { effort: "low" as const } } : {}),
    });

    const usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0, durationMs: Date.now() - startedAt };
    const toolBlock = response.content.find((block) => block.type === "tool_use" && block.name === ROBOT_TOOL_NAME);
    if (!toolBlock || typeof toolBlock.input !== "object" || toolBlock.input === null) {
      const why = response.stop_reason === "refusal" ? "Le modèle a refusé de répondre." : response.stop_reason === "max_tokens" ? "Réponse tronquée." : "Le modèle n'a pas renseigné l'outil.";
      return { ...base, answered: false, choices: [], warnings: [why], usage };
    }
    const { choices, warnings } = validateRobotChoices(toolBlock.input, request.candidates);
    return { ...base, answered: true, choices, warnings, usage };
  }
}
