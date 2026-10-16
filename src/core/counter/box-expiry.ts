/**
 * La péremption d'une boîte bipée au comptoir, lue dans son Datamatrix par la douchette du poste.
 *
 * La bannière ne parle que de ce qui compte devant le client : une boîte PÉRIMÉE (à ne pas donner), ou qui périme dans le
 * mois (à vérifier selon la durée du traitement). Une boîte à la date lointaine ne dit rien. Les jours se comptent au
 * calendrier de la France métropolitaine.
 */

/** Une boîte qui périme dans moins de 30 jours mérite un regard. */
export const BOX_EXPIRY_SOON_DAYS = 30;

export type BoxExpiry = { on: string; state: "expired" | "soon" };

/** La péremption reçue de l'agent (« 2027-03-31 ») : une vraie date du calendrier, entre 2000 et 2099, sinon rien. */
export function parseExpiry(value: unknown): Date | null {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Aujourd'hui, à Paris (« 2026-10-15 »). */
function parisDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Ce que la bannière dit de la boîte : « expired » si sa date est passée (une boîte se donne jusqu'à sa date incluse),
 * « soon » si elle tombe dans les 30 jours, rien sinon.
 */
export function boxExpiry(expiresOn: Date | null | undefined, now: Date): BoxExpiry | null {
  if (!expiresOn) return null;
  const on = expiresOn.toISOString().slice(0, 10);
  const today = parisDay(now);
  if (on < today) return { on, state: "expired" };
  const days = Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= BOX_EXPIRY_SOON_DAYS ? { on, state: "soon" } : null;
}
