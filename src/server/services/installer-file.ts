import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * L'installateur Windows d'un comptoir : le fichier livré avec le code (`agent/installateur/`), construit par
 * `npm run installateur:construire`, et le manifeste qui le décrit.
 *
 * PharmaBoost ne propose le téléchargement que d'un fichier VÉRIFIÉ : il existe, c'est un exécutable Windows,
 * sa taille et son empreinte SHA-256 sont celles du manifeste. Un fichier absent, tronqué ou remplacé n'est pas
 * servi, et l'écran du pharmacien ne montre pas de bouton qui ne marcherait pas.
 *
 * Ce que ce contrôle ne dit PAS : que l'installateur a été lancé sur un vrai Windows (il ne l'a pas été, ici),
 * ni qu'il est signé (le manifeste le dit : `signe`).
 */

// Chemins à segments littéraux : l'analyse du déploiement sait ainsi quels fichiers embarquer (voir next.config.ts), au lieu
// de tracer tout le projet. Garder ces deux chemins d'accord avec `outputFileTracingIncludes`.
const installerPath = () => join(process.cwd(), "agent", "installateur", "PharmaBoost-Installation.exe");
const manifestPath = () => join(process.cwd(), "agent", "installateur", "installateur.json");

/** Au-dessous, ce n'est pas un installateur (un fichier vide, une page d'erreur enregistrée par erreur). */
const MIN_BYTES = 100_000;

export type InstallerInfo = {
  bytes: number;
  sha256: string;
  /** Version de l'installateur et de PharmaBoost Connect qu'il pose. */
  version: string;
  agent: string;
  signed: boolean;
  builtAt: string | null;
};

export type InstallerStatus = ({ available: true } & InstallerInfo) | { available: false; reason: string };

/** Pur : le fichier est-il bien celui que décrit le manifeste ? */
export function verifyInstaller(bytes: Uint8Array, manifest: unknown): { ok: true; info: InstallerInfo } | { ok: false; reason: string } {
  const m = manifest && typeof manifest === "object" ? (manifest as Record<string, unknown>) : null;
  if (!m || typeof m.sha256 !== "string" || typeof m.taille !== "number" || typeof m.version !== "string") return { ok: false, reason: "Le manifeste de l'installateur est absent ou illisible." };
  if (bytes.length < MIN_BYTES) return { ok: false, reason: "Le fichier de l'installateur est trop petit pour en être un." };
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return { ok: false, reason: "Le fichier de l'installateur n'est pas un exécutable Windows." };
  if (bytes.length !== m.taille) return { ok: false, reason: "La taille de l'installateur ne correspond pas à son manifeste." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== m.sha256.toLowerCase()) return { ok: false, reason: "L'empreinte de l'installateur ne correspond pas à son manifeste." };
  return {
    ok: true,
    info: { bytes: bytes.length, sha256, version: m.version, agent: typeof m.agent === "string" ? m.agent : "", signed: m.signe === true, builtAt: typeof m.construitLe === "string" ? m.construitLe : null },
  };
}

/** Le fichier et son état : lu, vérifié. Les octets ne sont lus que pour être servis. */
export async function loadInstaller(): Promise<{ status: InstallerStatus; bytes: Uint8Array | null }> {
  try {
    const [bytes, manifest] = await Promise.all([readFile(installerPath()), readFile(manifestPath(), "utf8")]);
    const verdict = verifyInstaller(bytes, JSON.parse(manifest));
    if (!verdict.ok) return { status: { available: false, reason: verdict.reason }, bytes: null };
    return { status: { available: true, ...verdict.info }, bytes };
  } catch {
    return { status: { available: false, reason: "Le fichier de l'installateur n'est pas livré avec cette version de PharmaBoost." }, bytes: null };
  }
}

let cached: { key: string; status: InstallerStatus } | null = null;

/** L'état seul, pour les écrans : relu seulement quand le fichier change (date et taille). */
export async function installerStatus(): Promise<InstallerStatus> {
  try {
    const [exe, manifest] = await Promise.all([stat(installerPath()), stat(manifestPath())]);
    const key = `${exe.mtimeMs}:${exe.size}:${manifest.mtimeMs}`;
    if (cached?.key === key) return cached.status;
    const { status } = await loadInstaller();
    cached = { key, status };
    return status;
  } catch {
    return { available: false, reason: "Le fichier de l'installateur n'est pas livré avec cette version de PharmaBoost." };
  }
}

/** La réponse de téléchargement : le jeton de l'installation voyage dans le NOM du fichier, les octets sont les mêmes pour tous. */
export function installerResponse(bytes: Uint8Array, fileName: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
