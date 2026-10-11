/**
 * PharmaBoost Mobile — le profil d'une personne et ses consentements, en règles pures.
 *
 * Partagé par les actions serveur (validation) et les écrans (libellés, textes affichés). Les textes de
 * consentement sont versionnés : la version affichée est enregistrée avec chaque décision (UserConsent.textVersion),
 * pour pouvoir dire des mois plus tard à quoi exactement la personne a dit oui.
 */

export const PROFESSIONS = ["OWNER_PHARMACIST", "ASSISTANT_PHARMACIST", "TECHNICIAN", "PHARMACY_STUDENT", "OTHER"] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const PROFESSION_LABELS: Record<Profession, string> = {
  OWNER_PHARMACIST: "Pharmacien titulaire",
  ASSISTANT_PHARMACIST: "Pharmacien adjoint",
  TECHNICIAN: "Préparateur en pharmacie",
  PHARMACY_STUDENT: "Étudiant en pharmacie",
  OTHER: "Autre",
};

export function isProfession(value: unknown): value is Profession {
  return typeof value === "string" && (PROFESSIONS as readonly string[]).includes(value);
}

/**
 * Le RPPS : 11 chiffres. On ne contrôle QUE le format — aucune vérification auprès de l'annuaire santé — d'où le
 * libellé « non vérifié » partout où il s'affiche. Espaces tolérés à la saisie. Vide → null.
 */
export function normalizeRpps(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Numéro RPPS invalide." };
  const compact = raw.replace(/\s+/g, "");
  if (compact === "") return { ok: true, value: null };
  if (!/^\d{11}$/.test(compact)) return { ok: false, error: "Le numéro RPPS compte 11 chiffres." };
  return { ok: true, value: compact };
}

export const CONSENT_KINDS = ["PHARMABOOST_NEWS", "PARTNER_COMMUNICATIONS"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Les textes montrés à côté des cases (jamais cochées d'avance). Changer un texte = changer sa version. */
export const CONSENT_TEXTS: Record<ConsentKind, { version: string; title: string; body: string }> = {
  PHARMABOOST_NEWS: {
    version: "2026-10-mobile-v1",
    title: "Nouveautés PharmaBoost",
    body: "J'accepte de recevoir les nouveautés de PharmaBoost (nouvelles formations, fonctionnalités) par e-mail et dans l'application. Je peux retirer cet accord à tout moment dans « Mon espace ».",
  },
  PARTNER_COMMUNICATIONS: {
    version: "2026-10-mobile-v1",
    title: "Communications des partenaires",
    body: "J'accepte de recevoir, via PharmaBoost, des informations des laboratoires partenaires (lancements, formations). Mes coordonnées ne leur sont jamais transmises sans une demande explicite de ma part. Je peux retirer cet accord à tout moment.",
  },
};

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === "string" && (CONSENT_KINDS as readonly string[]).includes(value);
}

/** Une case HTML cochée envoie « on » ; tout le reste (absente, vide) vaut NON. Rien n'est jamais présumé accepté. */
export function checkboxValue(raw: FormDataEntryValue | null | undefined): boolean {
  return raw === "on" || raw === "true" || raw === "1";
}

/** « Bonjour », « Bonsoir » selon l'heure de Paris. */
export function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(now));
  return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
}
