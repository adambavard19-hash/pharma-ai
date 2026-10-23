import { describe, expect, it } from "vitest";
import { bestOrder, centsOf, eurosOf, headsByBox, possibleMargin } from "../mix-island";

/** La bannière « mix » (19 oct. 2026) : le meilleur conseil d'abord, et la marge possible de la vente. */

describe("le meilleur conseil d'abord", () => {
  it("challenge et date courte d'abord, puis la meilleure marge ; à égalité, l'ordre du serveur", () => {
    const items = [{ margin: "1,85 €" }, { margin: "4,79 €", challenge: true }, { margin: "4,79 €", shortDate: "11/2026" }, { margin: "9,00 €" }, { margin: "4,79 €", challenge: true, shortDate: "11/2026" }];
    expect(bestOrder(items)).toEqual([4, 1, 2, 3, 0]);
  });

  it("lit les montants affichés et additionne seulement les marges connues", () => {
    expect(centsOf("4,79 €")).toBe(479);
    expect(centsOf("12,5 €")).toBe(1250);
    expect(centsOf(undefined)).toBe(0);
    expect(possibleMargin([{ margin: "1,85 €" }, { margin: "4,79 €" }, {}, { margin: "4,79 €" }])).toBe(1143);
    expect(eurosOf(1143)).toBe("11,43 €");
  });
});

describe("le haut de la bannière repliée : une ligne par boîte scannée (23 oct. 2026)", () => {
  const items = [
    { drug: "VOGALIB 7,5MG", margin: "1,20 €" },
    { drug: "PHLOROGLUC MYLA", margin: "4,64 €" },
    { drug: "VOGALIB 7,5MG", margin: "3,10 €", challenge: true },
    { drug: "PHLOROGLUC MYLA", margin: "2,00 €" },
  ];
  const order = bestOrder(items);

  it("produit 1 puis produit 2, dans l'ordre du scan, chacun avec son meilleur conseil (challenge, date courte, puis marge)", () => {
    expect(headsByBox(items, order, () => false)).toEqual([2, 1]);
  });

  it("un conseil vendu laisse la ligne au conseil suivant de la même boîte ; tous vendus, la ligne montre le vendu", () => {
    expect(headsByBox(items, order, (index) => index === 2)).toEqual([0, 1]);
    expect(headsByBox(items, order, (index) => index === 0 || index === 2)).toEqual([2, 1]);
  });

  it("une seule boîte : une seule ligne ; un conseil sans boîte connue fait sa propre ligne", () => {
    expect(headsByBox([{ drug: "A" }, { drug: "A" }], [1, 0], () => false)).toEqual([1]);
    expect(headsByBox([{ drug: "A" }, { drug: "" }, {}], [0, 1, 2], () => false)).toEqual([0, 1, 2]);
  });
});
