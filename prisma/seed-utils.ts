/**
 * Utilitaires du seed.
 *
 * Ces fonctions dupliquent volontairement la logique de
 * `src/server/security/*` en version synchrone : le seed s'exécute hors du
 * contexte Next.js et ne peut pas importer les modules marqués `server-only`.
 * Les FORMATS produits sont strictement identiques, afin que l'application
 * relise sans conversion ce que le seed a écrit.
 */

import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 };

export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, 64, SCRYPT_PARAMS);
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY ?? "";
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptFieldSync(plaintext: string | null): string | null {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".")
  );
}

export function encryptListSync(values: string[]): string | null {
  if (values.length === 0) return null;
  return encryptFieldSync(JSON.stringify(values));
}
