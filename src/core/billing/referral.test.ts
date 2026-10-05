import { describe, expect, it } from "vitest";
import { normalizeReferralCode, pickActiveReferralOffer, referralAmountFor, referralDiscountCents, referralDiscountForAmounts, REFERRAL_DISCOUNT_CENTS, type ReferralOfferWindow } from "./referral";

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

describe("parrainage : le montant propre à chaque filleul", () => {
  it("un filleul porte le montant figé à son inscription ; sans montant (filleul d'avant les offres), le montant standard", () => {
    expect(referralAmountFor({ referralAmountCents: 2000 })).toBe(2000);
    expect(referralAmountFor({ referralAmountCents: null })).toBe(REFERRAL_DISCOUNT_CENTS);
  });

  it("la remise est la somme des montants de chacun, et non le nombre de filleuls fois le montant du moment", () => {
    // Deux filleuls d'avant (10 €) et un inscrit pendant une offre à 25 € : 45 €, pas 3 × 25 €.
    expect(referralDiscountForAmounts([1000, 1000, 2500], 29000)).toBe(4500);
    expect(referralDiscountForAmounts([], 29000)).toBe(0);
  });

  it("elle ne dépasse jamais le prix contractuel, ni ne devient négative", () => {
    expect(referralDiscountForAmounts([20000, 20000], 29000)).toBe(29000);
    expect(referralDiscountForAmounts([20000, 20000], 0)).toBe(0);
    expect(referralDiscountForAmounts([1000, -500], 29000)).toBe(1000);
    expect(referralDiscountForAmounts([1000, Number.NaN], 29000)).toBe(1000);
    expect(referralDiscountForAmounts([20000, 20000], -100)).toBe(0);
  });

  it("sans prix connu, rien ne borne la somme ; avec des montants standards, elle redonne la règle d'origine", () => {
    expect(referralDiscountForAmounts([2500, 2500], null)).toBe(5000);
    expect(referralDiscountForAmounts([1000, 1000, 1000], 6900)).toBe(referralDiscountCents(3, 6900));
    expect(referralDiscountForAmounts(Array(12).fill(1000), 6900)).toBe(referralDiscountCents(12, 6900));
  });
});

describe("parrainage : l'offre en cours", () => {
  const NOW = new Date("2026-10-10T08:00:00Z");
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const offer = (id: string, overrides: Partial<ReferralOfferWindow> = {}) => ({ id, amountCents: 2000, startsAt: day("2026-10-01"), endsAt: null, canceledAt: null, ...overrides });

  it("une offre démarrée, non annulée et sans fin est en cours", () => {
    expect(pickActiveReferralOffer([offer("a")], NOW)?.id).toBe("a");
  });

  it("une offre pas encore démarrée, annulée ou échue n'est pas en cours", () => {
    expect(pickActiveReferralOffer([offer("futur", { startsAt: day("2026-10-11") })], NOW)).toBeNull();
    expect(pickActiveReferralOffer([offer("annulee", { canceledAt: day("2026-10-05") })], NOW)).toBeNull();
    expect(pickActiveReferralOffer([offer("echue", { endsAt: day("2026-10-09") })], NOW)).toBeNull();
  });

  it("le jour de démarrage, l'offre est en cours ; à l'instant de sa fin, elle ne l'est plus", () => {
    expect(pickActiveReferralOffer([offer("a", { startsAt: NOW })], NOW)?.id).toBe("a");
    expect(pickActiveReferralOffer([offer("a", { endsAt: new Date(NOW.getTime() + 1) })], NOW)?.id).toBe("a");
    expect(pickActiveReferralOffer([offer("a", { endsAt: NOW })], NOW)).toBeNull();
  });

  it("plusieurs offres en cours : la plus récemment démarrée l'emporte, quel que soit l'ordre de la liste", () => {
    const old = offer("ancienne", { startsAt: day("2026-09-01"), amountCents: 1500 });
    const recent = offer("recente", { startsAt: day("2026-10-05"), amountCents: 3000 });
    expect(pickActiveReferralOffer([old, recent], NOW)?.id).toBe("recente");
    expect(pickActiveReferralOffer([recent, old], NOW)?.id).toBe("recente");
  });

  it("une offre plus récente mais échue ou annulée ne masque pas une offre encore valable", () => {
    const valid = offer("valable", { startsAt: day("2026-09-01") });
    const expired = offer("echue", { startsAt: day("2026-10-05"), endsAt: day("2026-10-08") });
    const canceled = offer("annulee", { startsAt: day("2026-10-06"), canceledAt: day("2026-10-07") });
    expect(pickActiveReferralOffer([expired, canceled, valid], NOW)?.id).toBe("valable");
  });

  it("à démarrage égal, la première de la liste (la plus récemment créée côté serveur) l'emporte", () => {
    expect(pickActiveReferralOffer([offer("premiere"), offer("seconde")], NOW)?.id).toBe("premiere");
  });

  it("aucune offre : rien", () => {
    expect(pickActiveReferralOffer([], NOW)).toBeNull();
  });
});
