import { NEWS_LIMITS, NEWS_MIN_INTERVAL_DAYS, validateAnnouncement, type AnnouncementInput } from "@/core/patient-news";
import { formatDateLong, formatNumber, formatTime, pluralize } from "@/lib/format";

/**
 * Ce que l'écran « Nouveautés » décide tout seul, sans serveur : le retour
 * immédiat pendant la saisie, la raison pour laquelle un bouton est grisé, les
 * pastilles de l'historique. Le serveur rejoue les mêmes règles avant tout
 * envoi (`validateAnnouncement`, l'intervalle de 7 jours, le nombre d'abonnés) :
 * rien de ce qui est calculé ici ne fait autorité, tout y est seulement dit plus
 * tôt.
 */

export type Draft = { title: string; rangeLabel: string; message: string };

export const EMPTY_DRAFT: Draft = { title: "", rangeLabel: "", message: "" };

/** L'aperçu est redemandé au serveur quand la saisie s'arrête, pas à chaque frappe. */
export const PREVIEW_DELAY_MS = 600;

export type DraftCheck = {
  /** Le texte tel que le serveur le recevra, une fois accepté ; `null` tant qu'il est refusé. */
  value: AnnouncementInput | null;
  /** Pourquoi le texte ne peut pas partir (un champ manquant compris) ; `null` quand il est valide. */
  problem: string | null;
  /**
   * Les reproches faits à un champ déjà rempli : ils s'affichent sous le champ.
   * Un champ encore vide n'est pas grondé : il n'a pas eu le temps d'être écrit.
   */
  fieldErrors: Partial<Record<keyof Draft, string>>;
};

// Ce qu'un champ pris seul doit valoir pour que seul LUI soit jugé : les règles sont celles du serveur, jamais recopiées.
const NEUTRAL = { title: "Objet", rangeLabel: null, message: "Message" };

function fieldError(field: keyof Draft, draft: Draft): string | null {
  if (!draft[field].trim()) return null;
  const checked = validateAnnouncement({ ...NEUTRAL, [field]: draft[field] });
  return checked.ok ? null : checked.error;
}

export function checkDraft(draft: Draft): DraftCheck {
  const checked = validateAnnouncement(draft);
  const fieldErrors: DraftCheck["fieldErrors"] = {};
  for (const field of ["title", "rangeLabel", "message"] as const) {
    const error = fieldError(field, draft);
    if (error) fieldErrors[field] = error;
  }
  return checked.ok ? { value: checked.value, problem: null, fieldErrors } : { value: null, problem: checked.error, fieldErrors };
}

export type SendState = { enabled: boolean; activeCount: number; nextAllowedAt: string | null };

/**
 * Pourquoi l'envoi aux abonnés est impossible, indépendamment du texte ; `null`
 * quand rien ne s'y oppose. Le premier obstacle est le plus structurel : une
 * fonction coupée prime sur l'absence d'abonné, qui prime sur le délai.
 */
export function sendBlocker(state: SendState): string | null {
  if (!state.enabled) return "Les nouveautés sont désactivées : réactivez l'abonnement dans l'e-mail du plan pour pouvoir envoyer une annonce.";
  if (state.activeCount === 0) return "Aucun patient n'est abonné pour l'instant : il n'y a personne à qui écrire.";
  if (state.nextAllowedAt) return `Une annonce est déjà partie cette semaine : la prochaine sera possible le ${formatDateLong(state.nextAllowedAt)} à ${formatTime(state.nextAllowedAt)}.`;
  return null;
}

export function subscribersLabel(count: number): string {
  return `${formatNumber(count)} ${pluralize(count, "abonné")}`;
}

export function sendLabel(activeCount: number): string {
  return activeCount > 0 ? `Envoyer à ${subscribersLabel(activeCount)}` : "Envoyer aux abonnés";
}

/**
 * Ce que le titulaire doit savoir de l'après avant de confirmer : quand le
 * prochain envoi sera possible, ou le fait qu'un envoi simulé ne compte pas
 * (le serveur ne le compte pas dans la limite d'une annonce par semaine).
 */
export function afterSendNote(messagingLive: boolean, now: Date): string {
  if (!messagingLive) return "Cet envoi sera simulé : il ne compte pas dans la limite d'une annonce par semaine, et vous pourrez en lancer un vrai dès que la messagerie sera configurée.";
  const next = new Date(now.getTime() + NEWS_MIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return `Après cet envoi, la prochaine annonce ne pourra pas partir avant le ${formatDateLong(next)} (une par semaine au plus).`;
}

/**
 * Les gammes privilégiées de l'officine, mises en forme pour la liste de
 * suggestions : « Cicalfate (Avène) » ou le seul laboratoire. Une suggestion que
 * le serveur refuserait (trop longue, ressemblant à une adresse web) n'est pas
 * proposée : on ne suggère pas ce qu'on va refuser.
 */
export function rangeOptions(suggestions: { laboratory: string; rangeName: string | null }[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const suggestion of suggestions) {
    const label = (suggestion.rangeName ? `${suggestion.rangeName} (${suggestion.laboratory})` : suggestion.laboratory).trim();
    const key = label.toLowerCase();
    if (!label || label.length > NEWS_LIMITS.range || seen.has(key)) continue;
    if (!validateAnnouncement({ ...NEUTRAL, rangeLabel: label }).ok) continue;
    seen.add(key);
    options.push(label);
  }
  return options;
}

export type StatusBadge = { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral"; simulated: boolean };

/**
 * La pastille d'une annonce. Une annonce simulée n'est jamais « Envoyée » :
 * aucun message n'est parti, et c'est ce que la pastille doit dire.
 */
export function statusBadge(status: string, simulated: boolean): StatusBadge {
  switch (status) {
    case "SENDING":
      return { label: "En cours", tone: "info", simulated };
    case "SENT":
      return simulated ? { label: "Simulée", tone: "warning", simulated: false } : { label: "Envoyée", tone: "success", simulated: false };
    case "PARTIAL":
      return { label: "Partielle", tone: "warning", simulated };
    case "FAILED":
      return { label: "Échec", tone: "danger", simulated };
    default:
      return { label: status, tone: "neutral", simulated };
  }
}

export type AnnouncementCounts = { status: string; recipientCount: number; sentCount: number; failedCount: number; simulated: boolean };

/**
 * Les compteurs d'une annonce, en toutes lettres. `sentCount` compte les
 * messages remis OU simulés : le drapeau `simulated` dit lesquels, et le mot
 * change avec lui (« remis » ne se dit pas d'un message qui n'est pas parti).
 */
export function announcementTally(announcement: AnnouncementCounts): string {
  const { sentCount, failedCount, recipientCount } = announcement;
  if (announcement.status === "SENDING") return `${formatNumber(sentCount + failedCount)} sur ${formatNumber(recipientCount)} traités`;
  const sent = announcement.simulated ? `${formatNumber(sentCount)} ${pluralize(sentCount, "simulé")}` : `${formatNumber(sentCount)} remis`;
  return `${sent} · ${formatNumber(failedCount)} ${pluralize(failedCount, "échec")}`;
}
