import { describe, expect, it } from "vitest";
import { canUseTeamPassword, generateTeamPassword, looksLikeTeamPassword, normalizeTeamPassword, TEAM_PASSWORD_ALPHABET } from "../team-password";

const seq = (bytes: number[]) => {
  let index = 0;
  return () => bytes[index++ % bytes.length];
};

describe("le mot de passe de l'officine", () => {
  it("trois groupes de quatre, sans caractère ambigu", () => {
    const password = generateTeamPassword(() => Math.floor(Math.random() * 256));
    expect(password).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(password).not.toMatch(/[01OIL]/);
  });

  it("chaque symbole a la même chance : les octets au-delà du dernier multiple sont écartés", () => {
    // 248 = 8 × 31 : 248 à 255 sont rejetés, 0 donne la première lettre.
    expect(generateTeamPassword(seq([255, 250, 248, 0]))).toBe("AAAA-AAAA-AAAA");
    expect(generateTeamPassword(seq([30]))).toBe(`${TEAM_PASSWORD_ALPHABET[30].repeat(4)}-${TEAM_PASSWORD_ALPHABET[30].repeat(4)}-${TEAM_PASSWORD_ALPHABET[30].repeat(4)}`);
  });

  it("la saisie est tolérante : minuscules, espaces, tirets", () => {
    expect(normalizeTeamPassword(" k7mp q3xa-9rtd ")).toBe("K7MPQ3XA9RTD");
    expect(looksLikeTeamPassword("k7mp q3xa 9rtd")).toBe(true);
    expect(looksLikeTeamPassword("K7MP-Q3XA-9RT")).toBe(false);
    expect(looksLikeTeamPassword("Demo2026!Pharma")).toBe(false);
  });

  it("n'ouvre jamais un compte de titulaire", () => {
    expect(canUseTeamPassword("OWNER")).toBe(false);
    expect(canUseTeamPassword("PHARMACIST")).toBe(true);
    expect(canUseTeamPassword("TECHNICIAN")).toBe(true);
  });
});
