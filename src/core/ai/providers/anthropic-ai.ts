import Anthropic from "@anthropic-ai/sdk";
import {
  UNDERSTANDING_SCHEMA,
  UNDERSTANDING_SYSTEM_PROMPT,
  UNDERSTANDING_TOOL_NAME,
  buildUnderstandingUserPrompt,
  validateClassification,
  type ClaimedClassification,
  type ClassificationRequest,
  type ClassificationResult,
} from "../../understanding";
import type {
  AIProvider,
  ExplanationRequest,
  PatientReasonRequest,
  ProviderInfo,
} from "../ports";
import type { TreatmentExplanationResult } from "../types";
import { RuleBasedAIProvider } from "./rule-based-ai";

/**
 * La classification des médicaments par un modèle Anthropic.
 *
 * Ce que cet adaptateur fait : il transmet les noms de médicaments et ce que
 * le catalogue national en publie, impose un schéma strict, et passe la
 * réponse au validateur du domaine. Ce qu'il ne fait pas : décider d'un
 * conseil. Le contexte et les besoins sont dérivés localement ; le produit
 * vient du stock ; la phrase vient de la règle.
 *
 * L'appel est court par construction — quelques dizaines de jetons par ligne —
 * et son résultat est mis en cache par médicament : au comptoir, un médicament
 * déjà vu ne repasse jamais par le modèle.
 *
 * Les deux autres opérations du port restent déterministes : un fait médical
 * destiné au patient ne vient jamais d'un modèle génératif.
 */

/** Injectable pour les tests : aucun test n'appelle le réseau. */
export type UnderstandingMessagesCreate = (params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: unknown[];
  tools: unknown[];
  tool_choice: unknown;
}) => Promise<{
  content: { type: string; name?: string; input?: unknown }[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}>;

export class AnthropicAIProvider implements AIProvider {
  readonly info: ProviderInfo;
  private readonly create: UnderstandingMessagesCreate;
  private readonly deterministic = new RuleBasedAIProvider();

  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      create?: UnderstandingMessagesCreate;
    },
  ) {
    this.info = {
      id: `anthropic:${config.model}`,
      label: "Classification des médicaments (Anthropic)",
      capability: "LIVE",
      description:
        "Classe chaque médicament prescrit (substance, code ATC, classe), une seule fois puis en cache. Le contexte, les besoins, le produit et la phrase de comptoir viennent de règles écrites et du stock, jamais du modèle.",
    };

    if (config.create) {
      this.create = config.create;
    } else {
      const client = new Anthropic({ apiKey: config.apiKey });
      this.create = (params) => client.messages.create(params as never) as never;
    }
  }

  explainTreatment(request: ExplanationRequest): Promise<TreatmentExplanationResult> {
    return this.deterministic.explainTreatment(request);
  }

  writePatientReason(request: PatientReasonRequest): Promise<string> {
    return this.deterministic.writePatientReason(request);
  }

  async classifyDrugs(request: ClassificationRequest): Promise<ClassificationResult | null> {
    if (request.lines.length === 0) return null;

    const startedAt = Date.now();
    const response = await this.create({
      model: this.config.model,
      max_tokens: 60 * request.lines.length + 200,
      system: UNDERSTANDING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUnderstandingUserPrompt(request) }],
      tools: [
        {
          name: UNDERSTANDING_TOOL_NAME,
          description: "Enregistre la classification de chaque médicament.",
          input_schema: UNDERSTANDING_SCHEMA,
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: UNDERSTANDING_TOOL_NAME },
    });

    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    };

    const toolBlock = response.content.find(
      (block) => block.type === "tool_use" && block.name === UNDERSTANDING_TOOL_NAME,
    );

    if (!toolBlock || typeof toolBlock.input !== "object" || toolBlock.input === null) {
      return {
        drugs: [],
        providerId: this.info.id,
        model: this.config.model,
        warnings: [
          response.stop_reason === "refusal"
            ? "Le modèle a refusé de répondre : aucune classification produite."
            : "Le modèle n'a pas renseigné l'outil : aucune classification produite.",
        ],
        usage,
      };
    }

    const { result } = validateClassification(toolBlock.input as ClaimedClassification, {
      lineCount: Math.max(...request.lines.map((line) => line.lineIndex)) + 1,
      providerId: this.info.id,
      model: this.config.model,
    });

    return { ...result, usage };
  }
}
