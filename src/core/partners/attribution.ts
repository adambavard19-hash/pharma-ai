/**
 * Identifiant d'attribution PharmaBoost.
 *
 * Chaque prise de contact, ouverture du portail B2B ou commande reçoit un code
 * unique — « PB-7K3M-Q9TD » — transmis au partenaire avec la demande. C'est
 * lui, et lui seul, qui prouve que l'affaire vient de PharmaBoost : il ne
 * contient ni l'officine, ni l'utilisateur, ni rien du patient.
 *
 * Pur : l'aléa est fourni par l'appelant (crypto côté serveur), ce qui rend le
 * format testable.
 */

/** Sans 0/O ni 1/I/L : un code dicté au téléphone ne se lit pas de travers. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const ATTRIBUTION_CODE_PATTERN = /^PB-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export function attributionCodeFrom(random: Uint8Array): string {
  if (random.length < 8) throw new Error("attributionCodeFrom : 8 octets aléatoires attendus");
  const chars = Array.from(random.slice(0, 8), (byte) => ALPHABET[byte % ALPHABET.length]);
  return `PB-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/**
 * Le lien B2B du partenaire, avec l'identifiant d'attribution à la place de
 * `{code}`. Sans `{code}` dans le modèle, il est ajouté en paramètre `pb`.
 * Seuls les liens https sont acceptés.
 */
export function b2bLinkFor(template: string, code: string): string | null {
  const filled = template.includes("{code}") ? template.split("{code}").join(encodeURIComponent(code)) : template;
  let url: URL;
  try {
    url = new URL(filled);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!template.includes("{code}")) url.searchParams.set("pb", code);
  return url.toString();
}
