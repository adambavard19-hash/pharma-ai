import "server-only";
import { getEnv } from "@/config/env";

/**
 * Quand un passage de connaissance du stock n'a pas pu tout finir dans le temps d'une fonction, il relance le suivant — une autre
 * invocation, avec son propre temps. L'hébergement n'autorise qu'une tâche planifiée par jour et par tâche : c'est ce chaînage qui
 * permet de lire un gros stock en quelques minutes plutôt qu'en plusieurs nuits. Au pire, la tâche quotidienne reprend le lendemain.
 */

/** Au plus dix relais d'affilée : une panne du modèle ne fait jamais tourner la chaîne indéfiniment. */
export const MAX_CHAIN_DEPTH = 10;

export function continuationUrl(baseUrl: string, options: { pharmacyId?: string; depth: number }): string {
  const url = new URL("/api/cron/connaissance-du-stock", baseUrl);
  if (options.pharmacyId) url.searchParams.set("pharmacie", options.pharmacyId);
  url.searchParams.set("profondeur", String(options.depth));
  return url.toString();
}

/** Envoie la demande du passage suivant, sans attendre qu'il finisse (il a son propre temps). Sans secret ou sans adresse : rien. */
export async function scheduleLearningContinuation(options: { pharmacyId?: string; depth: number }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret || options.depth > MAX_CHAIN_DEPTH) return false;
  let url: string;
  try {
    url = continuationUrl(getEnv().APP_URL, options);
  } catch {
    return false;
  }
  const request = fetchImpl(url, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" }).catch(() => undefined);
  // On laisse deux secondes à la demande pour partir ; la réponse, elle, n'arrive qu'à la fin du passage et ne nous intéresse pas.
  await Promise.race([request, new Promise((resolve) => setTimeout(resolve, 2000))]);
  return true;
}
