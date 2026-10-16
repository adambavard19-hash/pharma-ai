import { describe, expect, it } from "vitest";
import { datamatrixExpiry, normalizeScannedCode, parseScannedCode } from "../scan-detect";

describe("le Datamatrix d'une boîte : code et péremption", () => {
  it("lit le CIP13 et la péremption quand « 17 » suit le GTIN (ordre des boîtes françaises)", () => {
    expect(parseScannedCode("010340093529422717270331" + "10AB12C" + "21XYZ987")).toEqual({ code: "3400935294227", expiresOn: "2027-03-31" });
    expect(parseScannedCode("]d2010340093529422717270331")?.expiresOn).toBe("2027-03-31");
  });

  it("le jour « 00 » veut dire la fin du mois", () => {
    expect(datamatrixExpiry("010340093529422717280200")).toBe("2028-02-29");
    expect(datamatrixExpiry("010340093529422717270400")).toBe("2027-04-30");
  });

  it("dans le doute, aucune date : ordre différent, mois ou jour impossible, code-barres simple", () => {
    // La série d'abord : « 17 » plus loin peut appartenir au numéro de série, on ne lit pas.
    expect(parseScannedCode("01034009352942272112345617270331")).toEqual({ code: "3400935294227", expiresOn: null });
    expect(datamatrixExpiry("010340093529422717271331")).toBeNull();
    expect(datamatrixExpiry("010340093529422717270231")).toBeNull();
    expect(parseScannedCode("3400935294227")).toEqual({ code: "3400935294227", expiresOn: null });
  });

  it("le code seul ne change pas pour le reste de l'agent", () => {
    expect(normalizeScannedCode("010340093529422717270331")).toBe("3400935294227");
    expect(normalizeScannedCode("ABC")).toBeNull();
  });
});
