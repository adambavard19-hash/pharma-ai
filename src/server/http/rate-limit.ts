import "server-only";

/**
 * Une limite de débit en mémoire, par instance : assez pour qu'un formulaire
 * public ne serve pas de relais vers un service tiers. Ce n'est pas une
 * protection distribuée.
 */
const buckets = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
  if (stamps.length >= max) {
    buckets.set(key, stamps);
    return true;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (!v.some((at) => now - at < windowMs)) buckets.delete(k);
  }
  return false;
}

/** L'adresse IP du visiteur, telle que la plateforme d'hébergement la transmet. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "inconnue";
}
