/**
 * Les nouveautés d'une officine pour les patients qui l'ont demandé.
 *
 * Les durées et les limites sont ici, et nulle part ailleurs : l'e-mail, les
 * pages publiques et le service les lisent au même endroit, de sorte que le
 * texte dit au patient (« 36 mois ») est toujours celui que le serveur applique.
 */

/** Version du texte d'information présenté au patient ; elle est enregistrée avec son accord. */
export const PATIENT_NEWS_NOTICE_VERSION = "v1";

/** Durée de vie du lien d'abonnement : celle du plan scellé qui le porte. */
export const NEWS_OPT_IN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Le lien de désinscription reste valable des années : un message ancien doit toujours pouvoir y mener. */
export const NEWS_UNSUBSCRIBE_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/** Au plus une annonce par officine tous les 7 jours : appliqué côté serveur, jamais seulement à l'écran. */
export const NEWS_MIN_INTERVAL_DAYS = 7;

/** Conservation de l'adresse : 36 mois après le consentement, puis purge. */
export const NEWS_RETENTION_MONTHS = 36;

export const NEWS_LIMITS = { title: 90, range: 80, message: 600 } as const;

/** Combien d'e-mails partent en parallèle. */
export const NEWS_SEND_BATCH = 5;

/** Temps d'envoi accordé à un appel (une action serveur ne dure pas indéfiniment) ; le reste est repris. */
export const NEWS_SEND_BUDGET_MS = 45_000;

/** Une annonce encore en cours d'envoi depuis plus de 5 minutes est reprise par le passage quotidien. */
export const NEWS_STUCK_AFTER_MS = 5 * 60 * 1000;

/**
 * Une réservation d'envoi restée sans issue au-delà de ce délai est un envoi
 * interrompu. On ne sait pas si le message est parti : il n'est jamais rejoué.
 */
export const NEWS_CLAIM_STALE_MS = 10 * 60 * 1000;
