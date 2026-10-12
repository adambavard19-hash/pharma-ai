import { describe, expect, it } from "vitest";
import { cleanLabel, decodeExportText, isBinaryWorkbook, readRows, repairsDamagedLabel } from "..";

/**
 * Les exports des logiciels d'officine arrivent en UTF-8 (avec ou sans BOM),
 * UTF-16, windows-1252 ou CP850. Les octets sont écrits à la main, table à
 * l'appui (vérifiée contre les codecs `cp1252` et `cp850` de Python), pour
 * que l'essai ne dépende d'aucun encodeur.
 */

/** L'espace insécable (« 40 ml », « 1 200,00 » d'Excel) : 0xA0 en windows-1252, 0xFF en CP850. */
const NBSP = String.fromCharCode(0xa0);
const CP1252: Record<string, number> = { "®": 0xae, é: 0xe9, É: 0xc9, È: 0xc8, À: 0xc0, è: 0xe8, ê: 0xea, ç: 0xe7, ô: 0xf4, µ: 0xb5, "°": 0xb0, œ: 0x9c, Œ: 0x8c, "’": 0x92, "€": 0x80, [NBSP]: 0xa0, "™": 0x99, à: 0xe0, "¿": 0xbf };
/** CP850 n'a ni « œ », ni « ’ », ni « € » : un logiciel qui écrit en CP850 ne peut pas les écrire. */
const CP850: Record<string, number> = { "®": 0xa9, é: 0x82, É: 0x90, È: 0xd4, À: 0xb7, è: 0x8a, ê: 0x88, ç: 0x87, ô: 0x93, µ: 0xe6, "°": 0xf8, [NBSP]: 0xff, Ç: 0x80, à: 0x85, "¿": 0xa8 };

function encode(text: string, table: Record<string, number>): Uint8Array {
  return Uint8Array.from([...text], (char) => {
    const code = char.charCodeAt(0);
    if (code < 0x80) return code;
    const byte = table[char];
    if (byte === undefined) throw new Error(`« ${char} » absent de la table`);
    return byte;
  });
}
const utf8 = (text: string) => new TextEncoder().encode(text);
const utf16le = (text: string) => Uint8Array.from([0xff, 0xfe, ...[...text].flatMap((char) => [char.charCodeAt(0) & 0xff, char.charCodeAt(0) >> 8])]);
const utf16be = (text: string) => Uint8Array.from([0xfe, 0xff, ...[...text].flatMap((char) => [char.charCodeAt(0) >> 8, char.charCodeAt(0) & 0xff])]);

/** Un export plausible : en-tête accentué, une marque déposée, des majuscules accentuées, une apostrophe et un « œ ». */
const ANSI_EXPORT = [
  "Code produit;Désignation;Qté stock;PV TTC",
  "3664524001751;ERGYALLER® GÉLULE 60;17;14,95",
  "3401560000001;CRÈME À L’HUILE D’ŒILLET cœur 50ML;3;9,90",
  "3401560000002;SÉRUM ÉCLAT 30ML;2;19,90",
].join("\r\n");
const OEM_EXPORT = [
  "Code produit;Désignation;Qté stock;PV TTC",
  "3664524001751;ERGYALLER® GÉLULE 60;17;14,95",
  "3401560000001;CRÈME À L'HUILE crème légère 50ML;3;9,90",
  "3401560000002;SÉRUM ÉCLAT 30ML 50 µg 37 °C;2;19,90",
].join("\r\n");

const clean = (text: string) => !/[¿�]/.test(text);

