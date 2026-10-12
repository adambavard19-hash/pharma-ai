import { decodeWindows1252, looksLikeUtf8 } from "@/core/reference/bdpm/decode";

/**
 * Les octets d'un export de logiciel d'officine, rendus en texte juste.
 *
 * Les LGO tournent sous Windows et n'écrivent pas tous dans le même encodage :
 * UTF-8 (avec ou sans BOM), UTF-16 (« Texte Unicode » d'Excel), windows-1252
 * (« ANSI », le plus courant) ou CP850 (« OEM », la page de la console). Tout
 * décoder en UTF-8 rendait chaque accent d'un export ANSI ou OEM en « � »
 * (« ERGYALLER® GÉLULE » devenait « ERGYALLER� G�LULE »), et ce nom abîmé
 * s'écrivait en stock puis s'affichait au comptoir.
 *
 * L'ordre : un BOM fait foi ; sinon un UTF-8 valide avec au moins un caractère
 * accentué est de l'UTF-8 (un fichier à un octet par caractère contenant un
 * seul accent n'est jamais de l'UTF-8 valide), comme un UTF-8 où traînent
 * quelques octets abîmés ; sinon windows-1252, sauf si CP850 se lit mieux sans
 * produire un seul caractère de cadre. Aucune des deux lectures n'est
 * favorisée par une colonne de prix en « € » ou des espaces insécables.
 */
export type ExportEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252" | "cp850";

/** La moitié haute de CP850 (0x80–0xFF) ; la moitié basse est l'ASCII. Aucun octet indéfini : jamais de « � ». */
const CP850_HIGH =
  "ÇüéâäàåçêëèïîìÄÅ" + // 0x80–0x8F
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" + // 0x90–0x9F
  "áíóúñÑªº¿®¬½¼¡«»" + // 0xA0–0xAF
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" + // 0xB0–0xBF
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" + // 0xC0–0xCF
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" + // 0xD0–0xDF
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" + // 0xE0–0xEF
  "\u00AD±‗¾¶§÷¸°¨·¹³²■\u00A0"; //  0xF0–0xFF

const CP850_CODES = Array.from(CP850_HIGH, (char) => char.charCodeAt(0));

export function decodeCp850(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += 8192) {
    parts.push(String.fromCharCode(...Array.from(bytes.subarray(start, start + 8192), (byte) => (byte < 0x80 ? byte : CP850_CODES[byte - 0x80]))));
  }
  return parts.join("");
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  if (littleEndian) return new TextDecoder("utf-16le").decode(bytes);
  // Gros-boutiste : on retourne chaque paire, le décodeur petit-boutiste existe partout (même sans ICU complet).
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

/**
 * Les lettres du français : elles départagent windows-1252 et CP850. Toute
 * autre lettre coûte un point : « ÿ » (l'espace insécable de CP850, 0xFF, lue
 * en windows-1252 : « 400ÿmg »), « á » (celle de windows-1252, 0xA0, lue en
 * CP850 : « 40áml »), « Ö » (« ™ » windows-1252 lu en CP850), « Ú », « þ »…
 */
const FRENCH = new Set("àâçéèêëîïôùûüœÀÂÇÉÈÊËÎÏÔÙÛÜŒ");
/**
 * « Ç » est au milieu d'un mot, au bout d'une abréviation (« rinç ») tout au
 * plus : à demi-poids hors du milieu, comme « € » à côté d'un chiffre ; seul
 * (« 12,50 Ç », un « € » windows-1252 lu en CP850), il coûte.
 */
const MID_WORD = new Set("çÇ");
/** L'apostrophe typographique : à sa place au milieu d'un mot (« L’HUILE »). */
const APOSTROPHES = new Set("’‘");
/** La marque déposée, collée au nom (« ERGYALLER® ») ; « © » au même endroit n'est qu'un signe. */
const TRADEMARKS = new Set("®™");
/** Plausibles hors d'un mot (« 50 µg », « 37 °C », « ½ », « 12,50 € »), suspects collés entre deux lettres. */
const SIGNS = new Set("©°µ²³«»€±½¼¾×§–—");
/**
 * Sans poids dans les deux lectures : l'espace insécable (0xA0 en windows-1252,
 * lue « á » en CP850 ; 0xFF en CP850, lue « ÿ » en windows-1252), le trait
 * d'union conditionnel, et « ¿ », caractère perdu en amont que `cleanLabel` retire.
 */
