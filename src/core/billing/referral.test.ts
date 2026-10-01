import { describe, expect, it } from "vitest";
import { normalizeReferralCode, referralDiscountCents, REFERRAL_DISCOUNT_CENTS } from "./referral";

describe("parrainage", () => {
  it("accepte un code bien formé, quelle que soit la casse ou les espaces", () => {
    expect(normalizeReferralCode(" pb-abc234 ")).toBe("PB-ABC234");
    expect(normalizeReferralCode("PB-ABC 234")).toBe("PB-ABC234");
  });
  it("refuse un code d'une autre forme, ou ambigu (0, O, 1, I)", () => {
    expect(normalizeReferralCode("")).toBeNull();
    expect(normalizeReferralCode("PB-ABC0I1")).toBeNull();
    expect(normalizeReferralCode("ABC234")).toBeNull();
  });
  it("retire une somme fixe par filleul actif, jamais plus que l'abonnement", () => {
    expect(referralDiscountCents(0, 6900)).toBe(0);
    expect(referralDiscountCents(3, 6900)).toBe(3 * REFERRAL_DISCOUNT_CENTS);
    expect(referralDiscountCents(12, 6900)).toBe(6900);
    expect(referralDiscountCents(2, null)).toBe(2 * REFERRAL_DISCOUNT_CENTS);
  });
});
