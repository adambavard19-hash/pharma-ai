/**
 * La mise à jour de l'agent par lui-même : plus jamais « quitter l'icône puis la rouvrir ».
 *
 * L'icône (PharmaBoost.exe) met déjà l'agent à jour, mais seulement à son démarrage puis toutes les six heures : après
 * chaque publication, la pharmacienne devait la quitter et la relancer. L'agent, lui, tourne en permanence : il demande à
 * PharmaBoost, toutes les deux minutes, si une version plus récente existe ; si oui, il la télécharge, vérifie son
 * empreinte SHA-256, remplace son propre fichier — EXACTEMENT comme l'icône le fait (fichier de secours `.previous`,
 * marqueur `pharmaboost-maj.txt`) — puis s'arrête. L'icône le relance aussitôt avec le nouveau fichier ; et si la nouvelle
 * version s'arrête trois fois de suite, c'est elle qui revient à l'ancienne et ne la réinstalle plus (`pharmaboost-refusee.txt`).
 *
 * Garde-fous : jamais depuis un serveur en clair (https, ou le poste de développement), jamais un fichier dont l'empreinte
 * n'est pas celle annoncée, jamais en pleine vente (voir `canUpdateNow`), jamais une version déjà refusée.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, win32 } from "node:path";

export type SelfUpdateResult = { status: "uptodate" | "updated" | "skipped" | "failed"; detail: string; sha?: string };

export const UPDATE_CHECK_EVERY_MS = 120_000;
/** On ne remplace jamais l'agent dans les trente secondes qui suivent un bip : une vente est peut-être en cours. */
export const QUIET_AFTER_SCAN_MS = 30_000;
const MAX_AGENT_BYTES = 3_000_000;

/** Jamais de code téléchargé depuis un serveur en clair : https, ou le poste de développement (boucle locale). */
export function isTrustedServer(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Peut-on redémarrer l'agent sans gêner personne ? Aucune vente suivie, aucun bip en file ni récent, aucun conseil qui attend. */
export function canUpdateNow(state: { watching: boolean; queuedScans: number; lastScanAt: number | null; pendingNotices: number; now: number }): boolean {
  if (state.watching || state.queuedScans > 0 || state.pendingNotices > 0) return false;
  return state.lastScanAt === null || state.now - state.lastScanAt >= QUIET_AFTER_SCAN_MS;
}

/** L'agent qui tourne est-il celui qu'une installation de poste a posé (à côté de sa configuration) ? Sinon, jamais de remplacement. */
export function isInstalledAgent(agentPath: string | undefined, configPath: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "win32" || !agentPath) return false;
  // Chemins Windows : `win32.dirname` lit les « \ » où qu'on s'exécute (les essais tournent aussi hors Windows).
  return /pharmaboost-connect\.js$/i.test(agentPath) && win32.dirname(agentPath).toLowerCase() === win32.dirname(configPath).toLowerCase();
}

export async function selfUpdate(options: { serverUrl: string; agentPath: string; fetchImpl?: typeof fetch }): Promise<SelfUpdateResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.serverUrl.replace(/\/$/, "");
  if (!isTrustedServer(base)) return { status: "skipped", detail: "serveur non sûr (ni https, ni poste de développement)" };
  if (!existsSync(options.agentPath)) return { status: "skipped", detail: "fichier de l'agent introuvable" };

  try {
    const meta = (await (await fetchImpl(`${base}/api/agent/version`, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } })).json()) as { sha256?: unknown; version?: unknown };
    const wanted = typeof meta.sha256 === "string" ? meta.sha256.toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(wanted)) return { status: "skipped", detail: "empreinte annoncée illisible" };

    const current = sha256(readFileSync(options.agentPath));
    if (current === wanted) return { status: "uptodate", detail: "à jour", sha: current };

    const dir = dirname(options.agentPath);
    const refusedPath = join(dir, "pharmaboost-refusee.txt");
    if (existsSync(refusedPath) && readFileSync(refusedPath, "utf8").trim() === wanted) return { status: "skipped", detail: "cette version n'a pas tenu sur ce poste : elle n'est pas réinstallée", sha: wanted };

    const response = await fetchImpl(`${base}/api/agent/fichiers/pharmaboost-connect.js`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { status: "failed", detail: `téléchargement refusé (HTTP ${response.status})` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_AGENT_BYTES) return { status: "failed", detail: "fichier reçu de taille anormale" };
    if (sha256(bytes) !== wanted) return { status: "failed", detail: "l'empreinte du fichier reçu n'est pas celle annoncée : mise à jour ignorée" };

    // Le même protocole que l'icône (Updater.Apply) : prêt à côté, l'ancien gardé, le nouveau en place, le marqueur écrit.
    const staged = `${options.agentPath}.new`;
    writeFileSync(staged, bytes);
    copyFileSync(options.agentPath, `${options.agentPath}.previous`);
    copyFileSync(staged, options.agentPath);
    unlinkSync(staged);
    writeFileSync(join(dir, "pharmaboost-maj.txt"), wanted);
    return { status: "updated", detail: `nouvelle version ${typeof meta.version === "string" ? meta.version : ""} installée`.trim(), sha: wanted };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