describe("décodage d'un export de stock", () => {
  it("windows-1252 : ®, é, É, È, À, œ, Œ et ’ justes", () => {
    const bytes = encode(ANSI_EXPORT, CP1252);
    expect(bytes[ANSI_EXPORT.indexOf("®")]).toBe(0xae);
    const { text, encoding } = decodeExportText(bytes);
    expect(encoding).toBe("windows-1252");
    expect(text).toBe(ANSI_EXPORT);
    expect(clean(text)).toBe(true);
  });

  it("CP850 : ®, é, É, È, À, µ et ° justes — là où UTF-8 rendait « ERGYALLER� G�LULE »", () => {
    const bytes = encode(OEM_EXPORT, CP850);
    expect(bytes[OEM_EXPORT.indexOf("®")]).toBe(0xa9);
    // Le constat d'avant : lu en UTF-8, chaque accent devenait « � ».
    expect(new TextDecoder("utf-8").decode(bytes)).toContain("ERGYALLER� G�LULE");
    const { text, encoding } = decodeExportText(bytes);
    expect(encoding).toBe("cp850");
    expect(text).toBe(OEM_EXPORT);
    expect(clean(text)).toBe(true);
  });

  it("CP850 en majuscules seulement, comme les libellés LGPI", () => {
    const upper = "3401560000001;CRÈME À L'HUILE ÉCLAT GÉLULE ®;3;9,90";
    expect(decodeExportText(encode(upper, CP850))).toEqual({ text: upper, encoding: "cp850" });
    expect(decodeExportText(encode(upper, CP1252))).toEqual({ text: upper, encoding: "windows-1252" });
  });

  it("une seule marque déposée suffit à départager", () => {
    expect(decodeExportText(encode("ERGYALLER® GELULE 60", CP850)).text).toBe("ERGYALLER® GELULE 60");
    expect(decodeExportText(encode("ERGYALLER® GELULE 60", CP1252)).text).toBe("ERGYALLER® GELULE 60");
  });

  it("UTF-8 sans BOM et avec BOM : texte identique, BOM retiré", () => {
    expect(decodeExportText(utf8(ANSI_EXPORT))).toEqual({ text: ANSI_EXPORT, encoding: "utf-8" });
    expect(decodeExportText(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(ANSI_EXPORT)]))).toEqual({ text: ANSI_EXPORT, encoding: "utf-8" });
  });

  it("un BOM UTF-8 devant un contenu windows-1252 ne fabrique pas de « � »", () => {
    const { text } = decodeExportText(Uint8Array.from([0xef, 0xbb, 0xbf, ...encode(ANSI_EXPORT, CP1252)]));
    expect(text).toBe(ANSI_EXPORT);
  });

  it("UTF-16 (« Texte Unicode » d'Excel), petit et gros boutiste", () => {
    expect(decodeExportText(utf16le(ANSI_EXPORT))).toEqual({ text: ANSI_EXPORT, encoding: "utf-16le" });
    expect(decodeExportText(utf16be(ANSI_EXPORT))).toEqual({ text: ANSI_EXPORT, encoding: "utf-16be" });
  });

  it("de l'ASCII seul passe tel quel", () => {
    expect(decodeExportText(utf8("Code;Nom\r\n1;DOLIPRANE 1000MG")).text).toBe("Code;Nom\r\n1;DOLIPRANE 1000MG");
  });
});

/**
 * Plus de « € » et d'espaces insécables que d'accents : le cas où l'export
 * windows-1252 basculait en CP850 (« € » lu « Ç », « 40 ml » lu « 40áml »,
 * « crème » lu « crÞme »), et l'inverse en CP850 (« 40ÿml », « crŠme »).
 */
