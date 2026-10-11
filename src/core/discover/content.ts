/**
 * Découvertes : libellés, recherche et demande d'information. Pur, sans base.
 */

/**
 * Ce qui signale un contenu commercial. Tout ce qu'un partenaire paie porte « Sponsorisé » ; tout ce qu'une marque
 * publie (fiche, nouveauté, formation) porte « Partenaire ». Jamais de contenu commercial sans l'un des deux.
 */
export type CommercialLabel = "Sponsorisé" | "Partenaire";

export function commercialLabel(origin: { sponsored: boolean }): CommercialLabel {
  return origin.sponsored ? "Sponsorisé" : "Partenaire";
}

/** Minuscules, sans accents ni ponctuation : « Éclat » se trouve en tapant « eclat ». */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tous les mots de la recherche figurent dans l'un des champs (ordre libre). Une recherche vide laisse tout passer. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export const FAVORITE_TYPES = ["BRAND", "LAUNCH", "TRAINING", "PRODUCT"] as const;
export type FavoriteType = (typeof FAVORITE_TYPES)[number];

export function isFavoriteType(value: unknown): value is FavoriteType {
  return typeof value === "string" && (FAVORITE_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// « Demander des informations »
// ---------------------------------------------------------------------------

export const INFO_REQUEST_CONSENT_VERSION = "2026-10-decouvertes-v1";
export const INFO_REQUEST_MESSAGE_MAX = 1000;

export type InfoRequestShared = {
  fullName: string;
  email: string;
  professionLabel: string | null;
  /** Le nom de l'officine, seulement si la personne a choisi de le joindre. */
  pharmacyName: string | null;
};

/** Ce qui sera transmis, ligne par ligne, tel qu'affiché dans la feuille avant l'envoi. */
export function sharedLines(shared: InfoRequestShared, hasMessage: boolean): string[] {
  return [
    `Nom : ${shared.fullName}`,
    `E-mail : ${shared.email}`,
    shared.professionLabel ? `Métier : ${shared.professionLabel}` : null,
    shared.pharmacyName ? `Officine : ${shared.pharmacyName}` : null,
    hasMessage ? "Votre message" : null,
  ].filter((line): line is string => line !== null);
}

/**
 * Le texte du consentement, exactement tel qu'il est affiché à côté de la case — et tel qu'il est enregistré dans la
 * demande (preuve). Il nomme la marque, le laboratoire et chaque donnée transmise.
 */
export function infoRequestConsentText(input: { brandName: string; partnerName: string; shared: InfoRequestShared; hasMessage: boolean }): string {
  const items = ["mon nom", "mon adresse e-mail"];
  if (input.shared.professionLabel) items.push("mon métier");
  if (input.shared.pharmacyName) items.push(`le nom de mon officine (« ${input.shared.pharmacyName} »)`);
  if (input.hasMessage) items.push("mon message");
  const list = items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items.at(-1)}` : items[0];
  return `J'accepte que PharmaBoost transmette ${list} à ${input.brandName} (${input.partnerName}), pour que la marque réponde à ma demande d'information. Aucune autre donnée n'est transmise.`;
}

export type InfoRequestCheck = { ok: true; message: string | null } | { ok: false; field: "consent" | "message"; error: string };

/** La case de consentement est obligatoire (jamais cochée d'avance) ; le message est facultatif et borné. */
export function checkInfoRequest(input: { consent: boolean; message: string | null | undefined }): InfoRequestCheck {
  if (!input.consent) return { ok: false, field: "consent", error: "Cochez la case pour accepter la transmission de vos coordonnées : sans cet accord, rien n'est envoyé." };
  const message = input.message?.trim() || null;
  if (message && message.length > INFO_REQUEST_MESSAGE_MAX) return { ok: false, field: "message", error: `${INFO_REQUEST_MESSAGE_MAX} caractères au plus.` };
  return { ok: true, message };
}
