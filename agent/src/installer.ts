/**
 * L'installateur Windows de poste (PharmaBoost-Installation-<jeton>.exe).
 *
 * Le titulaire télécharge un seul fichier, double-clique, et c'est installé.
 * Le jeton du lien d'installation voyage dans le NOM du fichier téléchargé :
 * les octets de l'installateur sont les mêmes pour tout le monde (donc
 * signables une fois pour toutes) et le poste sait à quelle officine il
 * appartient sans que personne n'ait rien à taper.
 *
 * Ce module est pur : il lit un nom de fichier, ou ce qu'une personne a collé
 * quand le nom a été perdu (« Copie de… », fichier renommé).
 */

export const INSTALLER_FILE_PREFIX = "PharmaBoost-Installation-";

/**
 * Ce que `--installer` répond à l'installateur Windows, qui en tire le message
 * à montrer. Les textes sont écrits côté installateur : un canal de console
 * Windows abîme les accents, un code de sortie jamais.
 */
export const INSTALLER_EXIT = {
  ok: 0,
  /** Ni jeton dans le nom du fichier, ni code saisi. */
  noCode: 2,
  /** Le serveur a répondu non : lien expiré, déjà utilisé, code inconnu. */
  refused: 3,
  /** PharmaBoost n'a pas pu être joint : Internet, pare-feu, proxy. */
  unreachable: 4,
} as const;

/** Un jeton de lien d'installation (24 caractères) ou le code à six chiffres d'un poste. */
function isInstallCode(value: string): boolean {
  return /^\d{6}$/.test(value) || /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/**
 * Le jeton porté par le nom du fichier : `PharmaBoost-Installation-<jeton>.exe`.
 * Tolère ce que Windows et les navigateurs ajoutent quand le fichier existe
 * déjà : « … (1).exe », « … - Copie.exe ». `null` quand le nom n'en porte pas.
 */
export function tokenFromInstallerName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const match = new RegExp(`^${INSTALLER_FILE_PREFIX}([A-Za-z0-9_-]+)(?=$|[\\s.(])`, "i").exec(base);
  return match && isInstallCode(match[1]) ? match[1] : null;
}

/**
 * Ce qu'une personne a saisi quand le nom du fichier ne porte pas de jeton :
 * le code à six chiffres (avec ou sans espace), le jeton, ou le lien
 * d'installation collé tel quel (`…/installer/<jeton>`).
 */
export function normalizeInstallCode(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const link = /\/(?:installer|installateur)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(text);
  if (link) return isInstallCode(link[1]) ? link[1] : null;
  const digits = text.replace(/[\s.-]/g, "");
  if (/^\d{6}$/.test(digits)) return digits;
  return isInstallCode(text) ? text : null;
}

/** Le code à utiliser : celui que la personne a saisi s'il y en a un, sinon celui du nom du fichier. */
export function resolveInstallCode(input: { fileName?: string | null; typed?: string | null }): string | null {
  if (input.typed && input.typed.trim()) return normalizeInstallCode(input.typed);
  return input.fileName ? tokenFromInstallerName(input.fileName) : null;
}
