/**
 * Décodage des fichiers BDPM.
 *
 * La documentation annonce de l'ISO-8859-1. Les fichiers réels contiennent en
 * fait 9 809 octets dans la plage 0x80–0x9F, où ISO-8859-1 ne définit que des
 * caractères de contrôle invisibles alors que windows-1252 y place de la
 * ponctuation typographique. Répartition mesurée sur les six fichiers :
 *
 *   0x92 apostrophe « ’ »  9 578 fois   (« l’AMM », « d’arrêt »…)
 *   0x95 puce « • »          128
 *   0x96 tiret demi-cadratin « – »  94
 *   0x91 apostrophe ouvrante « ‘ »   7
 *   0x85 points de suspension « … »  1
 *   0x89 pour mille « ‰ »            1
 *
 * Décoder en ISO-8859-1 strict insérerait donc 9 809 caractères de contrôle
 * invisibles au milieu de libellés de médicaments et de textes d'avis HAS.
 * On décode en windows-1252, qui est identique à ISO-8859-1 partout ailleurs.
 *
 * La table est écrite ici plutôt que confiée à `TextDecoder` : celui-ci ne
 * connaît les encodages hérités que si Node est compilé avec l'ICU complet.
 */

/** Les 32 positions où windows-1252 diffère d'ISO-8859-1. `null` = non défini. */
const CP1252_HIGH: readonly (string | null)[] = [
  "€", null, "‚", "ƒ", "„", "…", "†", "‡", // 0x80–0x87
  "ˆ", "‰", "Š", "‹", "Œ", null, "Ž", null, //     0x88–0x8F
  null, "‘", "’", "“", "”", "•", "–", "—", //  0x90–0x97
  "˜", "™", "š", "›", "œ", null, "ž", "Ÿ", //  0x98–0x9F
];

/**
 * Décode des octets windows-1252 en chaîne. Un octet non défini par
 * windows-1252 est rendu par U+FFFD plutôt que deviné.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 8192;
  const buffer = new Array<number>(Math.min(CHUNK, bytes.length));

  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    buffer.length = end - start;

    for (let i = start; i < end; i += 1) {
      const byte = bytes[i];
      if (byte < 0x80 || byte > 0x9f) {
        buffer[i - start] = byte;
        continue;
      }
      const mapped = CP1252_HIGH[byte - 0x80];
      buffer[i - start] = mapped === null ? 0xfffd : mapped.charCodeAt(0);
    }

    parts.push(String.fromCharCode(...buffer));
  }

  return parts.join("");
}

/**
 * Décode un fichier BDPM en devinant son encodage, fichier par fichier.
 *
 * La documentation annonce de l'ISO-8859-1 pour tous les fichiers. Mesuré sur
 * la livraison du 3 août 2026 : CIS_CIP_bdpm.txt est en UTF-8 (20 884 « é »
 * codés sur deux octets, aucun sur un seul), les cinq autres en windows-1252.
 * Décoder ce fichier en windows-1252 produisait « polypropylÃ¨ne » sur chaque
 * libellé de boîte. On teste donc l'UTF-8 strict d'abord : un fichier
 * windows-1252 qui contient un seul accent n'est jamais de l'UTF-8 valide, la
 * détection ne peut donc pas se tromper dans ce sens-là.
 */
export function decodeBdpmText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  if (looksLikeUtf8(bytes)) {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  }
  return { text: decodeWindows1252(bytes), encoding: "windows-1252" };
}

/** Vrai si les octets forment de l'UTF-8 valide ET contiennent au moins une séquence multi-octets. */
export function looksLikeUtf8(bytes: Uint8Array): boolean {
  let multibyte = false;
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte < 0x80) {
      i += 1;
      continue;
    }
    let length: number;
    if (byte >= 0xc2 && byte <= 0xdf) length = 2;
    else if (byte >= 0xe0 && byte <= 0xef) length = 3;
    else if (byte >= 0xf0 && byte <= 0xf4) length = 4;
    else return false;
    if (i + length > bytes.length) return false;
    for (let k = 1; k < length; k += 1) {
      const cont = bytes[i + k];
      if (cont < 0x80 || cont > 0xbf) return false;
    }
    multibyte = true;
    i += length;
  }
  return multibyte;
}
