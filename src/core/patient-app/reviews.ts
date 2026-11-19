/**
 * Les avis des patients sur leur pharmacie (fondateur et Donna, 18 nov. 2026) : dans l'appli, le patient note son passage
 * (étoiles) et choisit des mots tout prêts — jamais de texte libre, pour ne jamais recueillir une donnée de santé. L'avis
 * arrive au collaborateur (son prénom) et au titulaire. Ensuite, l'appli invite le patient à noter PharmaBoost lui-même sur
 * l'App Store (fenêtre officielle d'Apple) et sur Google : on ne recopie jamais un avis à sa place, et l'invitation est la
 * même quelle que soit la note donnée (pas de tri des avis, interdit par Google et trompeur pour la DGCCRF).
 *
 * Module pur : aucune base, aucun réseau.
 */

export type ReviewTag = { key: string; label: string; positive: boolean };

export const REVIEW_TAGS: readonly ReviewTag[] = [
  { key: "conseil", label: "Très bon conseil", positive: true },
  { key: "ecoute", label: "À l'écoute", positive: true },
  { key: "clair", label: "Explications claires", positive: true },
  { key: "accueil", label: "Accueil chaleureux", positive: true },
  { key: "rapide", label: "Rapide et efficace", positive: true },
  { key: "suivi", label: "Bon suivi", positive: true },
  { key: "attente", label: "Attente un peu longue", positive: false },
  { key: "plus-explications", label: "J'aurais aimé plus d'explications", positive: false },
];

const TAG_KEYS = new Set(REVIEW_TAGS.map((tag) => tag.key));

export const tagLabel = (key: string) => REVIEW_TAGS.find((tag) => tag.key === key)?.label ?? null;

/** Une fiche Google de PharmaBoost : le lien « Laisser un avis » (Google Business Profile › Demander des avis). Vide : pas de bouton. */
export const GOOGLE_REVIEW_URL: string | null = null;

/** La fiche de l'appli sur l'App Store (identifiant Apple 6821719621) : la page d'écriture d'un avis, si la fenêtre officielle manque. */
export const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6821719621?action=write-review";

/** Un patient ne laisse qu'un avis par jour et par pharmacie. */
export const REVIEW_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/** Un témoignage n'apparaît sur le site qu'à partir de 4 étoiles, avec l'accord écrit du patient. */
export const TESTIMONIAL_MIN_RATING = 4;

export type ReviewInput = { rating: number; tags: string[]; staffUserId: string | null; publicConsent: boolean; publicName: string };

export type CleanReview = { rating: number; tags: string[]; staffUserId: string | null; publicConsent: boolean; publicName: string | null };

/** Vérifie et nettoie un avis : note 1 à 5, mots de la liste seulement (sans doublon), prénom court et sans chiffres. */
export function cleanReview(input: ReviewInput): { ok: true; review: CleanReview } | { ok: false; error: string } {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choisissez une note de 1 à 5 étoiles." };
  const tags = [...new Set((input.tags ?? []).map(String))].filter((key) => TAG_KEYS.has(key)).slice(0, 6);
  const name = String(input.publicName ?? "")
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  const publicConsent = Boolean(input.publicConsent) && rating >= TESTIMONIAL_MIN_RATING;
  return {
    ok: true,
    review: {
      rating,
      tags,
      staffUserId: input.staffUserId ? String(input.staffUserId).slice(0, 64) : null,
      publicConsent,
      publicName: publicConsent && name ? name : null,
    },
  };
}

/** La phrase d'un témoignage, faite des mots choisis : « Très bon conseil, à l'écoute. » */
export function testimonialSentence(tags: readonly string[]): string | null {
  const labels = tags
    .map((key) => REVIEW_TAGS.find((tag) => tag.key === key))
    .filter((tag): tag is ReviewTag => Boolean(tag?.positive))
    .map((tag) => tag.label);
  if (labels.length === 0) return null;
  const text = labels.map((label, i) => (i === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1))).join(", ");
  return `${text}.`;
}

/** La moyenne arrondie au dixième, ou rien. */
export function averageRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10;
}
