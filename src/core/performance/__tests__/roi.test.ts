import { describe, expect, it } from "vitest";
import { computeSubscriptionReturn, returnSubscriptionPrice } from "../roi";
import type { ConfirmedLineRow, SubscriptionInfo, SubscriptionReturn } from "../types";

const NOW = new Date("2026-10-15T10:00:00Z");
const MONTH = "octobre 2026";

let counter = 0;
function line(overrides: Partial<ConfirmedLineRow> = {}): ConfirmedLineRow {
  counter += 1;
  return {
    saleId: `sale-${counter}`,
    saleCreatedAt: new Date("2026-10-10T09:00:00Z"),
    lineId: `line-${counter}`,
    recommendationId: `rec-${counter}`,
    origin: "AI",
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    quantity: 1,
    unitPriceCents: 1200,
    totalCents: 1200,
    vatRate: 20,
    ...overrides,
  };
}

/** `count` lignes au prix connu de `totalCents` TTC chacune. */
function pricedLines(count: number, totalCents = 1200, vatRate = 20): ConfirmedLineRow[] {
  return Array.from({ length: count }, () => line({ unitPriceCents: totalCents, totalCents, vatRate }));
}

function unpricedLines(count: number): ConfirmedLineRow[] {
  return Array.from({ length: count }, () => line({ unitPriceCents: 0, totalCents: 0 }));
}

const ACTIVE: SubscriptionInfo = { status: "ACTIVE", monthlyPriceHtCents: 12_600 };

function compute(subscription: SubscriptionInfo | null, monthLines: ConfirmedLineRow[]): SubscriptionReturn {
  return computeSubscriptionReturn({ subscription, monthLines, monthLabel: MONTH, now: NOW });
}

function shown(result: SubscriptionReturn) {
  if (result.status !== "shown") throw new Error(`attendu : affiché, reçu : masqué (${result.reason})`);
  return result;
}

