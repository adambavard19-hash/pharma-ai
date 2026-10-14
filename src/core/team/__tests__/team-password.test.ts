import { describe, expect, it } from "vitest";
import { canUseTeamPassword, generateTeamPassword, looksLikeTeamPassword, normalizeTeamPassword, TEAM_PASSWORD_WORDS } from "../team-password";

const seq = (bytes: number[]) => {
  let index = 0;
  return () => bytes[index++ % bytes.length];
};

describe("le mot de passe de l'officine", () => {
  it("un mot simple et quatre chiffres", () => {
    const password = generateTeamPassword(() => Math.floor(Math.random() * 256));
    expect(password).toMatch(/^[A-Z][a-z]+-\d{4}$/);
    expect(TEAM_PASSWORD_WORDS).toContain(password.split("-")[0]);
  });

  it("64 mots tous différents, et les octets 250 à 255 écartés pour les chiffres", () => {
    expect(new Set(TEAM_PASSWORD_WORDS.map((word) => word.toUpperCase())).size).toBe(64);
    expect(generateTeamPassword(seq([0, 255, 251, 1, 2, 3, 4]))).toBe("Menthe-1234");
    expect(generateTeamPassword(seq([65, 9, 9, 9, 9]))).toBe(`${TEAM_PASSWORD_WORDS[1]}-9999`);
  });

  it("la saisie est tolérante : minuscules, espaces, tirets", () => {
    expect(normalizeTeamPassword(" menthe 4827 ")).toBe("MENTHE4827");
    expect(normalizeTeamPassword("Menthe-4827")).toBe("MENTHE4827");
    expect(looksLikeTeamPassword("menthe 4827")).toBe(true);
    // Les mots de passe déjà donnés (ancienne forme) restent valables.
    expect(looksLikeTeamPassword("K7MP-Q3XA-9RTD")).toBe(true);
    expect(looksLikeTeamPassword("menthe")).toBe(false);
    expect(looksLikeTeamPassword("Demo2026!Pharma")).toBe(false);
  });

  it("n'ouvre jamais un compte de titulaire", () => {
    expect(canUseTeamPassword("OWNER")).toBe(false);
    expect(canUseTeamPassword("PHARMACIST")).toBe(true);
    expect(canUseTeamPassword("TECHNICIAN")).toBe(true);
  });
});
