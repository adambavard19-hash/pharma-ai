/**
 * L'état du poste, écrit à côté de la configuration pour l'icône près de
 * l'horloge (PharmaBoost.exe). L'icône ne parle pas au serveur : elle lit ce
 * petit fichier, que l'agent met à jour à chaque signe de vie.
 *
 * Écriture best-effort et atomique (fichier temporaire puis renommage) : l'icône
 * ne lit jamais un fichier à moitié écrit, et un disque en lecture seule ne
 * fait jamais tomber l'agent.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PostState = "ok" | "hors-ligne" | "revoque";

export type PostStatus = {
  etat: PostState;
  /** Quand l'agent a écrit cet état (ISO). Un état vieux de plusieurs minutes veut dire « l'agent ne tourne plus ». */
  at: string;
  version: string;
  poste: string | null;
  officine: string | null;
  /** Ce que l'agent constate et que PharmaBoost doit montrer (dossier vide, export refusé…), ou null. */
  notice: string | null;
};

export const STATUS_FILE_NAME = "pharmaboost-statut.json";

export function statusFilePath(configPath: string): string {
  return join(dirname(configPath), STATUS_FILE_NAME);
}

/** Pourquoi un signe de vie a échoué : clé retirée dans PharmaBoost, ou simplement pas de réseau. */
export function stateForFailure(error: unknown): Exclude<PostState, "ok"> {
  const message = error instanceof Error ? error.message : String(error);
  return /révoquée/i.test(message) ? "revoque" : "hors-ligne";
}

export function writeStatus(configPath: string, status: PostStatus): void {
  const target = statusFilePath(configPath);
  try {
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, JSON.stringify(status));
    renameSync(temporary, target);
  } catch {
    // L'icône est une commodité : sans ce fichier, elle affiche « état inconnu ».
  }
}
