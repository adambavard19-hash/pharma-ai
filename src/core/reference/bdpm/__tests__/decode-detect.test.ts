import { describe, expect, it } from "vitest";
import { decodeBdpmText, looksLikeUtf8 } from "../decode";

describe("détection d'encodage des fichiers BDPM", () => {
  it("reconnaît un fichier UTF-8 et le décode sans altération", () => {
    const bytes = new TextEncoder().encode("60010166\t3669465\t20 ampoule(s) polypropylène de 20 ml\n");
    expect(looksLikeUtf8(bytes)).toBe(true);
    const { text, encoding } = decodeBdpmText(bytes);
    expect(encoding).toBe("utf-8");
    expect(text).toContain("polypropylène");
    expect(text).not.toContain("Ã");
  });

  it("reconnaît un fichier windows-1252 (un accent sur un seul octet)", () => {
    const bytes = Uint8Array.from([...new TextEncoder().encode("60010166\tPr"), 0xe9, ...new TextEncoder().encode("sentation l"), 0x92, ...new TextEncoder().encode("AMM\n")]);
    expect(looksLikeUtf8(bytes)).toBe(false);
    const { text, encoding } = decodeBdpmText(bytes);
    expect(encoding).toBe("windows-1252");
    expect(text).toContain("Présentation l’AMM");
  });

  it("ne prend pas un fichier ASCII pur pour de l'UTF-8 multi-octets, mais le décode à l'identique", () => {
    const bytes = new TextEncoder().encode("12345678\tplain\n");
    expect(looksLikeUtf8(bytes)).toBe(false);
    expect(decodeBdpmText(bytes).text).toBe("12345678\tplain\n");
  });
});
