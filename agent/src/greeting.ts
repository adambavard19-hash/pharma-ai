/**
 * Le bonjour du robot (demande du fondateur, 13 oct. 2026) : chaque matin, quand le poste s'allume et que la personne
 * ouvre sa session, l'île s'ouvre doucement sur le robot, joyeux, qui lui dit bonjour.
 *
 *  - au démarrage de l'agent (ouverture de session Windows), au plus UNE fois par jour et par poste : un fichier témoin
 *    daté, à côté de la configuration (comme celui de la liaison de l'espace, space-link.ts) ;
 *  - dans l'île seulement : ni la bannière GDI+, ni l'ancienne fenêtre, ni la notification Windows ne le montrent (un
 *    bonjour n'est pas une information à faire passer coûte que coûte, et aucune fenêtre de secours ne doit risquer de
 *    prendre le clavier au logiciel de gestion) ;
 *  - jamais pendant une vente : tant qu'une vente est en cours, il attend le prochain moment calme (dans la fenêtre du
 *    démarrage) ; si un bip arrive pendant qu'il est affiché, le scan passe devant et le bonjour est abandonné pour la
 *    journée (le témoin est déjà écrit).
 *
 * Le prénom vient du serveur (signe de vie : la personne attribuée à ce poste), jamais le nom de famille.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GREETING_STARTUP_WINDOW_MS } from "./greeting-text";

export { GREETING_NAME_MAX, GREETING_SHOW_MS, GREETING_STARTUP_WINDOW_MS, cleanFirstName, greetingText } from "./greeting-text";

/** Le fichier témoin : la date (AAAA-MM-JJ, heure locale du poste) du dernier bonjour montré. */
export const GREETING_FILE = "pharmaboost-bonjour.txt";

/** La date du jour sur le poste (heure locale) : « 2026-10-13 ». */
export function localDay(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function greetedToday(configDir: string, now: Date = new Date()): boolean {
  try {
    const path = join(configDir, GREETING_FILE);
    return existsSync(path) && readFileSync(path, "utf8").split(/\s+/)[0] === localDay(now);
  } catch {
    return false;
  }
}

export function markGreeted(configDir: string, now: Date = new Date()): void {
  try {
    writeFileSync(join(configDir, GREETING_FILE), `${localDay(now)} ${now.toISOString()}\n`);
  } catch {
    // Sans témoin, le bonjour pourrait revenir au prochain démarrage du jour : une gêne, jamais une panne.
  }
}

/**
 * Faut-il dire bonjour maintenant ? Une fois par jour, dans la fenêtre du démarrage, quand l'île est prête à le montrer,
 * qu'aucune vente n'est en cours, et après un premier signe de vie réussi (le prénom et le robot de la personne sont connus).
 */
export function shouldGreet(state: { greetedToday: boolean; islandReady: boolean; saleInProgress: boolean; heartbeatOk: boolean; sinceStartMs: number }): boolean {
  return !state.greetedToday && state.islandReady && !state.saleInProgress && state.heartbeatOk && state.sinceStartMs >= 0 && state.sinceStartMs <= GREETING_STARTUP_WINDOW_MS;
}
