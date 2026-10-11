import { describe, expect, it } from "vitest";
import { checkboxValue, isProfession, normalizeRpps } from "../profile";

describe("profil mobile", () => {
  it("RPPS : 11 chiffres, espaces tolérés, vide = rien ; format seulement", () => {
    expect(normalizeRpps("101 0123 4567")).toEqual({ ok: true, value: "10101234567" });
    expect(normalizeRpps("")).toEqual({ ok: true, value: null });
    expect(normalizeRpps(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeRpps("1234567890")).toMatchObject({ ok: false });
    expect(normalizeRpps("1010123456A")).toMatchObject({ ok: false });
  });

  it("une case n'est acceptée que cochée", () => {
    expect(checkboxValue("on")).toBe(true);
    expect(checkboxValue(null)).toBe(false);
    expect(checkboxValue("")).toBe(false);
    expect(checkboxValue("off")).toBe(false);
  });

  it("métiers connus seulement", () => {
    expect(isProfession("TECHNICIAN")).toBe(true);
    expect(isProfession("OWNER")).toBe(false);
  });
});
