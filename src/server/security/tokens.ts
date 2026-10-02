import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * Génération et vérification des jetons opaques (sessions, liens de fiche
 * patient). Le jeton en clair n'est communiqué qu'une fois ; seule son
 * empreinte SHA-256 est persistée, de sorte qu'une fuite de la base ne permette
 * pas de rejouer une session ou d'ouvrir une fiche patient.
 */

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Masque un e-mail pour les journaux : `jean.dupont@ex.fr` → `j***@ex.fr`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Masque un numéro de téléphone : `0612345678` → `06******78`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, 2)}${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

/**
 * Jeton dérivé du secret de l'application : le même sur toutes les instances,
 * recalculable à tout moment, impossible à deviner sans le secret. Sert aux
 * liens durables (contrat) dont on ne garde que l'empreinte.
 */
export function deriveToken(purpose: string): string {
  return createHmac("sha256", getEnv().AUTH_SESSION_SECRET).update(`pharmaboost:${purpose}`).digest("base64url");
}

/** Charge utile signée et datée (lien de confirmation) : rien n'est stocké, la signature fait foi. */
export function signPayload(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, x: Date.now() + ttlMs })).toString("base64url");
  const mac = createHmac("sha256", getEnv().AUTH_SESSION_SECRET).update(`payload:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", getEnv().AUTH_SESSION_SECRET).update(`payload:${body}`).digest("base64url");
  if (!safeCompare(mac, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { x?: number };
    if (typeof data.x !== "number" || data.x < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
