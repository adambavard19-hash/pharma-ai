import { NEWS_LIMITS, NEWS_MIN_INTERVAL_DAYS, NEWS_RETENTION_MONTHS } from "./constants";

/**
 * Ce qu'une annonce a le droit de contenir, et quand elle a le droit de partir.
 *
 * Une annonce est écrite par le titulaire à des personnes qui lui ont donné
 * leur adresse pour cela et pour rien d'autre. Elle présente une gamme ; elle
 * ne soigne pas, ne promet rien et ne renvoie nulle part. Les règles sont
 * ici, pures et testables : l'action serveur les rejoue avant tout envoi, quoi
 * que l'écran ait déjà vérifié.
 */

export type AnnouncementInput = { title: string; rangeLabel: string | null; message: string };

export type AnnouncementValidation = { ok: true; value: AnnouncementInput } | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sans accents ni majuscules : une règle ne se contourne pas en changeant la casse ou en retirant un accent. */
function plain(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Les caractères de contrôle (hors saut de ligne et tabulation) n'ont rien à faire dans un e-mail. */
function withoutControls(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("");
}

/** Un objet ou un nom de gamme tient sur une ligne : un saut de ligne dans un objet d'e-mail ouvre la porte à l'injection d'en-têtes. */
function oneLine(value: string): string {
  return withoutControls(value).replace(/\s+/g, " ").trim();
}

function paragraphs(value: string): string {
  return withoutControls(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const WEB_ADDRESS = /(?:https?:|ftp:)?\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|fr|net|org|eu|io|app|shop|store|info|biz|ly|link)\b/;
const EMAIL_ADDRESS = /[^\s@]+@[^\s@]+/;
const TEMPLATE_VARIABLE = /\{\{|\}\}/;

/**
 * Les mots qui feraient d'une annonce commerciale un message de santé :
 * ordonnance, prescription, remboursement, guérison, « traitement contre ».
 */
const HEALTH_CLAIMS = [/\bordonnance/, /\bprescri/, /\brembours/, /\bgueri(?:t|r|s|son|e|es)?\b/, /\btraitements? (?:contre|pour)\b/];

/** `null` quand le texte est acceptable, sinon la phrase qui dit pourquoi, adressée à l'auteur. */
function textProblem(label: string, value: string): string | null {
  // L'e-mail d'abord : « contact@marque.fr » contient aussi un nom de domaine, et l'auteur doit lire le bon motif.
  if (EMAIL_ADDRESS.test(value)) return `${label} ne doit contenir aucune adresse e-mail.`;
  if (WEB_ADDRESS.test(plain(value))) return `${label} ne doit contenir aucune adresse web : une annonce ne renvoie pas vers un lien libre.`;
  if (TEMPLATE_VARIABLE.test(value)) return `${label} ne doit contenir aucune variable du type {{…}} : une annonce n'est pas personnalisée.`;
  const words = plain(value);
  if (HEALTH_CLAIMS.some((claim) => claim.test(words))) {
    return `${label} ne doit parler ni d'ordonnance, ni de prescription, ni de remboursement, ni de guérison : une annonce présente une gamme, pas un traitement.`;
  }
  return null;
}

export function validateAnnouncement(raw: { title?: unknown; rangeLabel?: unknown; message?: unknown }): AnnouncementValidation {
  if (raw.rangeLabel != null && typeof raw.rangeLabel !== "string") return { ok: false, error: "Le nom de la gamme n'est pas valide." };

  const title = typeof raw.title === "string" ? oneLine(raw.title) : "";
  if (!title) return { ok: false, error: "Donnez un objet à l'annonce." };
  if (title.length > NEWS_LIMITS.title) return { ok: false, error: `L'objet est trop long : ${NEWS_LIMITS.title} caractères au plus.` };
  const titleProblem = textProblem("L'objet", title);
  if (titleProblem) return { ok: false, error: titleProblem };

  const rangeLabel = typeof raw.rangeLabel === "string" ? oneLine(raw.rangeLabel) : "";
  if (rangeLabel.length > NEWS_LIMITS.range) return { ok: false, error: `Le nom de la gamme est trop long : ${NEWS_LIMITS.range} caractères au plus.` };
  const rangeProblem = rangeLabel ? textProblem("Le nom de la gamme", rangeLabel) : null;
  if (rangeProblem) return { ok: false, error: rangeProblem };

  const message = typeof raw.message === "string" ? paragraphs(raw.message) : "";
  if (!message) return { ok: false, error: "Écrivez le message de l'annonce." };
  if (message.length > NEWS_LIMITS.message) return { ok: false, error: `Le message est trop long : ${NEWS_LIMITS.message} caractères au plus.` };
  const messageProblem = textProblem("Le message", message);
  if (messageProblem) return { ok: false, error: messageProblem };

  return { ok: true, value: { title, rangeLabel: rangeLabel || null, message } };
}

/**
 * Quand la prochaine annonce sera permise ; `null` : maintenant. Une annonce
 * tous les 7 jours au plus, pour que l'abonné reçoive des nouveautés, pas un
 * flot de messages.
 */
export function nextAnnouncementAllowedAt(lastAnnouncementAt: Date | null, now: Date): Date | null {
  if (!lastAnnouncementAt) return null;
  const next = new Date(lastAnnouncementAt.getTime() + NEWS_MIN_INTERVAL_DAYS * DAY_MS);
  return next.getTime() > now.getTime() ? next : null;
}

/**
 * La date avant laquelle un consentement est périmé : maintenant moins 36 mois
 * calendaires. Le 29 février redescend au dernier jour du mois d'arrivée plutôt
 * que de sauter au mois suivant.
 */
export function newsRetentionCutoff(now: Date): Date {
  const day = now.getUTCDate();
  const cutoff = new Date(now);
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - NEWS_RETENTION_MONTHS);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}