describe("retour sur abonnement : les raisons de masquage", () => {
  it("no_subscription : aucun abonnement", () => {
    const result = compute(null, pricedLines(10));
    expect(result).toMatchObject({ status: "hidden", reason: "no_subscription" });
  });

  it("no_subscription : un statut hors ACTIVE / TRIALING / PAST_DUE n'ouvre pas le retour", () => {
    for (const status of ["CANCELED", "UNPAID", "INCOMPLETE", "PAUSED"]) {
      expect(compute({ status, monthlyPriceHtCents: 12_600 }, pricedLines(10))).toMatchObject({ status: "hidden", reason: "no_subscription" });
    }
  });

  it("no_price : prix de contrat absent, nul ou négatif", () => {
    for (const price of [null, 0, -100, Number.NaN]) {
      expect(compute({ status: "ACTIVE", monthlyPriceHtCents: price }, pricedLines(10))).toMatchObject({ status: "hidden", reason: "no_price" });
    }
  });

  it("no_data : aucune ligne confirmée dans le mois", () => {
    expect(compute(ACTIVE, [])).toMatchObject({ status: "hidden", reason: "no_data" });
  });

  it("no_data : des produits ajoutés à la main ne sont pas des ventes confirmées de conseils", () => {
    const manual = Array.from({ length: 8 }, () => line({ origin: "MANUAL" }));
    expect(compute(ACTIVE, manual)).toMatchObject({ status: "hidden", reason: "no_data" });
  });

  it("not_enough_sales : 4 lignes au prix connu ne suffisent pas, 5 suffisent", () => {
    const four = compute(ACTIVE, pricedLines(4));
    expect(four).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
    expect(four.status === "hidden" && four.detail).toBe(
      "Le retour s'affichera dès que 5 lignes de vente confirmées au prix connu auront été enregistrées ce mois-ci (4 pour l'instant).",
    );
    expect(compute(ACTIVE, pricedLines(5)).status).toBe("shown");
  });

  it("not_enough_sales : seules les lignes au prix connu comptent dans le seuil de 5", () => {
    const result = compute(ACTIVE, [...pricedLines(4), ...unpricedLines(6)]);
    expect(result).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
    expect(result.status === "hidden" && result.detail).toContain("(4 pour l'instant)");
  });

  it("prices_unreliable : 80 % de lignes au prix connu, c'est trop peu", () => {
    const result = compute(ACTIVE, [...pricedLines(8), ...unpricedLines(2)]);
    expect(result).toMatchObject({ status: "hidden", reason: "prices_unreliable" });
    expect(result.status === "hidden" && result.detail).toBe(
      "Le retour s'affichera dès que 90 % des lignes de vente confirmées du mois auront un prix renseigné (80 % pour l'instant).",
    );
  });

  it("prices_unreliable : le seuil est 90 % pile (9 sur 10 et 18 sur 20 passent, 17 sur 20 non)", () => {
    expect(compute(ACTIVE, [...pricedLines(9), ...unpricedLines(1)]).status).toBe("shown");
    expect(compute(ACTIVE, [...pricedLines(18), ...unpricedLines(2)]).status).toBe("shown");
    expect(compute(ACTIVE, [...pricedLines(17), ...unpricedLines(3)])).toMatchObject({ status: "hidden", reason: "prices_unreliable" });
  });

  it("prices_unreliable : le pourcentage annoncé ne flatte jamais (89,47 % s'affiche 89 %)", () => {
    // 17 lignes au prix connu sur 19 = 89,47 %
    const result = compute(ACTIVE, [...pricedLines(17), ...unpricedLines(2)]);
    expect(result.status === "hidden" && result.detail).toContain("(89 % pour l'instant)");
  });

  it("prices_unreliable : le pourcentage annoncé n'est pas rogné par la dérive des flottants (29 sur 100 s'écrit 29 %, pas 28 %)", () => {
    // 0,29 × 100 = 28,999999999999996 en machine : un simple `floor` écrirait 28 %.
    const result = compute(ACTIVE, [...pricedLines(29), ...unpricedLines(71)]);
    expect(result).toMatchObject({ status: "hidden", reason: "prices_unreliable" });
    expect(result.status === "hidden" && result.detail).toContain("(29 % pour l'instant)");
    const other = compute(ACTIVE, [...pricedLines(57), ...unpricedLines(43)]);
    expect(other.status === "hidden" && other.detail).toContain("(57 % pour l'instant)");
  });

  it("l'ordre des raisons : l'abonnement avant le prix, le prix avant les données", () => {
    expect(compute(null, [])).toMatchObject({ reason: "no_subscription" });
    expect(compute({ status: "ACTIVE", monthlyPriceHtCents: null }, [])).toMatchObject({ reason: "no_price" });
    expect(compute(ACTIVE, [])).toMatchObject({ reason: "no_data" });
    expect(compute(ACTIVE, unpricedLines(3))).toMatchObject({ reason: "not_enough_sales" });
  });

  it("chaque raison masquée porte une phrase lisible", () => {
    const results = [compute(null, []), compute({ status: "ACTIVE", monthlyPriceHtCents: null }, []), compute(ACTIVE, []), compute(ACTIVE, pricedLines(2))];
    for (const result of results) {
      expect(result.status).toBe("hidden");
      expect(result.status === "hidden" && result.detail.length).toBeGreaterThan(20);
    }
  });
});

describe("retour sur abonnement : un abonnement partagé entre plusieurs officines", () => {
  const SHARED: SubscriptionInfo = { status: "ACTIVE", monthlyPriceHtCents: 49_900, shared: true };
  const DETAIL =
    "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.";

  it("est masqué, avec sa raison, même quand le ratio serait flatteur (3 200 € HT contre un abonnement de groupe de 499 €)", () => {
    // 5 lignes × 768 € TTC = 3 200 € HT : « 6,4 fois » serait affiché pour un abonnement de CETTE officine seule.
    const lines = pricedLines(5, 76_800, 20);
    expect(shown(compute({ ...SHARED, shared: false }, lines)).ratioLabel).toBe("6,4 fois");
    const result = compute(SHARED, lines);
    expect(result).toEqual({ status: "hidden", reason: "shared_subscription", detail: DETAIL });
  });

  it("est masqué même sans aucune vente : la raison du groupe passe avant « pas de données » et « pas assez de ventes »", () => {
    expect(compute(SHARED, [])).toMatchObject({ status: "hidden", reason: "shared_subscription" });
    expect(compute(SHARED, pricedLines(2))).toMatchObject({ status: "hidden", reason: "shared_subscription" });
    expect(compute(SHARED, [...pricedLines(8), ...unpricedLines(2)])).toMatchObject({ reason: "shared_subscription" });
  });

  it("l'ordre : pas d'abonnement en cours avant « partagé », « partagé » avant « prix inconnu »", () => {
    expect(compute({ ...SHARED, status: "CANCELED" }, pricedLines(10))).toMatchObject({ reason: "no_subscription" });
    expect(compute(null, pricedLines(10))).toMatchObject({ reason: "no_subscription" });
    expect(compute({ ...SHARED, monthlyPriceHtCents: null }, pricedLines(10))).toMatchObject({ reason: "shared_subscription" });
  });

  it("un abonnement non partagé (shared: false, ou champ absent) se calcule comme avant", () => {
    expect(compute({ status: "ACTIVE", monthlyPriceHtCents: 12_600, shared: false }, pricedLines(5)).status).toBe("shown");
    expect(compute({ status: "ACTIVE", monthlyPriceHtCents: 12_600 }, pricedLines(5)).status).toBe("shown");
  });

  it("returnSubscriptionPrice ne rend aucun prix pour un abonnement partagé (ce qui coupe aussi la règle « forte valeur » du portefeuille)", () => {
    expect(returnSubscriptionPrice(SHARED)).toBeNull();
    expect(returnSubscriptionPrice({ ...SHARED, shared: false })).toBe(49_900);
    expect(returnSubscriptionPrice({ status: "TRIALING", monthlyPriceHtCents: 49_900, shared: true })).toBeNull();
  });
});

