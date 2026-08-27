import "server-only";
import { headers } from "next/headers";

/**
 * Métadonnées de la requête courante (adresse IP, agent utilisateur).
 *
 * Volontairement isolé du module de session : le journal d'audit et les
 * services métier en ont besoin, mais ne doivent pas dépendre de la navigation
 * Next.js. Cette séparation les garde exécutables hors du cycle d'une requête
 * — pour un script de vérification ou une tâche planifiée.
 */
export type RequestMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};

const EMPTY: RequestMeta = { ipAddress: null, userAgent: null };

export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    return {
      ipAddress: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip"),
      userAgent: headerList.get("user-agent"),
    };
  } catch {
    // Hors du cycle d'une requête (script, tâche planifiée) : pas de métadonnée.
    return EMPTY;
  }
}