describe("prix en « € » et espaces insécables : rien d'inventé", () => {
  const ANSI_PRICED = [
    "Code;Libelle;Stock;PA HT;PV TTC",
    `3401560000001;Avène crème hydratante 40${NBSP}ml;3;8,30 €;12,50 €`,
    "3400930000001;DOLIPRANE 1000 MG 8 CP;12;1,20 €;2,18 €",
    `3401560000003;Gel douche 200${NBSP}ml;1;2,10 €;3,95 €`,
    "3664524001751;ERGYALLER GELULE 60;17;8,30 €;14,95 €",
  ].join("\r\n");
  const OEM_SPACED = [
    "Code;Libelle;Stock;Valeur",
    `3401560000001;Avène crème hydratante 40${NBSP}ml;3;1${NBSP}200,00`,
    `3401560000003;Gel douche 200${NBSP}ml;1;3,95`,
    `3401560000004;FRANÇAISE DES PLANTES;2;1${NBSP}100,00`,
  ].join("\r\n");

  it("windows-1252, deux colonnes de prix en « € » sur chaque ligne et des « 40 ml »", () => {
    expect(decodeExportText(encode(ANSI_PRICED, CP1252))).toEqual({ text: ANSI_PRICED, encoding: "windows-1252" });
    // Une seule colonne, et l'en-tête accentué : même lecture.
    const single = ANSI_PRICED.replace("Libelle", "Désignation").replace(/;[^;]*€(?=;)/g, "");
    expect(decodeExportText(encode(single, CP1252))).toEqual({ text: single, encoding: "windows-1252" });
  });

  it("CP850, espaces insécables dans les quantités et les milliers", () => {
    expect(decodeExportText(encode(OEM_SPACED, CP850))).toEqual({ text: OEM_SPACED, encoding: "cp850" });
  });

  it("une ligne seule : l'espace insécable ne fabrique ni « á » ni « ÿ », « € » ne devient pas « Ç »", () => {
    for (const line of [`1;Avène crème 40${NBSP}ml;2`, `1;DOLIPRANE 1000${NBSP}MG;2`]) {
      expect(decodeExportText(encode(line, CP1252))).toEqual({ text: line, encoding: "windows-1252" });
      expect(decodeExportText(encode(line, CP850))).toEqual({ text: line, encoding: "cp850" });
    }
    expect(decodeExportText(encode("1;DOLIPRANE 1000 MG;2;2,18 €", CP1252)).text).toBe("1;DOLIPRANE 1000 MG;2;2,18 €");
    expect(decodeExportText(encode("1;DOLIPRANE 1000 MG;2;2,18€HT", CP1252)).text).toBe("1;DOLIPRANE 1000 MG;2;2,18€HT");
  });

  it("lignes du vrai stock LGPI : « ¿ » d'Oracle et « € » restent windows-1252 (aucun cadre « ╔ », « ┐ »)", () => {
    // Comme le vrai fichier : bien plus de lignes en « € » sans accent que d'accents.
    const plain = Array.from({ length: 16 }, (_, i) => `34009302010${String(i).padStart(2, "0")};NIFEXINE CREME RECTALE TUB 30G;1;8,880 €;2,1`);
    const lgpi = ["Code produit;Désignation;Qte Stock;PA HT;TVA", ";AVOIR PÉRIMÉS PEDIAKID;1;10,000 €;0", "3664524001751;ERGYALLER¿ GELULE 60;17;8,297 €;5,5", ...plain].join("\r\n");
    expect(decodeExportText(encode(lgpi, CP1252))).toEqual({ text: lgpi, encoding: "windows-1252" });
    // Et le « ¿ » lui-même n'entre pas en stock.
    const [row] = readRows([{ Désignation: decodeExportText(encode(lgpi, CP1252)).text.split("\r\n")[2].split(";")[1] }], { name: "Désignation" });
    expect(row.name).toBe("ERGYALLER GELULE 60");
  });

  it("les deux lectures d'un même octet pèsent autant : « ™ », « rinç », « à » seul", () => {
    expect(decodeExportText(encode("1;ERGYALLER™ GELULE 60;1;9,90 €", CP1252)).text).toBe("1;ERGYALLER™ GELULE 60;1;9,90 €");
    expect(decodeExportText(encode("1;BIOCANINA Msse shamp ss rinç DIMETHIC;1;2,93", CP1252)).text).toBe("1;BIOCANINA Msse shamp ss rinç DIMETHIC;1;2,93");
    expect(decodeExportText(encode("1;ACTIRUB Pdr à diluer Enf framboise;10;6,33", CP850)).text).toBe("1;ACTIRUB Pdr à diluer Enf framboise;10;6,33");
    expect(decodeExportText(encode("1;ACTIRUB Pdr à diluer Enf framboise;10;6,33", CP1252)).text).toBe("1;ACTIRUB Pdr à diluer Enf framboise;10;6,33");
  });

  it("UTF-8 où manque un octet : « � » à sa place seulement, pas « Ã© » sur tout le fichier", () => {
    const bytes = utf8(ANSI_EXPORT);
    const at = utf8(ANSI_EXPORT.slice(0, ANSI_EXPORT.indexOf("GÉLULE") + 1)).length + 1;
    const damaged = Uint8Array.from([...bytes.subarray(0, at), ...bytes.subarray(at + 1)]);
    const { text, encoding } = decodeExportText(damaged);
    expect(encoding).toBe("utf-8");
    expect(text).toBe(ANSI_EXPORT.replace("GÉLULE", "G�LULE"));
    expect(cleanLabel("ERGYALLER® G�LULE 60")).toBe("ERGYALLER® G LULE 60");
  });
});

