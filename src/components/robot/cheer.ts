import { PENDING_CHEER_KEY } from "@/core/robot/companion";

/** Demande au compagnon de faire la fête sur la PROCHAINE page (la vente terminée ouvre la page de fin). */
export function cheerOnNextPage(): void {
  try {
    window.sessionStorage.setItem(PENDING_CHEER_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : pas de fête, rien d'autre ne change.
  }
}
