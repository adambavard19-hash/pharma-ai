/**
 * Identité d'une officine telle qu'elle entre au contrat : SIRET contrôlé,
 * e-mail et téléphone normalisés, noms nettoyés. Rien n'est deviné : une
 * valeur invalide est refusée, jamais « corrigée » au hasard.
 */

/** Chiffres seuls (les espaces, points et tirets saisis sont retirés). */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** SIRET : 14 chiffres, clé de Luhn (exception La Poste : somme des chiffres multiple de 5). */
export function isValidSiret(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14) return false;
  if (digits.startsWith("356000000")) return digits.split("").reduce((a, d) => a + Number(d), 0) % 5 === 0;
  return luhn(digits);
}

/** Le SIRET normalisé (14 chiffres), ou `null` s'il est invalide. */
export function normalizeSiret(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return isValidSiret(digits) ? digits : null;
}

/** SIREN : les 9 premiers chiffres d'un SIRET valide. */
export function sirenOf(siret: string | null | undefined): string | null {
  const normalized = normalizeSiret(siret);
  return normalized ? normalized.slice(0, 9) : null;
}

/** « 123 456 789 00012 » : lisible au contrat et dans les e-mails. */
export function formatSiret(siret: string): string {
  const d = digitsOnly(siret);
  return d.length === 14 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : siret;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** Téléphone français ou international : chiffres et « + » de tête ; `null` si trop court pour être un numéro. */
export function normalizePhone(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const plus = raw.startsWith("+");
  const digits = digitsOnly(raw);
  if (digits.length < 9 || digits.length > 15) return null;
  if (!plus && digits.length === 10 && digits.startsWith("0")) return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return `${plus ? "+" : ""}${digits}`;
}

export function normalizePostalCode(value: string | null | undefined): string | null {
  const digits = digitsOnly(value);
  return digits.length === 5 ? digits : null;
}

/** Espaces superflus retirés ; `null` si vide. */
export function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** « jean DUPONT » → « Jean Dupont » (prénoms composés respectés). */
export function personName(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return text.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`);
}

/** Pour comparer deux noms d'officine sans tenir compte des accents ni de « Pharmacie ». */
export function nameKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(pharmacie|grande|la|le|les|de|du|des|l|d)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}
