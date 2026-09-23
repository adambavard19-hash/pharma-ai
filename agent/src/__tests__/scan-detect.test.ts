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

  it("un mot ou un mot de passe tapés vite ne deviennent jamais un code-barres", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "Bonjour1234567", 1000, 5);
    type(detector, "Secret!2026", 3000, 5);
    // Le détecteur peut retenir la rafale ; c'est la normalisation qui la rejette,
    // et seul un code normalisé sort du poste.
    expect(scans.map(normalizeScannedCode)).toEqual(scans.map(() => null));
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
  it("garde un CIP13, un CIP7, et extrait le CIP d'un Datamatrix de médicament", () => {
    expect(normalizeScannedCode("3400930060216")).toBe("3400930060216");
    expect(normalizeScannedCode("3006021")).toBe("3006021");
    // Doliprane : (01) 03400936385139 (17) 280800 (10) 4244 — tel que la douchette le tape.
    expect(normalizeScannedCode("0103400936385139172808001042 44".replace(" ", ""))).toBe("3400936385139");
    expect(normalizeScannedCode("01034009363851391728080010AB12C")).toBe("3400936385139");
    expect(normalizeScannedCode("]d20103400936385139172808001042")).toBe("3400936385139");
    expect(normalizeScannedCode("12345")).toBeNull();
    expect(normalizeScannedCode("BONJOUR1234567")).toBeNull();
  });
});

describe("Datamatrix à la douchette", () => {
  it("retient une rafale longue avec des lettres dans le lot", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    type(detector, "01034009363851391728080010AB12C", 1000, 6);
    expect(scans).toEqual(["01034009363851391728080010AB12C"]);
  });

  it("ignore une touche spéciale au milieu de la rafale (séparateur GS)", () => {
    const scans: string[] = [];
    const detector = new ScanDetector((code) => scans.push(code));
    let at = 1000;
    for (const char of "0103400936385139172808001042") { detector.feed({ key: char, at }); at += 6; }
    detector.feed({ key: "Other", at }); at += 6;
    for (const char of "44") { detector.feed({ key: char, at }); at += 6; }
    detector.feed({ key: "Enter", at });
    expect(scans).toEqual(["010340093638513917280800104244"]);
  });
});
