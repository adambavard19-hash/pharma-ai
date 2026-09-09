import type { ProductCategoryCode } from "@/core/ai/types";
import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY, restrictToVocabulary, type ProductClassificationResult } from "./product-vocabulary";

/**
 * La classification des produits par un modèle — le contrat.
 *
 * Le modèle reçoit des noms de produits (jamais une donnée patient) et doit
 * les ranger dans les catégories de l'officine et le vocabulaire fermé des
 * règles de conseil. Il ne peut rien inventer : une catégorie inconnue ou une
 * étiquette hors vocabulaire est écartée à la validation. Il ne dit rien du
 * produit — ni indication, ni allégation — il le range.
 */

export const PRODUCT_CLASSIFICATION_TOOL_NAME = "classer_produits";

export const PRODUCT_CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["produits"],
  properties: {
    produits: {
      type: "array",
      description: "Une entrée par produit reçu, dans le même ordre. Aucun produit ajouté, aucun omis.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "categorie", "etiquettes", "confiance"],
        properties: {
          index: { type: "integer", description: "L'index du produit, tel que reçu." },
          categorie: {
            type: "string",
            enum: [...PRODUCT_CATEGORIES],
            description: "La catégorie de rayon. « AUTRE » si aucune ne convient.",
          },
          etiquettes: {
            type: "array",
            items: { type: "string", enum: [...ADVICE_VOCABULARY] },
            description:
              "Les étiquettes du vocabulaire fermé qui décrivent l'USAGE du produit. Vide si le produit ne répond à aucun de ces usages. Ne choisis une étiquette que si le produit sert réellement cet usage.",
          },
          confiance: { type: "number", description: "Confiance, entre 0 et 1." },
        },
      },
    },
  },
} as const;

export const PRODUCT_CLASSIFICATION_SYSTEM_PROMPT = `Tu ranges des produits vendus en pharmacie d'officine en France (parapharmacie, dispositifs médicaux, médicaments de conseil) dans des catégories de rayon et un vocabulaire d'usage fermé.

Pour chaque produit : sa catégorie parmi la liste imposée, et les étiquettes d'usage — uniquement parmi celles proposées — que le produit sert réellement. Un produit qui ne sert aucun de ces usages reçoit une liste vide : c'est une réponse correcte. Une étiquette attribuée à tort ferait proposer ce produit à un patient qui n'en a pas besoin.

Tu n'écris rien d'autre : ni indication, ni conseil, ni allégation.

Catégories : ${PRODUCT_CATEGORIES.join(", ")}.
Étiquettes d'usage : ${ADVICE_VOCABULARY.join(" · ")}.`;

export type ProductClassificationRequest = {
  products: { index: number; name: string; brand?: string | null; description?: string | null }[];
};

export type ProductClassificationResponse = {
  results: (ProductClassificationResult & { index: number })[];
  providerId: string;
  model: string;
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number; durationMs: number } | null;
};

export function buildProductClassificationPrompt(request: ProductClassificationRequest): string {
  return request.products
    .map((p) => [`produit ${p.index} : ${p.name}`, p.brand ? `(marque : ${p.brand})` : null, p.description ? `— ${p.description}` : null].filter(Boolean).join(" "))
    .join("\n");
}

export const PRODUCT_CLASSIFICATION_MIN_CONFIDENCE = 0.5;

/** Ce que le modèle a renvoyé, avant validation. */
export type ClaimedProductClassification = {
  produits?: { index?: unknown; categorie?: unknown; etiquettes?: unknown; confiance?: unknown }[];
};

/** Ne garde que ce qui respecte le contrat : catégorie connue, étiquettes du vocabulaire, confiance suffisante. */
export function validateProductClassification(
  claimed: ClaimedProductClassification,
  context: { count: number; providerId: string; model: string },
): { results: ProductClassificationResponse["results"]; warnings: string[] } {
  const results: ProductClassificationResponse["results"] = [];
  const warnings: string[] = [];
  const seen = new Set<number>();
  const categories = new Set<string>(PRODUCT_CATEGORIES);

  for (const item of claimed.produits ?? []) {
    const index = typeof item.index === "number" && Number.isInteger(item.index) ? item.index : null;
    if (index === null || index < 0 || index >= context.count || seen.has(index)) {
      warnings.push(`index de produit invalide ou dupliqué : ${String(item.index)}`);
      continue;
    }
    seen.add(index);
    const category = typeof item.categorie === "string" && categories.has(item.categorie) ? (item.categorie as ProductCategoryCode) : null;
    if (!category) {
      warnings.push(`produit ${index} : catégorie inconnue « ${String(item.categorie)} »`);
      continue;
    }
    const confidence = typeof item.confiance === "number" && Number.isFinite(item.confiance) ? Math.max(0, Math.min(1, item.confiance)) : 0;
    if (confidence < PRODUCT_CLASSIFICATION_MIN_CONFIDENCE) {
      warnings.push(`produit ${index} : confiance trop faible (${confidence.toFixed(2)})`);
      continue;
    }
    const rawTags = Array.isArray(item.etiquettes) ? item.etiquettes.filter((t): t is string => typeof t === "string") : [];
    const tags = restrictToVocabulary(rawTags);
    if (tags.length < rawTags.length) warnings.push(`produit ${index} : ${rawTags.length - tags.length} étiquette(s) hors vocabulaire écartée(s)`);
    results.push({ index, category, tags, confidence, source: "AI", ruleKeys: [] });
  }

  return { results, warnings };
}
