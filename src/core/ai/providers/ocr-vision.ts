import Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_TOOL_NAME,
  EXTRACTION_USER_PROMPT,
  validateVisionExtraction,
  type ClaimedPrescription,
  type RejectedField,
} from "../../extraction";
import type { OcrInput, OCRProvider, ProviderInfo } from "../ports";
import type { ExtractedPrescription } from "../types";

/**
 * Lecture réelle d'une ordonnance photographiée, par un modèle de vision.
 *
 * Ce que cet adaptateur fait : il transporte l'image, impose un schéma strict,
 * et passe la réponse au validateur du domaine. Ce qu'il ne fait pas : décider
 * de ce qui est retenu. Cette décision vit dans `src/core/extraction/`, où elle
 * est testable sans réseau — une garantie de sécurité qui ne serait vérifiable
 * qu'en appelant une API n'en serait pas une.
 *
 * ⚠️ Une ordonnance photographiée est une donnée de santé. Activer cet
 * adaptateur envoie cette image à un tiers. Le registre exige donc une
 * autorisation explicite, distincte du simple choix du fournisseur : voir
 * `OCR_SEND_IMAGES_EXTERNALLY` dans `.env.example` et docs/EXTRACTION.md.
 */

export type VisionExtractionResult = {
  extraction: ExtractedPrescription;
  rejected: RejectedField[];
};

/** Injectable pour les tests : aucun test n'appelle le réseau. */
export type MessagesCreate = (params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: unknown[];
  tools: unknown[];
  tool_choice: unknown;
}) => Promise<{
  content: { type: string; name?: string; input?: unknown }[];
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}>;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export class VisionOCRProvider implements OCRProvider {
  readonly info: ProviderInfo;
  private readonly create: MessagesCreate;

  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      /** Journalisé et affiché : le pharmacien doit savoir qui a lu l'ordonnance. */
      providerLabel?: string;
    },
    create?: MessagesCreate,
  ) {
    this.info = {
      id: `anthropic:${config.model}`,
      label: config.providerLabel ?? `Lecture par modèle de vision (${config.model})`,
      capability: "LIVE",
      description:
        `L'image de l'ordonnance est transmise à ${config.model} pour lecture. ` +
        "Aucun champ n'est retenu sans citation du texte lu sur l'image ; ce qui est écarté apparaît vide et à relire.",
    };

    this.create =
      create ??
      (((params) =>
        new Anthropic({ apiKey: config.apiKey }).messages.create(
          params as never,
        ) as never) as MessagesCreate);
  }

  async extract(input: OcrInput): Promise<ExtractedPrescription> {
    return (await this.extractDetailed(input)).extraction;
  }

  /** Même lecture, avec le détail de ce qui a été écarté — pour le journal. */
  async extractDetailed(input: OcrInput): Promise<VisionExtractionResult> {
    const failure = (message: string): VisionExtractionResult => ({
      // Une lecture impossible n'invente rien et ne bloque pas le comptoir :
      // l'ordonnance repart en saisie manuelle, avec le motif à l'écran.
      extraction: {
        prescriberName: empty(),
        prescriberRpps: empty(),
        prescribedAt: empty(),
        patientName: empty(),
        lines: [],
        overallConfidence: 0,
        providerId: this.info.id,
        isSimulated: false,
        warnings: [message],
      },
      rejected: [],
    });

    if (!input.bytes || input.bytes.length === 0) {
      return failure("Aucune image n'a pu être lue pour cette ordonnance.");
    }
    const mimeType = input.mimeType ?? "";
    if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      return failure(
        `Format non pris en charge par la lecture automatique (${mimeType || "type inconnu"}). ` +
          "Formats acceptés : JPEG, PNG, GIF, WEBP.",
      );
    }

    let response;
    try {
      response = await this.create({
        model: this.config.model,
        max_tokens: 16000,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: Buffer.from(input.bytes).toString("base64"),
                },
              },
              { type: "text", text: EXTRACTION_USER_PROMPT },
            ],
          },
        ],
        tools: [
          {
            name: EXTRACTION_TOOL_NAME,
            description:
              "Enregistre ce qui a été lu sur l'ordonnance. Chaque champ doit porter sa citation exacte.",
            input_schema: EXTRACTION_SCHEMA,
            // Le schéma est alors garanti respecté. Cela ne garantit pas que le
            // contenu est lu plutôt que supposé — c'est le rôle du validateur.
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
      });
    } catch (error) {
      return failure(
        `La lecture automatique a échoué : ${
          error instanceof Error ? error.message : "erreur inconnue"
        }. L'ordonnance doit être saisie manuellement.`,
      );
    }

    if (response.stop_reason === "refusal") {
      return failure(
        "Le modèle a refusé de traiter cette image" +
          (response.stop_details?.explanation
            ? ` (${response.stop_details.explanation})`
            : "") +
          ". L'ordonnance doit être saisie manuellement.",
      );
    }

    const block = response.content.find(
      (item) => item.type === "tool_use" && item.name === EXTRACTION_TOOL_NAME,
    );
    if (!block?.input) {
      return failure(
        "Le modèle n'a renvoyé aucune lecture exploitable. L'ordonnance doit être saisie manuellement.",
      );
    }

    return validateVisionExtraction(block.input as ClaimedPrescription, {
      providerId: this.info.id,
      model: this.config.model,
    });
  }
}

function empty() {
  return { value: null, confidence: 0, unreadable: true };
}
