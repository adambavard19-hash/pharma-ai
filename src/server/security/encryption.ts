import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * Chiffrement applicatif des champs de santé les plus sensibles
 * (allergies, pathologies, notes du pharmacien).
 *
 * AES-256-GCM : confidentialité + authentification. Le chiffrement au niveau de
 * l'application s'ajoute au chiffrement au repos de l'hébergeur ; il garantit
 * qu'un accès en lecture à la base — sauvegarde, export, réplication — ne
 * suffit pas à lire ces champs.
 *
 * ⚠️ La rotation de `DATA_ENCRYPTION_KEY` nécessite un déchiffrement/re-
 * chiffrement de l'existant. Voir docs/SECURITE.md.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = getEnv().DATA_ENCRYPTION_KEY;
  // Une clé base64 de 32 octets est utilisée telle quelle ; toute autre valeur
  // est dérivée par SHA-256 afin d'obtenir systématiquement 32 octets.
  const decoded = Buffer.from(raw, "base64");
  cachedKey = decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
  return cachedKey;
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
      ".",
    )
  );
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (!stored.startsWith(PREFIX)) {
    // Valeur écrite avant l'activation du chiffrement : renvoyée telle quelle
    // afin de ne jamais perdre de donnée patient.
    return stored;
  }

  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Clé incorrecte ou donnée altérée : on ne renvoie jamais de contenu douteux.
    return null;
  }
}

/** Chiffre une liste (allergies, pathologies) sérialisée en JSON. */
export function encryptList(values: string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return encryptField(JSON.stringify(values));
}

export function decryptList(stored: string | null | undefined): string[] {
  const raw = decryptField(stored);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
