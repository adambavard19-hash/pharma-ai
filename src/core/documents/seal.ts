/**
 * Le plan scellé : chiffré avec une clé que le serveur ne garde pas.
 *
 * La clé est tirée au hasard pour chaque plan et ne vit que dans le lien,
 * après le dièse (`/plan/<id>#<clé>`) — la partie d'une adresse qu'un
 * navigateur n'envoie jamais au serveur. PharmaBoost conserve donc un contenu
 * qu'il est incapable de lire, sans nom, sans adresse, effacé à l'échéance.
 * C'est ce qui permet de remettre un plan de prise au patient sans héberger
 * de donnée de santé rattachée à une personne.
 *
 * AES-256-GCM, format stable : le navigateur du patient déchiffre avec
 * WebCrypto (voir `src/app/(public)/plan/[id]/plan-viewer.tsx`).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DocumentContent } from "./types";

export const SEAL_ALGORITHM = "aes-256-gcm";
/** Durée de vie d'un plan scellé : un traitement long tient en trois mois. */
export const SEALED_DOCUMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type SealedPayload = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Buffer {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Chiffre le plan ; la clé rendue ne doit être ni journalisée ni conservée. */
export function sealContent(content: DocumentContent): { key: string; payload: SealedPayload } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv(SEAL_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(content), "utf8")), cipher.final()]);
  return { key: toBase64Url(key), payload: { ciphertext, iv, tag: cipher.getAuthTag() } };
}

/** Le chemin inverse, utilisé par les tests : le navigateur fait la même chose en WebCrypto. */
export function unsealContent(payload: SealedPayload, key: string): DocumentContent {
  const decipher = createDecipheriv(SEAL_ALGORITHM, fromBase64Url(key), payload.iv);
  decipher.setAuthTag(payload.tag);
  const plain = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as DocumentContent;
}

/** L'adresse remise au patient : l'identifiant dans le chemin, la clé après le dièse. */
export function buildSealedUrl(baseUrl: string, id: string, key: string, query?: Record<string, string>): string {
  const params = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : "";
  return `${baseUrl.replace(/\/$/, "")}/plan/${id}${params}#${key}`;
}
