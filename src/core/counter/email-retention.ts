/**
 * Combien de temps l'adresse e-mail donnée au comptoir pour le bilan peut rester en base.
 *
 * Elle ne sert qu'à UN envoi : elle est effacée à « Vente terminée », dans la même écriture que l'issue du bilan (parti, simulé,
 * en échec ou rien à envoyer). Une vente jamais terminée ne la garde pas pour autant : le passage quotidien efface les adresses
 * données il y a plus de COUNTER_EMAIL_PURGE_AFTER_HOURS heures, vente terminée ou non.
 *
 * Pourquoi 23 h et pas 48 : le passage quotidien ne tourne qu'une fois par jour, et l'hébergeur (formule Hobby de Vercel) le lance
 * n'importe quand dans son heure. Deux passages peuvent donc être espacés de près de 25 h ; une adresse qui a 22 h 59 au premier
 * est effacée au suivant, avant ses 48 h. C'est la durée écrite sur la page Confidentialité, et le test le vérifie.
 *
 * Module pur : aucune base, aucune horloge.
 */

/** La promesse publique : aucune adresse du bilan n'est gardée au-delà, même si la vente n'a jamais été terminée. */
export const COUNTER_EMAIL_MAX_HOURS = 48;

/** L'écart le plus long entre deux passages quotidiens : 24 h, plus l'heure de départ que l'hébergeur laisse libre. */
export const DAILY_PASS_MAX_GAP_HOURS = 25;

/** L'âge à partir duquel le passage quotidien efface une adresse : la promesse tient même avec deux passages espacés au maximum. */
export const COUNTER_EMAIL_PURGE_AFTER_HOURS = COUNTER_EMAIL_MAX_HOURS - DAILY_PASS_MAX_GAP_HOURS;

/** Les adresses données avant cet instant sont effacées par le passage quotidien. */
export function counterEmailPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - COUNTER_EMAIL_PURGE_AFTER_HOURS * 3_600_000);
}
