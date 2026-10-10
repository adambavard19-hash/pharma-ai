import { PRODUCT_CATEGORIES } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import type { ProductCategoryCode } from "@/core/ai/types";

/**
 * Ce que PharmaBoost ne sait pas encore ranger dans le stock d'une pharmacie, et comment la pharmacienne le lui apprend.
 *
 * Deux sortes : un PRODUIT de l'officine (crème, complément, plante…) que le dictionnaire et le modèle n'ont pas su classer ou dont le
 * modèle doute ; un MÉDICAMENT dont on ne sait pas dire la famille (code ATC, classe) — sans elle, aucun conseil ne peut partir de lui.
 * Rien de tout cela n'est montré au titulaire : c'est un sujet de la console super admin.
 *
 * Module pur.
 */

export type GapKind = "PRODUCT" | "MEDICINE";
export type GapReason = "UNCLASSIFIED" | "LOW_CONFIDENCE" | "NO_FAMILY";

/** En dessous, le modèle « doute » : on demande à la pharmacienne plutôt que de laisser passer une supposition. */
export const LOW_CONFIDENCE = 0.6;

export const GAP_REASON_LABELS: Record<GapReason, string> = {
  UNCLASSIFIED: "PharmaBoost n'a pas su le ranger",
  LOW_CONFIDENCE: "Le modèle hésite",
  NO_FAMILY: "On ne sait pas dire à quelle famille il appartient",
};

/** Une décision de classement d'un produit est-elle assez sûre ? Une réponse de la pharmacienne l'est toujours. */
export function productDecisionIsUncertain(decision: { source: string; confidence: number } | null): GapReason | null {
  if (!decision) return "UNCLASSIFIED";
  if (decision.source === "PHARMACIST") return null;
  return decision.confidence < LOW_CONFIDENCE ? "LOW_CONFIDENCE" : null;
}

/** Une classification de médicament est-elle exploitable ? Il faut une famille (ATC ou classe), et un modèle qui n'hésite pas. */
export function drugClassificationIsUncertain(drug: { atcCode: string | null; therapeuticClass: string | null; confidence: number; validated?: boolean }): GapReason | null {
  if (drug.validated) return null;
  if (!drug.atcCode && !drug.therapeuticClass) return "NO_FAMILY";
  return drug.confidence < LOW_CONFIDENCE ? "LOW_CONFIDENCE" : null;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");

export type ProductAnswer = { category: ProductCategoryCode; tags: string[] };
export type DrugAnswer = { substance: string | null; atcCode: string | null; therapeuticClass: string | null };

/**
 * La réponse de la pharmacienne pour un produit : une catégorie, et des étiquettes prises dans le vocabulaire que les règles connaissent
 * (impossible d'en inventer). « Pas un produit de conseil » = catégorie « Autres », sans étiquette : il ne servira aucune règle.
 */
export function parseProductAnswer(raw: unknown): { ok: true; value: ProductAnswer } | { ok: false; error: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const category = clean(input.category) as ProductCategoryCode;
  if (!PRODUCT_CATEGORIES.includes(category)) return { ok: false, error: "Choisissez la catégorie du produit." };
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => clean(tag).toLowerCase()).filter(Boolean))];
  if (tags.length > 8) return { ok: false, error: "Huit étiquettes au plus." };
  const unknown = tags.find((tag) => !ADVICE_VOCABULARY.includes(tag));
  if (unknown) return { ok: false, error: `L'étiquette « ${unknown} » n'existe pas : choisissez dans la liste.` };
  return { ok: true, value: { category, tags } };
}

const ATC_PATTERN = /^[A-Z]\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?$/;

/** La réponse de la pharmacienne pour un médicament : au moins une famille (code ATC ou classe) ; le code ATC est contrôlé. */
export function parseDrugAnswer(raw: unknown): { ok: true; value: DrugAnswer } | { ok: false; error: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const substance = clean(input.substance).slice(0, 120) || null;
  const atcCode = clean(input.atcCode).toUpperCase().replace(/\s+/g, "") || null;
  const therapeuticClass = clean(input.therapeuticClass).slice(0, 120) || null;
  if (atcCode && !ATC_PATTERN.test(atcCode)) return { ok: false, error: `« ${atcCode} » n'est pas un code ATC valide (exemples : J01CA04, N02BE01, A02BC05, ou un début comme J01).` };
  if (!atcCode && !therapeuticClass) return { ok: false, error: "Indiquez au moins la famille : un code ATC ou une classe thérapeutique." };
  if (therapeuticClass && therapeuticClass.length < 4) return { ok: false, error: "La classe thérapeutique s'écrit en 4 caractères au moins." };
  return { ok: true, value: { substance, atcCode, therapeuticClass } };
}