describe("retour sur abonnement : le calcul", () => {
  it("TVA par ligne : chaque ligne est ramenée hors taxes avec SON taux", () => {
    const lines = [
      line({ totalCents: 12_000, unitPriceCents: 12_000, vatRate: 20 }), // 10 000 HT
      line({ totalCents: 12_000, unitPriceCents: 12_000, vatRate: 20 }), // 10 000 HT
      line({ totalCents: 1055, unitPriceCents: 1055, vatRate: 5.5 }), //  1 000 HT
      line({ totalCents: 1100, unitPriceCents: 1100, vatRate: 10 }), //  1 000 HT
      line({ totalCents: 1200, unitPriceCents: 1200, vatRate: 0 }), //  1 200 HT
    ];
    const result = shown(compute({ status: "ACTIVE", monthlyPriceHtCents: 5500 }, lines));
    expect(result.confirmedTtcCents).toBe(27_355);
    expect(result.confirmedHtCents).toBe(23_200);
    // Un taux unique de 20 % sur tout donnerait 22 796 HT, donc « 4,1 fois » : faux.
    expect(result.ratio).toBeCloseTo(23_200 / 5500, 10);
    expect(result.ratioLabel).toBe("4,2 fois");
  });

  it("les centimes restent entiers et ne dérivent pas : on n'arrondit qu'une fois", () => {
    // 6 × 1 000 c TTC à 20 % = 6 × 833,33 = 5 000 HT (arrondir ligne à ligne donnerait 4 998)
    const result = shown(compute(ACTIVE, pricedLines(6, 1000, 20)));
    expect(result.confirmedHtCents).toBe(5000);
    expect(Number.isInteger(result.confirmedHtCents)).toBe(true);
    expect(Number.isInteger(result.confirmedTtcCents)).toBe(true);
  });

  it("une ligne au prix 0 n'apporte aucun chiffre d'affaires, même avec un total parasite", () => {
    const parasite = line({ unitPriceCents: 0, totalCents: 9999 });
    const result = shown(compute(ACTIVE, [...pricedLines(9, 1200), parasite]));
    expect(result.confirmedTtcCents).toBe(9 * 1200);
    expect(result.confirmedLines).toBe(9);
    expect(result.pricedShare).toBeCloseTo(0.9, 10);
  });

  it("les produits ajoutés à la main sont ignorés du chiffre et de la part de prix connus", () => {
    const manual = Array.from({ length: 6 }, () => line({ origin: "MANUAL", unitPriceCents: 0, totalCents: 0 }));
    const manualPriced = line({ origin: "MANUAL", unitPriceCents: 50_000, totalCents: 50_000 });
    const result = shown(compute(ACTIVE, [...pricedLines(5, 1200), ...manual, manualPriced]));
    expect(result.confirmedTtcCents).toBe(6000);
    expect(result.pricedShare).toBe(1);
  });

  it("les conseils de règle (RULE) comptent comme ceux de l'IA", () => {
    const lines = Array.from({ length: 5 }, () => line({ origin: "RULE" }));
    expect(compute(ACTIVE, lines).status).toBe("shown");
  });

  it("renvoie le mois, le prix du contrat, les lignes et la part de prix connus", () => {
    const result = shown(compute({ status: "ACTIVE", monthlyPriceHtCents: 12_600 }, pricedLines(5, 12_000, 20)));
    expect(result).toMatchObject({
      status: "shown",
      monthLabel: "octobre 2026",
      monthlyPriceHtCents: 12_600,
      trialing: false,
      confirmedTtcCents: 60_000,
      confirmedHtCents: 50_000,
      confirmedLines: 5,
      pricedShare: 1,
    });
    expect(result.ratio).toBeCloseTo(50_000 / 12_600, 10);
  });

  it("la phrase du cahier des charges : « 4,2 fois »", () => {
    // 52 920 HT ÷ 12 600 HT = 4,2 pile
    const result = shown(compute(ACTIVE, pricedLines(6, 10_584, 20)));
    expect(result.confirmedHtCents).toBe(52_920);
    expect(result.ratioLabel).toBe("4,2 fois");
    expect(result.sentence).toBe(
      "PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).",
    );
  });
});

