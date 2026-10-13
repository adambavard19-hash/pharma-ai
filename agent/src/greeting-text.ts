/**
 * Le bonjour du robot : le texte et ses réglages, sans rien lire ni écrire sur le disque — partagé par l'agent
 * (greeting.ts), le serveur (signe de vie) et l'île (page /poste/ile, dans le navigateur).
 */

/** Combien de temps le message reste affiché dans l'île avant qu'elle revienne au repos. */
export const GREETING_SHOW_MS = 9000;
/**
 * Le bonjour n'a de sens qu'au démarrage : au-delà de deux heures après le lancement de l'agent (une vente qui n'en finit
 * pas, une île qui a mis du temps à se préparer), il n'est plus montré ce jour-là.
 */
export const GREETING_STARTUP_WINDOW_MS = 2 * 60 * 60_000;
/** Le prénom le plus long qu'on affiche. */
export const GREETING_NAME_MAX = 40;

/** Le prénom tel qu'on l'affiche : une ligne, sans caractère de contrôle, borné ; vide si rien de lisible. */
export function cleanFirstName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GREETING_NAME_MAX)
    .trim();
}

/** Le message du robot, avec le prénom quand le serveur le connaît. */
export function greetingText(firstName?: string | null): string {
  const name = cleanFirstName(firstName);
  return `Bonjour${name ? ` ${name}` : ""}, comment vas-tu ? Bon courage pour faire le plus de conseils possibles. N'hésite pas à me demander ce que tu veux si tu as besoin.`;
}
