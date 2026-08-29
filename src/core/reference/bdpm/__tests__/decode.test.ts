import { describe, expect, it } from "vitest";
import { decodeWindows1252 } from "../decode";

const bytes = (...values: number[]) => new Uint8Array(values);

/**
 * La documentation de la source annonce de l'ISO-8859-1. Les fichiers réels
 * contiennent 9 809 octets que seul windows-1252 sait lire — dont 9 578
 * apostrophes typographiques. Ces tests figent le choix : décoder en
 * ISO-8859-1 strict planterait des caractères de contrôle invisibles au milieu
 * des noms de médicaments.
 */
describe("decodeWindows1252", () => {
  it("lit l'ASCII sans le toucher", () => {
    expect(decodeWindows1252(bytes(0x50, 0x61, 0x72, 0x61))).toBe("Para");
  });

  it("lit les accents français, communs aux deux encodages", () => {
    // 0xE9 = é, 0xE8 = è, 0xE0 = à
    expect(decodeWindows1252(bytes(0x63, 0x6f, 0x6d, 0x70, 0x72, 0x69, 0x6d, 0xe9))).toBe(
      "comprimé",
    );
    expect(decodeWindows1252(bytes(0xe8, 0xe0, 0xf4, 0xef))).toBe("èàôï");
  });

  it("lit la ponctuation que l'ISO-8859-1 rendrait invisible", () => {
    // 0x92 apparaît 9 578 fois dans la source (« l’AMM », « d’arrêt »…).
    expect(decodeWindows1252(bytes(0x6c, 0x92, 0x41, 0x4d, 0x4d))).toBe("l’AMM");
    expect(decodeWindows1252(bytes(0x95))).toBe("•");
    expect(decodeWindows1252(bytes(0x96))).toBe("–");
    expect(decodeWindows1252(bytes(0x85))).toBe("…");
    expect(decodeWindows1252(bytes(0x89))).toBe("‰");
  });

  it("signale un octet non défini plutôt que de l'inventer", () => {
    // 0x81, 0x8D, 0x8F, 0x90 et 0x9D n'existent pas en windows-1252.
    expect(decodeWindows1252(bytes(0x81))).toBe("�");
    expect(decodeWindows1252(bytes(0x9d))).toBe("�");
  });

  it("traite un contenu plus long qu'un lot interne", () => {
    const long = new Uint8Array(20_000).fill(0xe9);
    const decoded = decodeWindows1252(long);
    expect(decoded).toHaveLength(20_000);
    expect(decoded.at(-1)).toBe("é");
  });
});
