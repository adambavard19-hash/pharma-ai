/**
 * Le mot de passe de l'officine : un seul par pharmacie, donné par le titulaire à son équipe. Chacun se connecte sur son poste
 * avec SON adresse e-mail (que le titulaire a ajoutée dans Mon équipe) et ce mot de passe.
 *
 * Il se tape sur chaque poste : des lettres et des chiffres sans ambiguïté (ni O/0, ni I/1/L), en trois groupes de quatre,
 * et la saisie est tolérante (minuscules, espaces, tirets, tout est accepté). 12 caractères sur 31 symboles : environ 59 bits.
 */

export const TEAM_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;

/** Un nouveau mot de passe d'officine (« K7MP-Q3XA-9RTD »), tiré de `randomByte` (un octet aléatoire de 0 à 255). */
export function generateTeamPassword(randomByte: () => number): string {
  const chars: string[] = [];
  const size = TEAM_PASSWORD_ALPHABET.length;
  // Rejet des octets au-delà du dernier multiple de la taille de l'alphabet : chaque symbole a exactement la même chance.
  const limit = 256 - (256 % size);
  while (chars.length < GROUPS * GROUP_LENGTH) {
    const byte = randomByte();
    if (byte < limit) chars.push(TEAM_PASSWORD_ALPHABET[byte % size]);
  }
  return Array.from({ length: GROUPS }, (_, index) => chars.slice(index * GROUP_LENGTH, (index + 1) * GROUP_LENGTH).join("")).join("-");
}

/** La forme comparée : majuscules, sans espaces ni tirets. « k7mp q3xa-9rtd » et « K7MP-Q3XA-9RTD » sont le même mot de passe. */
export function normalizeTeamPassword(raw: string): string {
  return raw.normalize("NFKC").toUpperCase().replace(/[\s\-_.]/g, "");
}

/** Ce qui peut être un mot de passe d'officine (sinon, inutile de calculer quoi que ce soit). */
export function looksLikeTeamPassword(raw: string): boolean {
  const normalized = normalizeTeamPassword(raw);
  return normalized.length === GROUPS * GROUP_LENGTH && [...normalized].every((char) => TEAM_PASSWORD_ALPHABET.includes(char));
}

/** Les titulaires gardent leur mot de passe personnel : le mot de passe commun n'ouvre jamais un compte de titulaire. */
export function canUseTeamPassword(role: string): boolean {
  return role !== "OWNER";
}
