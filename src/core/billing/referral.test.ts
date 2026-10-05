import { describe, expect, it } from "vitest";
import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";
import {
  normalizeReferralCode,
  pickActiveReferralOffer,
  referralBenefit,
  referralDiscountCents,
  referralDiscountForAmounts,
  referralOfferAmountFor,
  referralPercentDiscountCents,
  REFERRAL_DISCOUNT_PERCENT,
  type ReferralOfferWindow,
} from "./referral";

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
});

describe("parrainage : 20 % de moins par mois, une seule fois", () => {
  it("le pourcentage est celui de l'offre officielle : une seule source, 20 %", () => {
    expect(REFERRAL_DISCOUNT_PERCENT).toBe(OFFICIAL_OFFER.referralDiscountPercent);
    expect(REFERRAL_DISCOUNT_PERCENT).toBe(20);
  });

  it("126 € par mois : 20 % de moins, soit 25,20 € de remise et 100,80 € à payer", () => {
    expect(referralDiscountCents(1, 12_600)).toBe(2_520);
    expect(12_600 - referralDiscountCents(1, 12_600)).toBe(10_080);
  });

  it("sans filleul actif, aucune remise", () => {
    expect(referralDiscountCents(0, 12_600)).toBe(0);
    expect(referralDiscountCents(-1, 12_600)).toBe(0);
  });

  it("sans abonnement (prix inconnu) ou à prix nul, aucune remise : rien à réduire", () => {
    expect(referralDiscountCents(3, null)).toBe(0);
    expect(referralDiscountCents(3, 0)).toBe(0);
    expect(referralDiscountCents(3, -100)).toBe(0);
    expect(referralPercentDiscountCents(null)).toBe(0);
    expect(referralPercentDiscountCents(Number.NaN)).toBe(0);
  });

  it("NON CUMULABLE : deux, trois ou douze filleuls donnent toujours 20 %, jamais 40 %", () => {
    const one = referralDiscountCents(1, 12_600);
    expect(referralDiscountCents(2, 12_600)).toBe(one);
    expect(referralDiscountCents(3, 12_600)).toBe(one);
    expect(referralDiscountCents(12, 12_600)).toBe(one);
    expect(referralDiscountCents(2, 12_600)).not.toBe(5_040);
  });

  it("20 % du prix CONTRACTUEL de l'officine, pas du prix catalogue : un contrat à 99 € donne 19,80 €", () => {
    expect(referralDiscountCents(1, 9_900)).toBe(1_980);
    expect(referralDiscountCents(1, 6_900)).toBe(1_380);
  });

  it("arrondi au centime : 99,99 € → 20,00 € (19,998), 100,03 € → 20,01 € (20,006)", () => {
    expect(referralPercentDiscountCents(9_999)).toBe(2_000);
    expect(referralPercentDiscountCents(10_003)).toBe(2_001);
    expect(referralPercentDiscountCents(10_001)).toBe(2_000);
    expect(Number.isInteger(referralPercentDiscountCents(12_347))).toBe(true);
  });

  it("la remise ne dépasse jamais le prix payé", () => {
    for (const price of [1, 50, 12_600, 1_000_000]) expect(referralDiscountCents(1, price)).toBeLessThanOrEqual(price);
  });
});

describe("parrainage : le montant d'une offre de la console, exception explicite", () => {
  it("un filleul inscrit pendant une offre porte son montant figé ; hors offre (null, 0, NaN), rien : c'est la règle des 20 %", () => {
    expect(referralOfferAmountFor({ referralAmountCents: 2000 })).toBe(2000);
    expect(referralOfferAmountFor({ referralAmountCents: null })).toBeNull();
    expect(referralOfferAmountFor({ referralAmountCents: 0 })).toBeNull();
    expect(referralOfferAmountFor({ referralAmountCents: Number.NaN })).toBeNull();
  });

  it("la somme des montants d'offre, bornée par le prix contractuel, jamais négative", () => {
    expect(referralDiscountForAmounts([2500, 3000], 12_600)).toBe(5500);
    expect(referralDiscountForAmounts([], 12_600)).toBe(0);
    expect(referralDiscountForAmounts([20_000, 20_000], 12_600)).toBe(12_600);
    expect(referralDiscountForAmounts([1000, -500], 12_600)).toBe(1000);
    expect(referralDiscountForAmounts([1000, Number.NaN], 12_600)).toBe(1000);
  });

  it("sans abonnement (prix inconnu, nul ou négatif), aucune remise non plus", () => {
    expect(referralDiscountForAmounts([2500, 2500], null)).toBe(0);
    expect(referralDiscountForAmounts([2500], 0)).toBe(0);
    expect(referralDiscountForAmounts([2500], -100)).toBe(0);
  });
});

describe("parrainage : le plus avantageux entre les 20 % et les montants d'offre", () => {
  const active = (offerAmountCents: number | null = null) => ({ active: true, offerAmountCents });

  it("sans filleul actif : rien, même avec des montants d'offre sur des filleuls inactifs", () => {
    expect(referralBenefit([], 12_600)).toEqual({ discountCents: 0, basis: null });
    expect(referralBenefit([{ active: false, offerAmountCents: 4000 }, { active: false, offerAmountCents: null }], 12_600)).toEqual({ discountCents: 0, basis: null });
  });

  it("sans abonnement : rien", () => {
    expect(referralBenefit([active(), active(4000)], null)).toEqual({ discountCents: 0, basis: null });
  });

  it("un ou plusieurs filleuls hors offre : 20 %, jamais plus", () => {
    expect(referralBenefit([active()], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
    expect(referralBenefit([active(), active(), active()], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
  });

  it("un filleul inactif ne compte pas, qu'il porte ou non un montant d'offre", () => {
    expect(referralBenefit([{ active: false, offerAmountCents: null }, active()], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
    expect(referralBenefit([{ active: false, offerAmountCents: 9_000 }, active()], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
  });

  it("l'offre de la console est prioritaire quand la somme de ses montants est PLUS avantageuse que les 20 %", () => {
    // Deux filleuls inscrits pendant une offre à 20 € : 40 € de remise, plus que 25,20 €.
    expect(referralBenefit([active(2000), active(2000)], 12_600)).toEqual({ discountCents: 4_000, basis: "OFFERS" });
    // Un seul filleul à 40 € : 40 € contre 25,20 €.
    expect(referralBenefit([active(4000)], 12_600)).toEqual({ discountCents: 4_000, basis: "OFFERS" });
  });

  it("les 20 % l'emportent quand les montants d'offre sont moins avantageux (ou égaux : c'est la règle, pas l'exception)", () => {
    expect(referralBenefit([active(1000)], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
    expect(referralBenefit([active(2_520)], 12_600)).toEqual({ discountCents: 2_520, basis: "PERCENT" });
  });

  it("les montants d'offre s'additionnent entre filleuls d'offre, jamais avec les 20 % : une seule des deux voies s'applique", () => {
    // Un filleul hors offre et un à 30 € : 30 € (offres) contre 25,20 € (20 %) : 30 €, pas 55,20 €.
    expect(referralBenefit([active(), active(3000)], 12_600)).toEqual({ discountCents: 3_000, basis: "OFFERS" });
  });

  it("bornée par le prix contractuel", () => {
    expect(referralBenefit([active(20_000), active(20_000)], 12_600)).toEqual({ discountCents: 12_600, basis: "OFFERS" });
    expect(referralBenefit([active(20_000)], 5_000)).toEqual({ discountCents: 5_000, basis: "OFFERS" });
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
