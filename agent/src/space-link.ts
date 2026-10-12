/**
 * « Ouvrir mon espace PharmaBoost » : 1 robot pour 1 espace (demande du fondateur, 13 oct. 2026). Le poste ouvre, dans le
 * navigateur par défaut de SON PC, un lien à usage unique que PharmaBoost lui donne (/api/agent/espace) : le navigateur est
 * alors lié à ce poste, et la personne qui s'y connecte prend le comptoir, sans rien choisir (src/core/counter/post-link.ts).
 *
 *  - au démarrage de l'agent (ce qui comprend le redémarrage après une mise à jour automatique), UNE fois par PC : s'il ne
 *    l'a jamais fait pour cette clé (fichier témoin à côté de la configuration) et qu'aucune vente n'est en cours ;
 *  - à la demande, par l'icône près de l'horloge → « Ouvrir mon espace PharmaBoost » (le mot ESPACE de la fenêtre).
 *
 * L'adresse ouverte est TOUJOURS celle du serveur de l'agent (https, ou le poste de développement), avec un jeton fait des
 * seuls caractères [A-Za-z0-9_-] : rien qui puisse être lu comme une commande. Sous Windows, elle part à
 * `rundll32 url.dll,FileProtocolHandler` en argument d'un processus lancé SANS invite de commandes : pas de « cmd /c start »,
 * un « & » ne coupe rien.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isTrustedServer } from "./self-update";

/** Le fichier témoin, à côté de la configuration : ce PC a déjà ouvert l'espace pour cette clé de poste. */
export const SPACE_LINK_FILE = "pharmaboost-espace-lie.txt";
/** Au démarrage, quelques essais au plus (serveur injoignable) ; ensuite seule l'icône le refait. */
export const SPACE_LINK_STARTUP_ATTEMPTS = 3;

/** L'empreinte courte de la clé du poste : un PC réinstallé (nouvelle clé) se relie une fois de plus ; la clé n'est jamais écrite. */
export function spaceWitness(agentKey: string): string {
  return createHash("sha256").update(`espace:${agentKey}`).digest("hex").slice(0, 32);
}

export function isSpaceLinked(configDir: string, agentKey: string): boolean {
  try {
    const path = join(configDir, SPACE_LINK_FILE);
    return existsSync(path) && readFileSync(path, "utf8").split(/\s+/)[0] === spaceWitness(agentKey);
  } catch {
    return false;
  }
}

export function markSpaceLinked(configDir: string, agentKey: string, now = new Date()): void {
  try {
    writeFileSync(join(configDir, SPACE_LINK_FILE), `${spaceWitness(agentKey)} ${now.toISOString()}\n`);
  } catch {
    // Sans témoin, l'espace se rouvrira au prochain démarrage : une gêne, jamais une panne.
  }
}

/**
 * Au démarrage : ouvrir l'espace ? Sur Windows (le PC du comptoir) seulement, s'il n'a jamais été lié pour cette clé,
 * qu'aucune vente n'est en cours (rien ne s'ouvre par-dessus le logiciel de gestion pendant un patient), et dans la
 * limite des essais.
 */
export function shouldOpenSpaceAtStartup(state: { platform: NodeJS.Platform; linked: boolean; saleInProgress: boolean; attempts: number }): boolean {
  return state.platform === "win32" && !state.linked && !state.saleInProgress && state.attempts < SPACE_LINK_STARTUP_ATTEMPTS;
}

/** L'adresse à ouvrir : le serveur de l'agent (sûr), le chemin fixe, le jeton tel quel (ses caractères sont vérifiés). Null : on n'ouvre rien. */
export function spaceUrl(serverUrl: string, jeton: unknown): string | null {
  if (typeof jeton !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(jeton)) return null;
  const base = serverUrl.replace(/\/+$/, "");
  if (!isTrustedServer(base)) return null;
  let parsed: URL;
  try {
    parsed = new URL(`${base}/comptoir/lier?jeton=${jeton}`);
  } catch {
    return null;
  }
  // Le serveur ne porte ni identifiant, ni chemin, ni requête : seulement un nom (et un port). Rien d'autre ne s'ouvre.
  if (parsed.username || parsed.password || parsed.pathname !== "/comptoir/lier" || parsed.search !== `?jeton=${jeton}` || parsed.hash) return null;
  return parsed.toString();
}

/** Le programme qui ouvre une adresse dans le navigateur par défaut, et ses arguments (jamais une ligne de commande à interpréter). */
export function browserCommand(url: string, platform: NodeJS.Platform): { file: string; args: string[] } {
  if (platform === "win32") return { file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
  if (platform === "darwin") return { file: "open", args: [url] };
  return { file: "xdg-open", args: [url] };
}

export type Spawner = (file: string, args: string[], options: { detached: boolean; stdio: "ignore"; windowsHide: boolean; shell: false }) => { unref(): void; on(event: "error", listener: (error: Error) => void): unknown };

/**
 * Ouvre l'adresse dans le navigateur par défaut ; vrai si le programme a pu être lancé. Jamais `windowsHide` : rundll32 n'a
 * pas de fenêtre à lui, mais il transmet sa consigne d'affichage au navigateur qu'il lance — cachée, elle ouvrirait le
 * navigateur caché ou en arrière-plan.
 */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform, spawner: Spawner = spawn as unknown as Spawner): boolean {
  const { file, args } = browserCommand(url, platform);
  try {
    const child = spawner(file, args, { detached: true, stdio: "ignore", windowsHide: false, shell: false });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