describe("classeur ou texte", () => {
  it("reconnaît un vrai classeur (XLSX zip, XLS OLE ou BIFF) et un texte déguisé en « .xls »", () => {
    expect(isBinaryWorkbook(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
    expect(isBinaryWorkbook(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toBe(true);
    expect(isBinaryWorkbook(Uint8Array.from([0x09, 0x04, 0x06, 0x00]))).toBe(true);
    expect(isBinaryWorkbook(encode("Code\tDésignation\r\n", CP1252))).toBe(false);
    expect(isBinaryWorkbook(utf8("<table><tr><td>x</td></tr></table>"))).toBe(false);
  });
});

describe("caractère perdu en amont", () => {
  it("retire le « ¿ » d'Oracle (édition LGPI « ERGYALLER¿ GELULE 60 ») et le « � », sans rien deviner", () => {
    expect(cleanLabel("ERGYALLER¿ GELULE 60")).toBe("ERGYALLER GELULE 60");
    expect(cleanLabel("CR�ME MAINS")).toBe("CR ME MAINS");
    expect(cleanLabel("L¿HUILE ¿")).toBe("L HUILE");
    expect(cleanLabel("DOLIPRANE 1000MG")).toBe("DOLIPRANE 1000MG");
  });

  it("la lecture des lignes ne laisse aucun « ¿ » ni « � » dans le nom, la marque ou le rayon", () => {
    const [row] = readRows([{ Désignation: "ERGYALLER¿ GELULE 60", Code: "3664524001751", Qté: "17", Marque: "NUTERGIA¿", Rayon: "COMPL�MENTS" }], { name: "Désignation", code: "Code", quantity: "Qté", brand: "Marque", category: "Rayon" });
    expect(row).toMatchObject({ name: "ERGYALLER GELULE 60", brand: "NUTERGIA", categoryLabel: "COMPL MENTS" });
  });

  it("répare un nom abîmé seulement quand le nom du fichier en est la version saine", () => {
    expect(repairsDamagedLabel("ERGYALLER¿ GELULE 60", "ERGYALLER GELULE 60")).toBe(true);
    expect(repairsDamagedLabel("CR�ME HYDRATANTE", "CRÈME HYDRATANTE")).toBe(true);
    expect(repairsDamagedLabel("L¿HUILE D¿AMANDE", "L’HUILE D’AMANDE")).toBe(true);
    // Un nom sain n'est jamais réécrit, ni un nom abîmé par un nom différent.
    expect(repairsDamagedLabel("ERGYALLER GELULE 60", "ERGYALLER GELULE 30")).toBe(false);
    expect(repairsDamagedLabel("ERGYALLER¿ GELULE 60", "ERGYALLER GELULE 30")).toBe(false);
    expect(repairsDamagedLabel("ERGYALLER¿ GELULE 60", "AUTRE PRODUIT")).toBe(false);
    expect(repairsDamagedLabel("ERGYALLER¿ GELULE 60", null)).toBe(false);
  });
});
