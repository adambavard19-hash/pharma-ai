import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
