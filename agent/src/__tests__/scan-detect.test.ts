import { describe, expect, it } from "vitest";
import { ScanDetector, normalizeScannedCode } from "../scan-detect";

/**
 * La douchette tape treize chiffres en quelques dizaines de millisecondes,
 * puis Entrée. Un humain tape lentement. Le détecteur ne doit retenir que la
 * douchette, et n'exposer jamais autre chose que des chiffres.
 */
function type(detector: ScanDetector, text: string, start: number, gap: number, enter = true): number {
  let at = start;
  for (const char of text) {
    detector.feed({ key: char, at });
    at += gap;
  }
  if (enter) detector.feed({ key: "Enter", at });
  return at;
}

describe("détection d'un passage de douchette", () => {
  it("retient une rafale rapide de 13 chiffres suivie d'Entrée", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "3400930060216", 1000, 8);
    expect(scans).toEqual(["3400930060216"]);
  });

  it("ignore des chiffres tapés à la main, lentement", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "3400930060216", 1000, 300);
    detector.tick(20_000);
    expect(scans).toEqual([]);
  });

  it("ignore un mot, un mot de passe, une phrase", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "Bonjour1234567", 1000, 5);
    type(detector, "Secret!2026", 3000, 5);
    expect(scans).toEqual([]);
  });

  it("clôt une rafale sans Entrée après un silence", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "3400935955838", 1000, 10, false);
    detector.tick(1200);
    expect(scans).toEqual([]);
    detector.tick(1500);
    expect(scans).toEqual(["3400935955838"]);
  });

  it("sépare deux bips consécutifs", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    const end = type(detector, "3400930060216", 1000, 8);
    type(detector, "3400935955838", end + 900, 8);
    expect(scans).toEqual(["3400930060216", "3400935955838"]);
  });
});

describe("normalisation du code lu", () => {
  it("garde un CIP13, un CIP7, et extrait le GTIN d'un Datamatrix", () => {
    expect(normalizeScannedCode("3400930060216")).toBe("3400930060216");
    expect(normalizeScannedCode("3006021")).toBe("3006021");
    expect(normalizeScannedCode("0103400930060216172712311012345")).toBe("3400930060216");
    expect(normalizeScannedCode("12345")).toBeNull();
  });
});
