/**
 * Contact support : les règles d'une discussion entre une officine et l'équipe PharmaBoost, sans base ni session.
 *
 * Une discussion a un état qui ne se déclare pas : il se LIT. Si la dernière à avoir écrit est l'officine, c'est à
 * l'équipe de répondre ; si c'est l'équipe, elle attend l'officine ; si elle est fermée, plus rien n'est attendu. Ce module
 * dit aussi quand prévenir l'équipe par e-mail (jamais plus d'un message toutes les dix minutes sur une même discussion,
 * pour qu'un pharmacien qui écrit en plusieurs fois ne remplisse pas la boîte).
 *
 * Aucune donnée de santé n'a sa place dans ces messages : l'écran le rappelle avant d'écrire, et la base est hébergée hors
 * UE tant que la migration HDS n'est pas faite.
 */

export type SupportTopicCode = "QUESTION" | "TECHNICAL" | "BILLING" | "SUGGESTION";

export const SUPPORT_TOPICS: { value: SupportTopicCode; label: string; hint: string }[] = [
  { value: "QUESTION", label: "Une question", hint: "Comment faire, comment ça marche" },
  { value: "TECHNICAL", label: "Un problème", hint: "Quelque chose ne marche pas comme prévu" },
  { value: "BILLING", label: "Abonnement et facture", hint: "Contrat, paiement, résiliation" },
  { value: "SUGGESTION", label: "Une idée", hint: "Ce qui vous ferait gagner du temps" },
];

export const SUPPORT_TOPIC_LABELS: Record<SupportTopicCode, string> = Object.fromEntries(SUPPORT_TOPICS.map((topic) => [topic.value, topic.label])) as Record<SupportTopicCode, string>;

export function isSupportTopic(value: string): value is SupportTopicCode {
  return SUPPORT_TOPICS.some((topic) => topic.value === value);
}

export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MIN = 3;
export const SUPPORT_BODY_MAX = 4000;

/** Le rappel affiché avant d'écrire, et dans l'e-mail à l'équipe quand un message en contient manifestement une. */
export const SUPPORT_PRIVACY_NOTICE = "N'écrivez aucune donnée de patient (nom, ordonnance, numéro de sécu) : décrivez la situation sans les identifier.";

export type SupportAuthorCode = "PHARMACY" | "SUPPORT";
export type SupportStatusCode = "OPEN" | "CLOSED";
export type SupportStateCode = "TO_ANSWER" | "WAITING_PHARMACY" | "CLOSED";

/** L'état d'une discussion, lu de qui a écrit en dernier. */
export function supportThreadState(thread: { status: SupportStatusCode; lastMessageFrom: SupportAuthorCode }): SupportStateCode {
  if (thread.status === "CLOSED") return "CLOSED";
  return thread.lastMessageFrom === "PHARMACY" ? "TO_ANSWER" : "WAITING_PHARMACY";
}

type Tone = "warning" | "success" | "neutral" | "info";

/** Les mots de la console : « À répondre » est ce que l'équipe doit faire. */
export const SUPPORT_STATE_FOR_ADMIN: Record<SupportStateCode, { label: string; tone: Tone }> = {
  TO_ANSWER: { label: "À répondre", tone: "warning" },
  WAITING_PHARMACY: { label: "En attente de la pharmacie", tone: "neutral" },
  CLOSED: { label: "Fermée", tone: "neutral" },
};

/** Les mots de l'officine : ce qu'elle doit attendre, ou lire. */
export const SUPPORT_STATE_FOR_PHARMACY: Record<SupportStateCode, { label: string; tone: Tone }> = {
  TO_ANSWER: { label: "En attente de réponse", tone: "info" },
  WAITING_PHARMACY: { label: "PharmaBoost a répondu", tone: "success" },
  CLOSED: { label: "Terminée", tone: "neutral" },
};

/**
 * Un message propre : sans caractères de contrôle, sans espaces en fin de ligne, sans plus d'une ligne vide d'affilée.
 * Les retours à la ligne sont gardés (c'est une conversation), et rien n'est interprété : le texte est affiché tel quel.
 */
export function cleanMessage(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Un début de phrase, coupé à la limite d'un mot. */
export function excerpt(text: string, max = 240): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Le sujet quand l'officine n'en a pas donné : les premiers mots de son message. */
export function deriveSubject(body: string): string {
  const first = body.split("\n").find((line) => line.trim().length > 0) ?? "";
  return excerpt(first, 60) || "Question";
}

export type MessageCheck = { ok: true; body: string } | { ok: false; error: string };

export function checkMessage(raw: string): MessageCheck {
  const body = cleanMessage(raw);
  if (body.length < SUPPORT_BODY_MIN) return { ok: false, error: "Écrivez votre message." };
  if (body.length > SUPPORT_BODY_MAX) return { ok: false, error: `Votre message est trop long (${SUPPORT_BODY_MAX.toLocaleString("fr-FR")} caractères au plus) : scindez-le en deux.` };
  return { ok: true, body };
}

/** Pas plus d'un e-mail toutes les dix minutes pour une pharmacie qui écrit en plusieurs fois sur une même discussion. */
export const SUPPORT_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Faut-il prévenir l'équipe par e-mail ? Oui pour une nouvelle discussion, et pour toute réponse de l'officine à l'équipe
 * (c'est à elle de répondre de nouveau). Non pour un message de plus de l'officine pendant qu'elle n'a pas de réponse, tant
 * que le dernier e-mail date de moins de dix minutes : l'équipe est déjà prévenue.
 */
export function shouldAlertSupport(input: { isNewThread: boolean; previousMessageFrom: SupportAuthorCode | null; supportAlertedAt: Date | null; now: Date }): boolean {
  if (input.isNewThread || input.previousMessageFrom === "SUPPORT") return true;
  if (!input.supportAlertedAt) return true;
  return input.now.getTime() - input.supportAlertedAt.getTime() >= SUPPORT_ALERT_COOLDOWN_MS;
}
