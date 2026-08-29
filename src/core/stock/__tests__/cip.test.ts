import { describe, expect, it } from "vitest";
import {
  CIP13_PREFIX,
  cip7ToCip13,
  ean13CheckDigit,
  isValidCip13,
  isValidEan13,
  readScannedCode,
} from "../cip";

/**
 * Les codes utilisés ici sont de vrais codes du catalogue national. La clé de
 * contrôle est la seule protection dont dispose le comptoir contre une lecture
 * partielle : ces tests la figent.
 */

const ANASTROZOLE = "3400949497294"; // ANASTROZOLE ACCORD 1 mg, boîte de 30

describe("clé de contrôle", () => {
  it("calcule la clé d'un code réel", () => {
    expect(ean13CheckDigit(ANASTROZOLE.slice(0, 12))).toBe(4);
  });

  it("refuse une entrée qui n'a pas douze chiffres", () => {
    expect(ean13CheckDigit("340094949729")).toBe(4);
    expect(ean13CheckDigit("34009494972")).toBeNull();
    expect(ean13CheckDigit("34009494972a")).toBeNull();
  });

  it("valide un code réel et rejette un chiffre changé", () => {
    expect(isValidEan13(ANASTROZOLE)).toBe(true);
    expect(isValidCip13(ANASTROZOLE)).toBe(true);
    // Un chiffre mal lu au milieu du code : la clé ne tombe plus juste.
    expect(isValidEan13("3400949497394")).toBe(false);
  });

  it("distingue un code-barres de parapharmacie d'un code médicament", () => {
    // 3017620422003 : un vrai EAN-13, mais pas un médicament français.
    expect(isValidEan13("3017620422003")).toBe(true);
    expect(isValidCip13("3017620422003")).toBe(false);
    expect(ANASTROZOLE.startsWith(CIP13_PREFIX)).toBe(true);
  });
});

describe("cip7ToCip13", () => {
  it("reconstruit le code complet à partir des sept chiffres", () => {
    expect(cip7ToCip13("4949729")).toBe(ANASTROZOLE);
  });

  it("refuse ce qui n'est pas un CIP7", () => {
    expect(cip7ToCip13("494972")).toBeNull();
    expect(cip7ToCip13("49497290")).toBeNull();
    expect(cip7ToCip13("494972a")).toBeNull();
  });
});

describe("readScannedCode", () => {
  it("reconnaît un code-barres de médicament", () => {
    expect(readScannedCode(ANASTROZOLE)).toEqual({ kind: "CIP13", cip13: ANASTROZOLE });
  });

  it("supporte ce qu'une douchette ou un copier-coller intercale", () => {
    expect(readScannedCode(" 3400 9494 9729 4 ")).toEqual({
      kind: "CIP13",
      cip13: ANASTROZOLE,
    });
    expect(readScannedCode("3400949-497294")).toEqual({ kind: "CIP13", cip13: ANASTROZOLE });
  });

  it("reconstruit le CIP13 d'un CIP7 saisi à la main", () => {
    expect(readScannedCode("4949729")).toEqual({
      kind: "CIP7",
      cip7: "4949729",
      cip13: ANASTROZOLE,
    });
  });

  it("range un code-barres hors médicament à part", () => {
    expect(readScannedCode("3017620422003")).toEqual({
      kind: "EAN13",
      ean13: "3017620422003",
    });
  });

  it("signale une lecture douteuse plutôt que d'interroger la base", () => {
    expect(readScannedCode("3400949497295")).toEqual({
      kind: "INVALID",
      input: "3400949497295",
      reason: "CHECK_DIGIT",
    });
    expect(readScannedCode("340094949729")).toMatchObject({ reason: "LENGTH" });
  });

  it("traite tout le reste comme une recherche", () => {
    expect(readScannedCode("doliprane")).toEqual({ kind: "TEXT", query: "doliprane" });
    expect(readScannedCode("  ")).toEqual({ kind: "TEXT", query: "" });
    // Un dosage tapé dans le même champ reste une recherche, pas un code raté.
    expect(readScannedCode("500")).toEqual({ kind: "TEXT", query: "500" });
  });
});