describe("retour sur abonnement : essai et statuts", () => {
  it("pendant l'essai : « abonnement après essai »", () => {
    const result = shown(compute({ status: "TRIALING", monthlyPriceHtCents: 12_600 }, pricedLines(6, 10_584, 20)));
    expect(result.trialing).toBe(true);
    expect(result.sentence).toBe(
      "PharmaBoost a généré 4,2 fois le montant de votre abonnement après essai en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).",
    );
  });

  it("ACTIVE et PAST_DUE ne sont pas des essais", () => {
    for (const status of ["ACTIVE", "PAST_DUE"]) {
      const result = shown(compute({ status, monthlyPriceHtCents: 12_600 }, pricedLines(5)));
      expect(result.trialing).toBe(false);
      expect(result.sentence).not.toContain("après essai");
    }
  });

  it("returnSubscriptionPrice ne rend un prix que pour un abonnement en cours au prix connu", () => {
    expect(returnSubscriptionPrice(ACTIVE)).toBe(12_600);
    expect(returnSubscriptionPrice({ status: "TRIALING", monthlyPriceHtCents: 9900 })).toBe(9900);
    expect(returnSubscriptionPrice({ status: "CANCELED", monthlyPriceHtCents: 9900 })).toBeNull();
    expect(returnSubscriptionPrice({ status: "ACTIVE", monthlyPriceHtCents: null })).toBeNull();
    expect(returnSubscriptionPrice(null)).toBeNull();
  });
});

describe("retour sur abonnement : le ratio en toutes lettres", () => {
  /** Un ratio voulu : 5 lignes à 20 % pour un total HT donné, face à un prix de 10 000 c. */
  function ratioOf(htCents: number) {
    const perLineTtc = (htCents * 1.2) / 5;
    return shown(compute({ status: "ACTIVE", monthlyPriceHtCents: 10_000 }, pricedLines(5, perLineTtc, 20)));
  }

  it("sous 1, on le dit sans maquillage : « 0,6 fois »", () => {
    const result = ratioOf(6000);
    expect(result.ratio).toBeCloseTo(0.6, 10);
    expect(result.ratioLabel).toBe("0,6 fois");
    expect(result.sentence).toContain("0,6 fois le montant de votre abonnement");
  });

  it("jamais « 1,0 fois » pour un ratio sous 1 : 0,96 s'affiche « 0,9 fois »", () => {
    expect(ratioOf(9600).ratioLabel).toBe("0,9 fois");
    expect(ratioOf(9500).ratioLabel).toBe("0,9 fois");
    expect(ratioOf(9400).ratioLabel).toBe("0,9 fois");
  });

  it("à 1 pile : « 1,0 fois » ; au-dessus : arrondi au dixième, virgule française", () => {
    expect(ratioOf(10_000).ratioLabel).toBe("1,0 fois");
    expect(ratioOf(10_400).ratioLabel).toBe("1,0 fois");
    expect(ratioOf(10_600).ratioLabel).toBe("1,1 fois");
    expect(ratioOf(30_000).ratioLabel).toBe("3,0 fois");
    expect(ratioOf(42_500).ratioLabel).toBe("4,3 fois");
    expect(ratioOf(123_400).ratioLabel).toBe("12,3 fois");
  });

  it("jamais de point décimal ni de NaN dans le libellé", () => {
    for (const ht of [6000, 10_000, 25_000, 123_456]) {
      expect(ratioOf(ht).ratioLabel).toMatch(/^\d+,\d fois$/);
    }
  });
});
