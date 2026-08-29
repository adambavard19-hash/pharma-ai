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
