/**
 * Le mot de passe de l'officine : un seul par pharmacie, donné par le titulaire à son équipe. Chacun se connecte sur son poste
 * avec SON adresse e-mail (que le titulaire a ajoutée dans Mon équipe) et ce mot de passe.
 *
 * Il se tape sur chaque poste et se dit à voix haute : un mot simple et quatre chiffres (« Menthe-4827 »), et la saisie est
 * tolérante (minuscules, espaces, tirets, tout est accepté). Il ne suffit jamais seul : il faut aussi l'adresse d'un membre de
 * l'équipe, et les essais en boucle sont freinés.
 */

/** 64 mots courts, sans accent ni ambiguïté de lecture. */
export const TEAM_PASSWORD_WORDS = [
  "Menthe", "Citron", "Olive", "Cerise", "Prune", "Sauge", "Thym", "Tilleul",
  "Lavande", "Orange", "Pomme", "Fraise", "Abricot", "Figue", "Melon", "Poire",
  "Cassis", "Mimosa", "Jasmin", "Lilas", "Rose", "Iris", "Tulipe", "Bambou",
  "Cedre", "Chene", "Erable", "Saule", "Sapin", "Palmier", "Nuage", "Etoile",
  "Lune", "Soleil", "Ocean", "Plage", "Colline", "Foret", "Jardin", "Prairie",
  "Matin", "Aurore", "Cristal", "Perle", "Corail", "Ambre", "Opale", "Jade",
  "Saphir", "Rubis", "Basilic", "Cannelle", "Vanille", "Muscade", "Gingembre", "Myrtille",
  "Framboise", "Noisette", "Amande", "Kiwi", "Mangue", "Coco", "Datte", "Grenade",
] as const;

/** Un nouveau mot de passe d'officine (« Menthe-4827 »), tiré de `randomByte` (un octet aléatoire de 0 à 255). */
export function generateTeamPassword(randomByte: () => number): string {
  // 64 mots : un octet sur deux bits de trop, chaque mot a exactement la même chance.
  const word = TEAM_PASSWORD_WORDS[randomByte() % TEAM_PASSWORD_WORDS.length];
  const digits: number[] = [];
  // Rejet des octets 250 à 255 : chaque chiffre a exactement la même chance.
  while (digits.length < 4) {
    const byte = randomByte();
    if (byte < 250) digits.push(byte % 10);
  }
  return `${word}-${digits.join("")}`;
}

/** La forme comparée : majuscules, sans accents, espaces ni tirets. « menthe 4827 » et « Menthe-4827 » sont le même mot de passe. */
export function normalizeTeamPassword(raw: string): string {
  return raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[\s\-_.]/g, "");
}

/** Ce qui peut être un mot de passe d'officine : des lettres et des chiffres, au moins un chiffre (sinon, rien à calculer). */
export function looksLikeTeamPassword(raw: string): boolean {
  const normalized = normalizeTeamPassword(raw);
  return /^[A-Z0-9]{6,24}$/.test(normalized) && /\d/.test(normalized);
}

/** Les titulaires gardent leur mot de passe personnel : le mot de passe commun n'ouvre jamais un compte de titulaire. */
export function canUseTeamPassword(role: string): boolean {
  return role !== "OWNER";
}
