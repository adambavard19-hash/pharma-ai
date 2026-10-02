import { brandKey } from "@/core/catalog/brand";
import { isUniverseKey } from "@/config/universes";
import { normalizeProductCode } from "./match";

/**
 * Ce qu'est un contenu de formation, et ce qu'on accepte d'en publier.
 *
 * Un contenu est un lien officiel, une vidéo, une fiche courte ou un document
 * fourni ou autorisé par son auteur. PharmaBoost n'héberge rien : il pointe
 * vers la source, et le dit. Ce module est pur — la console et l'officine
 * appellent la même validation, et les tests la figent.
 *
 * Rien ici ne touche au conseil : un contenu de formation n'entre jamais dans
 * le moteur (voir __tests__/invariant.test.ts).
 */

export const TRAINING_KINDS = ["VIDEO", "SHEET", "DOCUMENT", "EXTERNAL_LINK", "QUIZ"] as const;
export type TrainingKindCode = (typeof TRAINING_KINDS)[number];

/** Les formats qu'on peut publier aujourd'hui. Le quiz est annoncé, pas encore construit. */
export const PUBLISHABLE_KINDS = ["VIDEO", "SHEET", "DOCUMENT", "EXTERNAL_LINK"] as const satisfies readonly TrainingKindCode[];
export type PublishableKind = (typeof PUBLISHABLE_KINDS)[number];

export const TRAINING_KIND_LABELS: Record<TrainingKindCode, string> = {
  VIDEO: "Vidéo",
  SHEET: "Fiche courte",
  DOCUMENT: "Document",
  EXTERNAL_LINK: "Lien officiel",
  QUIZ: "Quiz",
};

/** Les formats qui ne se lisent qu'à l'adresse indiquée. */
const KINDS_WITH_URL: TrainingKindCode[] = ["VIDEO", "DOCUMENT", "EXTERNAL_LINK"];

export function isPublishableKind(kind: string): kind is PublishableKind {
  return (PUBLISHABLE_KINDS as readonly string[]).includes(kind);
}

export function isTrainingKind(kind: string): kind is TrainingKindCode {
  return (TRAINING_KINDS as readonly string[]).includes(kind);
}

/** « 5 min », « 1 h », « 1 h 15 ». Null quand la durée n'est pas connue. */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** Une adresse web ouvrable sans risque : http ou https, avec un hôte. Rien d'autre (javascript:, data:, fichier local…). */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** La provenance affichée quand l'auteur du contenu n'en a pas précisé. */
export function defaultSourceLabel(isGlobal: boolean): string {
  return isGlobal ? "Publié par PharmaBoost" : "Ajouté par votre officine";
}

/** Ce que saisit l'éditeur (console ou titulaire), tel quel. */
export type TrainingDraft = {
  title: string;
  summary?: string | null;
  kind: string;
  url?: string | null;
  body?: string | null;
  laboratory?: string | null;
  /** La marque telle qu'on l'écrit (« La Roche-Posay ») : on en garde la clé normalisée. */
  brand?: string | null;
  rangeName?: string | null;
  universe?: string | null;
  /** Codes CIP/EAN, en liste ou en texte libre (un par ligne, ou séparés par des virgules). */
  productCodes?: string[] | string | null;
  productIds?: string[] | null;
  durationMinutes?: number | string | null;
  sourceLabel?: string | null;
};

/** Ce qui s'écrit en base, nettoyé. */
export type TrainingContentData = {
  title: string;
  summary: string | null;
  kind: PublishableKind;
  url: string | null;
  body: string | null;
  laboratory: string | null;
  brandKey: string | null;
  rangeName: string | null;
  universe: string | null;
  productCodes: string[];
  productIds: string[];
  durationMinutes: number | null;
  sourceLabel: string | null;
};

export type DraftResult =
  | { ok: true; data: TrainingContentData }
  | { ok: false; fieldErrors: Record<string, string> };

const LIMITS = { title: 160, summary: 500, body: 8000, laboratory: 80, brand: 80, rangeName: 80, sourceLabel: 120, url: 2000 } as const;

function clean(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Découpe un texte de codes (lignes, virgules, points-virgules, espaces) en codes distincts. */
export function splitProductCodes(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[\s,;]+/);
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
}

