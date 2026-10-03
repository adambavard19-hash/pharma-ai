/**
 * Une faute de frappe dans le domaine d'une adresse e-mail (« gmial.com »,
 * « orange.fe ») fait partir le contrat dans le vide. On la signale et l'on
 * propose la correction ; la personne décide, rien n'est corrigé d'office.
 */
const COMMON_DOMAINS = [
  "gmail.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "hotmail.fr",
  "hotmail.com",
  "outlook.fr",
  "outlook.com",
  "live.fr",
  "yahoo.fr",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "bbox.fr",
  "neuf.fr",
  "aol.com",
  "proton.me",
  "protonmail.com",
];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** L'adresse corrigée si le domaine ressemble de très près à un domaine courant, sinon `null`. */
export function suggestEmailCorrection(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return null;
  const domain = value.slice(at + 1);
  if (COMMON_DOMAINS.includes(domain)) return null;
  let best: { domain: string; score: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const score = distance(domain, candidate);
    if (score <= (candidate.length > 8 ? 2 : 1) && (!best || score < best.score)) best = { domain: candidate, score };
  }
  return best ? `${value.slice(0, at)}@${best.domain}` : null;
}
