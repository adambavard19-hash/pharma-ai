import "server-only";

// Vingt questions par dix minutes et par administrateur (mémoire de l'instance) : contre une boucle ou un clic fou.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

export function assistantThrottled(adminId: string, now = Date.now()): boolean {
  const stamps = (recent.get(adminId) ?? []).filter((at) => now - at < WINDOW_MS);
  const limited = stamps.length >= MAX_PER_WINDOW;
  if (!limited) stamps.push(now);
  recent.set(adminId, stamps);
  return limited;
}
