/**
 * Lecture d'un code scanné au comptoir.
 *
 * Le pharmacien a un seul champ devant lui. Il y passe une douchette, y tape un
 * nom, y colle un code à sept chiffres : c'est ici qu'on décide de quoi il
 * s'agit, avant toute requête.
 *
 * Trois faits mesurés sur les 20 083 présentations de la base officielle
 * fondent ces règles — aucune n'est supposée :
 *
 *   • les 20 083 codes CIP13 commencent par « 34009 », sans exception ;
 *   • les 20 083 satisfont la clé de contrôle EAN-13, sans exception ;
 *   • les 20 083 vérifient CIP13 = 34009 + CIP7 + clé.
 *
 * La deuxième est la plus utile au comptoir : une lecture douteuse est
 * détectable immédiatement, sans aller interroger la base.
 */

/** Préfixe des codes CIP13 français. Mesuré sur 20 083 codes sur 20 083. */
export const CIP13_PREFIX = "34009";

/**
 * Clé de contrôle EAN-13 des douze premiers chiffres.
 *
 * Somme pondérée 1-3-1-3…, complément à la dizaine supérieure.
 */
export function ean13CheckDigit(twelveDigits: string): number | null {
  if (!/^\d{12}$/.test(twelveDigits)) return null;

  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(twelveDigits[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function isValidCip13(code: string): boolean {
  return isValidEan13(code) && code.startsWith(CIP13_PREFIX);
}

/** `4949729` → `3400949497294`. Reconstruit la clé plutôt que de la deviner. */
export function cip7ToCip13(cip7: string): string | null {
  if (!/^\d{7}$/.test(cip7)) return null;
  const base = `${CIP13_PREFIX}${cip7}`;
  const key = ean13CheckDigit(base);
  return key === null ? null : `${base}${key}`;
}

export type ScannedCode =
  /** Un médicament du catalogue national. */
  | { kind: "CIP13"; cip13: string }
  /** Sept chiffres saisis à la main : le CIP13 est reconstruit. */
  | { kind: "CIP7"; cip13: string; cip7: string }
  /** Code-barres valide mais hors catalogue médicament (parapharmacie). */
  | { kind: "EAN13"; ean13: string }
  /** Suite de chiffres qui ne peut être aucun des trois. */
  | { kind: "INVALID"; input: string; reason: ScanRejection }
  /** Ce n'est pas un code : c'est une recherche. */
  | { kind: "TEXT"; query: string };

export type ScanRejection = "CHECK_DIGIT" | "LENGTH";

export const SCAN_REJECTION_MESSAGES: Record<ScanRejection, string> = {
  CHECK_DIGIT:
    "La clé de contrôle du code ne tombe pas juste : la lecture est probablement incomplète. Rescannez la boîte.",
  LENGTH: "Un code-barres de médicament compte 13 chiffres, ou 7 pour un code CIP saisi à la main.",
};

/**
 * Décide de la nature de ce qui a été saisi.
 *
 * Une douchette envoie les chiffres puis une entrée ; un pharmacien tape un
 * nom. Le même champ accepte les deux, et c'est cette fonction qui tranche.
 */
export function readScannedCode(raw: string): ScannedCode {
  // Les douchettes intercalent parfois des espaces, et un code recopié depuis
  // une facture porte souvent des tirets ou des points.
  const cleaned = raw.trim().replace(/[\s.\-_]/g, "");
  if (cleaned.length === 0) return { kind: "TEXT", query: "" };

  if (!/^\d+$/.test(cleaned)) return { kind: "TEXT", query: raw.trim() };

  if (cleaned.length === 13) {
    if (!isValidEan13(cleaned)) {
      return { kind: "INVALID", input: cleaned, reason: "CHECK_DIGIT" };
    }
    return cleaned.startsWith(CIP13_PREFIX)
      ? { kind: "CIP13", cip13: cleaned }
      : { kind: "EAN13", ean13: cleaned };
  }

  if (cleaned.length === 7) {
    const cip13 = cip7ToCip13(cleaned);
    // `cip7ToCip13` ne peut échouer que sur un format déjà écarté ci-dessus ;
    // la garde reste pour que la fonction n'ait pas de sortie implicite.
    if (cip13) return { kind: "CIP7", cip13, cip7: cleaned };
  }

  // Une suite de chiffres trop courte reste une recherche possible (un dosage,
  // une année) ; au-delà de sept chiffres, c'est un code mal lu.
  if (cleaned.length < 7) return { kind: "TEXT", query: raw.trim() };

  return { kind: "INVALID", input: cleaned, reason: "LENGTH" };
}
