/**
 * L'armoire à pharmacie de l'inscrit : rangée sur SON téléphone (stockage du navigateur), jamais envoyée à PharmaBoost —
 * aucune donnée de santé ne quitte l'appareil. Ce qu'on garde : le nom, le code lu, le mois de péremption imprimé.
 */
export type CabinetItem = { id: string; name: string; code: string | null; expiresOn: string | null; addedAt: string };

const KEY = "pb-armoire";

export function readCabinet(): CabinetItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CabinetItem[]) : [];
    return Array.isArray(list) ? list.filter((item) => item && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

export function writeCabinet(items: CabinetItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200)));
  } catch {
    // Stockage indisponible (navigation privée) : l'armoire reste vide, rien ne casse.
  }
}

/** « 2026-11 » → l'état de la boîte aujourd'hui : périmée, périme dans les 30 jours, ou bonne. Fin du mois imprimé incluse. */
export function expiryState(expiresOn: string | null, now: Date): "expired" | "soon" | "ok" | "unknown" {
  if (!expiresOn || !/^\d{4}-\d{2}$/.test(expiresOn)) return "unknown";
  const [year, month] = expiresOn.split("-").map(Number);
  const end = new Date(year, month, 0, 23, 59, 59);
  if (end < now) return "expired";
  return end.getTime() - now.getTime() <= 30 * 86_400_000 ? "soon" : "ok";
}

export function monthLabel(expiresOn: string): string {
  const [year, month] = expiresOn.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
