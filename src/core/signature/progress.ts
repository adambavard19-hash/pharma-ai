import type { SignatureStatus } from "./ports";

/**
 * Un contrat avance, il ne recule pas : quand le second signataire ouvre sa
 * demande, le contrat déjà « Signé pharmacie » ne redevient pas « Ouvert ».
 * Refus et expiration s'appliquent tant que le contrat n'est pas finalisé.
 */
const PROGRESS: Record<string, number> = { DRAFT: 0, SENT: 1, OPENED: 2, SIGNED_PHARMACY: 3, SIGNED_COMPANY: 3, FINALIZED: 4 };

export function shouldApplySignatureStatus(current: string, next: SignatureStatus): boolean {
  if (current === next || current === "FINALIZED") return false;
  if (next === "REFUSED" || next === "EXPIRED") return true;
  if (current === "REFUSED" || current === "EXPIRED") return false;
  return (PROGRESS[next] ?? 0) > (PROGRESS[current] ?? 0);
}

/** Où ranger la version signée, à côté du contrat d'origine. */
export function signedContractKey(fileKey: string): string {
  return `${fileKey.replace(/\.pdf$/i, "")}-signe.pdf`;
}