const NEUTRAL = new Set("\u00A0\u00AD\u00BF");
/** Cadres et blocs de CP850 (« ╔ », « ┐ », « ░ », « ■ ») : jamais dans un export. Ce sont « É », « ¿ », « ° »… windows-1252 lus en CP850. */
const FRAME = /[\u2500-\u25A0]/;
// « ˆ » (U+02C6, « ê » CP850 lu en windows-1252) est une lettre modificative : pas une lettre d'un mot.
const isLetter = (char: string | undefined) => char !== undefined && /\p{L}/u.test(char) && !/\p{Lm}/u.test(char);
const isUpper = (char: string | undefined) => char !== undefined && /\p{Lu}/u.test(char);
const isLower = (char: string | undefined) => char !== undefined && /\p{Ll}/u.test(char);

/**
 * Une casse qu'aucun libellé n'a : majuscule après une minuscule (« crÞme »,
 * « QtÚ »), majuscule entre une majuscule et une minuscule (« DÚsignation »),
 * minuscule au milieu de majuscules (« CâTE », « CRšME »). C'est la trace
 * d'une minuscule accentuée lue dans la mauvaise page, et inversement.
 */
function breaksCase(text: string, i: number): boolean {
  const char = text[i];
  if (isUpper(char)) return isLower(text[i - 1]) || (isUpper(text[i - 1]) && isLower(text[i + 1]));
  if (isLower(char)) return isUpper(text[i - 1]) && (isUpper(text[i - 2]) || isUpper(text[i + 1]));
  return false;
}

/**
 * Note la plausibilité d'un décodage à un octet par caractère, sur ses seuls
 * caractères non ASCII, chacun dans son contexte : les deux lectures d'un même
 * octet sont notées à la même aune (« € » seul +1, « Ç » seul −1 ; espace
 * insécable 0, « á » et « ÿ » −1), pour qu'une colonne de prix ou des « 40 ml » ne
 * fassent pas basculer un export vers la mauvaise page. Un « É » en CP850
 * (0x90) lu en windows-1252 est un octet indéfini ; un « é » windows-1252 (0xE9)
 * lu en CP850 devient « Ú » au milieu d'un mot en minuscules.
 */
function plausibility(text: string): number {
  let score = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 0x80) continue;
    const char = text[i];
    const before = text[i - 1];
    const after = text[i + 1];
    const between = isLetter(before) && isLetter(after);
    if (NEUTRAL.has(char)) continue;
    else if (APOSTROPHES.has(char)) score += 1;
    else if (TRADEMARKS.has(char)) score += between ? -2 : isLetter(before) ? 2 : 1;
    else if (SIGNS.has(char)) score += between ? -2 : 1;
    // Les points de suspension suivent un mot ; seuls entre deux espaces, c'est « à » CP850 lu en windows-1252 (« Pdr … diluer »).
    else if (char === "…") score += between ? -2 : isLetter(before) ? 2 : -1;
    else if (isLetter(char)) {
      if (breaksCase(text, i)) score -= 2;
      // Seule, une lettre accentuée n'est un mot que s'il s'agit de « à » (« Pdr à diluer »).
      else if (!isLetter(before) && !isLetter(after)) score += char === "à" || char === "À" ? 1 : -1;
      else if (MID_WORD.has(char)) score += between ? 2 : 1;
      else score += FRENCH.has(char) ? 2 : -1;
    }
    // Caractères de contrôle, octet indéfini (« � »), ponctuation d'imprimerie (‚ „ ‡ ‰ ‹ ›) : jamais dans un libellé.
    else score -= 3;
  }
  return score;
}

/**
 * Vrai pour un texte UTF-8 où traînent quelques octets abîmés (un export
 * tronqué, un octet perdu en route). Lu en windows-1252, chaque « é » sain y
 * deviendrait « Ã© », des caractères inventés que rien ne répare ensuite ; lu
 * en UTF-8, seuls les octets abîmés deviennent « � », que `cleanLabel` retire.
 * Un vrai fichier à un octet par caractère ne forme presque jamais une
 * séquence UTF-8 valide (son « é » est suivi d'une lettre ASCII).
 */
function mostlyUtf8(bytes: Uint8Array): boolean {
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];
    if (byte < 0x80) {
      i += 1;
      continue;
    }
    const length = byte >= 0xc2 && byte <= 0xdf ? 2 : byte >= 0xe0 && byte <= 0xef ? 3 : byte >= 0xf0 && byte <= 0xf4 ? 4 : 0;
    let complete = length > 0 && i + length <= bytes.length;
    for (let k = 1; complete && k < length; k += 1) complete = bytes[i + k] >= 0x80 && bytes[i + k] <= 0xbf;
    if (complete) {
      valid += 1;
      i += length;
    } else {
      invalid += 1;
      i += 1;
    }
  }
  return valid > 0 && invalid * 4 <= valid;
}

