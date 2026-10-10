/**
 * Un frein simple pour les formulaires publics : quelques essais par minute et par clé (adresse IP, adresse e-mail). En mémoire, donc propre
 * à chaque instance — il arrête l'emballement d'un script, pas un attaquant patient : les garde-fous qui comptent (plafond de demandes en
 * attente, jeton à usage unique, approbation du titulaire) sont en base.
 */
const recent = new Map<string, number[]>();

export function throttled(key: string, max = 6, windowMs = 60_000, now = Date.now()): boolean {
  const stamps = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= max) {
    recent.set(key, stamps);
    return true;
  }
  stamps.push(now);
  recent.set(key, stamps);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t >= windowMs)) recent.delete(k);
  return false;
}