/**
 * Valide et nettoie un contenu avant enregistrement.
 *
 * `scope` dit d'où il vient : un contenu GLOBAL (console PharmaBoost) cible
 * des codes produit, car il ne connaît pas les fiches des officines ; un
 * contenu de l'officine (PHARMACY) cible ses propres produits. L'autre champ
 * est vidé plutôt que refusé.
 */
export function normalizeTrainingDraft(draft: TrainingDraft, scope: "GLOBAL" | "PHARMACY"): DraftResult {
  const fieldErrors: Record<string, string> = {};

  const title = clean(draft.title, LIMITS.title);
  if (!title || title.length < 3) fieldErrors.title = "Donnez un titre (3 caractères au moins).";

  let kind: PublishableKind = "EXTERNAL_LINK";
  if (draft.kind === "QUIZ") fieldErrors.kind = "Les quiz arrivent bientôt : choisissez un autre format.";
  else if (!isPublishableKind(draft.kind)) fieldErrors.kind = "Choisissez un format.";
  else kind = draft.kind;

  const url = clean(draft.url, LIMITS.url);
  if (url && !isSafeHttpUrl(url)) fieldErrors.url = "Adresse invalide : elle doit commencer par https://";
  else if (!url && KINDS_WITH_URL.includes(kind) && !fieldErrors.kind) {
    fieldErrors.url = kind === "VIDEO" ? "Indiquez le lien de la vidéo." : kind === "DOCUMENT" ? "Indiquez le lien du document." : "Indiquez le lien officiel.";
  }

  const body = draft.body ? draft.body.trim().slice(0, LIMITS.body) || null : null;
  if (kind === "SHEET" && !fieldErrors.kind && (!body || body.length < 20)) fieldErrors.body = "Écrivez le contenu de la fiche (20 caractères au moins).";

  const universe = clean(draft.universe, 60);
  if (universe && !isUniverseKey(universe)) fieldErrors.universe = "Univers inconnu.";

  let durationMinutes: number | null = null;
  const rawDuration = typeof draft.durationMinutes === "string" ? draft.durationMinutes.trim() : draft.durationMinutes;
  if (rawDuration !== null && rawDuration !== undefined && rawDuration !== "") {
    const value = Number(rawDuration);
    if (!Number.isInteger(value) || value < 1 || value > 600) fieldErrors.durationMinutes = "Une durée en minutes, de 1 à 600.";
    else durationMinutes = value;
  }

  const productCodes: string[] = [];
  if (scope === "GLOBAL") {
    const invalid: string[] = [];
    for (const code of splitProductCodes(draft.productCodes)) {
      const normalized = normalizeProductCode(code);
      if (normalized) {
        if (!productCodes.includes(normalized)) productCodes.push(normalized);
      } else invalid.push(code);
    }
    if (invalid.length > 0) fieldErrors.productCodes = `Code${invalid.length > 1 ? "s" : ""} non reconnu${invalid.length > 1 ? "s" : ""} : ${invalid.slice(0, 5).join(", ")}. Un CIP13, un CIP7 ou un EAN.`;
    if (productCodes.length > 200) fieldErrors.productCodes = "200 codes au plus.";
  }

  const productIds = scope === "PHARMACY" ? [...new Set((draft.productIds ?? []).map((id) => id.trim()).filter(Boolean))] : [];
  if (productIds.length > 100) fieldErrors.productIds = "100 produits au plus.";

  const brand = clean(draft.brand, LIMITS.brand);

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      title: title!,
      summary: clean(draft.summary, LIMITS.summary),
      kind,
      url,
      body: kind === "SHEET" ? body : null,
      laboratory: clean(draft.laboratory, LIMITS.laboratory),
      brandKey: brand ? brandKey(brand) || null : null,
      rangeName: clean(draft.rangeName, LIMITS.rangeName),
      universe,
      productCodes,
      productIds,
      durationMinutes,
      sourceLabel: clean(draft.sourceLabel, LIMITS.sourceLabel),
    },
  };
}

/** La marque d'un contenu, pour l'affichage (la clé est stockée en minuscules). */
export function brandDisplay(key: string | null | undefined): string | null {
  return key ? key.toUpperCase() : null;
}