export function decodeExportText(bytes: Uint8Array): { text: string; encoding: ExportEncoding } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const body = bytes.subarray(3);
    // Un BOM UTF-8 devant un contenu qui n'en est pas (rare) : on ne fabrique pas de « � », on lit le reste comme le reste.
    if (looksLikeUtf8(body) || body.every((byte) => byte < 0x80)) return { text: new TextDecoder("utf-8").decode(body), encoding: "utf-8" };
    return decodeExportText(body);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decodeUtf16(bytes.subarray(2), true), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decodeUtf16(bytes.subarray(2), false), encoding: "utf-16be" };
  if (looksLikeUtf8(bytes)) return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };

  const ansi = decodeWindows1252(bytes);
  // Que de l'ASCII : tous les décodages se valent.
  if (bytes.every((byte) => byte < 0x80)) return { text: ansi, encoding: "utf-8" };
  // De l'UTF-8 à quelques octets près : « � » à la place de ces octets seulement.
  if (mostlyUtf8(bytes)) return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  const oem = decodeCp850(bytes);
  // windows-1252 par défaut, c'est la page « ANSI » de Windows, celle des exports ordinaires : CP850 seulement
  // s'il se lit mieux ET sans aucun cadre. À égalité, windows-1252.
  if (FRAME.test(oem)) return { text: ansi, encoding: "windows-1252" };
  return plausibility(oem) > plausibility(ansi) ? { text: oem, encoding: "cp850" } : { text: ansi, encoding: "windows-1252" };
}

/**
 * Vrai pour un vrai classeur (XLSX : archive zip ; XLS : document OLE ou
 * enregistrements BIFF). Bien des logiciels écrivent sous le nom « .xls » un
 * simple texte (tabulations ou tableau HTML) : celui-là se décode ici, pas
 * par la bibliothèque des classeurs, qui le lit en Latin-1 (« ’ » et « œ »
 * perdus, l'UTF-8 rendu en « Ã© ») et prend « 14,95 » pour 1 495.
 */
export function isBinaryWorkbook(bytes: Uint8Array): boolean {
  const [a, b, c, d] = bytes;
  if (a === 0x50 && b === 0x4b && c === 0x03 && d === 0x04) return true;
  if (a === 0xd0 && b === 0xcf && c === 0x11 && d === 0xe0) return true;
  return a === 0x09 && (b === 0x00 || b === 0x02 || b === 0x04) && c !== undefined;
}

/**
 * Les marques d'un caractère perdu AVANT nous : « ¿ », le caractère de
 * remplacement d'Oracle (sur lequel tourne LGPI : sa propre édition
 * d'inventaire imprime « ERGYALLER¿ GELULE 60 ») et « � » (U+FFFD). On ne sait
 * pas ce qu'elles remplacent (« ® », « ™ », « ’ », « œ »…) : on ne le devine
 * pas, on les retire. Entre deux lettres, une espace, pour ne pas coller deux
 * mots — c'est déjà ce que voit la recherche (`normalizeName`).
 */
const LOST = /[\u00BF\uFFFD]/;
const LOST_ALL = /[\u00BF\uFFFD]/g;

export function hasLostCharacter(label: string): boolean {
  return LOST.test(label);
}

export function cleanLabel(label: string): string {
  if (!LOST.test(label)) return label;
  return label
    .replace(/(\p{L})[\u00BF\uFFFD]+(?=\p{L})/gu, "$1 ")
    .replace(LOST_ALL, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Vrai quand `fresh`, le nom propre que donne le fichier, est la version saine
 * de `stored`, le nom abîmé gardé en stock : chaque caractère perdu y tient
 * la place de deux caractères au plus (rien, une espace, « È »…), tout le
 * reste est identique (casse et espaces mises à part). Le nom d'un produit
 * n'est jamais remplacé par autre chose qu'un nom réparé.
 */
export function repairsDamagedLabel(stored: string, fresh: string | null): boolean {
  if (!fresh || !hasLostCharacter(stored) || hasLostCharacter(fresh)) return false;
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();
  const pattern = squash(stored)
    .split(LOST_ALL)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*"))
    .join("[^]{0,2}");
  return new RegExp(`^${pattern}$`, "iu").test(squash(fresh));
}
