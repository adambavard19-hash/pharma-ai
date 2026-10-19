import { describe, expect, it } from "vitest";
import { bestOrder, centsOf, eurosOf, possibleMargin } from "../mix-island";

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
