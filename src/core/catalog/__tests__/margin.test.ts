import { describe, expect, it } from "vitest";
import { parseReimbursement, reimbursementFromBdpm, reimbursementFromVat, unitMarginHt } from "../margin";

describe("marge HT par unité", () => {
  it("prix de vente TTC ramené au HT, moins le prix d'achat HT (AEQUASYAL, export réel : 7,97 € TTC, 6,40 € HT, TVA 20 %)", () => {
    expect(unitMarginHt({ salePriceCents: 797, purchasePriceCents: 640, vatRate: 20 })).toEqual({ saleHtCents: 664, marginCents: 24, rate: expect.closeTo(0.0364, 3) });
  });

  it("la TVA n'est pas de la marge : 11,90 € TTC à 20 % pour 6,80 € HT d'achat, c'est 3,12 € — pas 5,10 €", () => {
    expect(unitMarginHt({ salePriceCents: 1190, purchasePriceCents: 680, vatRate: 20 })?.marginCents).toBe(312);
  });

  it("un médicament remboursable à 2,1 %, un non remboursable à 10 %", () => {
    expect(unitMarginHt({ salePriceCents: 1021, purchasePriceCents: 800, vatRate: 2.1 })?.marginCents).toBe(200);
    expect(unitMarginHt({ salePriceCents: 1100, purchasePriceCents: 800, vatRate: 10 })?.marginCents).toBe(200);
  });

  it("vendu sous le prix d'achat : la marge négative est dite, pas maquillée", () => {
    expect(unitMarginHt({ salePriceCents: 600, purchasePriceCents: 600, vatRate: 20 })?.marginCents).toBe(-100);
  });

  it.each([
    ["sans prix de vente", { salePriceCents: 0, purchasePriceCents: 640, vatRate: 20 }],
    ["sans prix d'achat", { salePriceCents: 797, purchasePriceCents: 0, vatRate: 20 }],
    ["sans TVA connue", { salePriceCents: 797, purchasePriceCents: 640, vatRate: null }],
    ["TVA aberrante", { salePriceCents: 797, purchasePriceCents: 640, vatRate: 120 }],
  ])("%s : marge inconnue, rien n'est inventé", (_, prices) => {
    expect(unitMarginHt(prices)).toBeNull();
  });
});

describe("remboursement : seulement ce qui est lu", () => {
  it.each([
    ["PH7", true, "export : prestation PH7"],
    ["ph4", true, "export : prestation PH4"],
    [" PH1 ", true, "export : prestation PH1"],
    ["PH2", true, "export : prestation PH2"],
    ["PHN", false, "export : prestation PHN"],
    ["AAD", true, "export : prestation AAD (LPP)"],
    ["1100034", true, "export : code LPP 1100034"],
    ["65 %", true, "export : remboursé à 65 %"],
    ["30", true, "export : remboursé à 30 %"],
    [0.65, true, "export : remboursé à 65 %"],
    ["0", false, "export : taux de remboursement 0 %"],
    [0, false, "export : taux de remboursement 0 %"],
    ["Non remboursable", false, "export : non remboursé"],
    ["NR", false, "export : non remboursé"],
    ["oui", true, "export : remboursé"],
  ])("« %s » → %s", (raw, reimbursed, source) => {
    expect(parseReimbursement(raw)).toEqual({ reimbursed, source });
  });

  it.each([[""], [null], [undefined], ["XYZ"], ["PH9"], ["150"], ["TAR"]])("« %s » : inconnu — on n'étend pas une liste non vérifiée", (raw) => {
    expect(parseReimbursement(raw)).toBeNull();
  });

  it("TVA à 2,1 % : médicament remboursable ; 10 % ou 20 % ne disent rien", () => {
    expect(reimbursementFromVat(2.1)).toEqual({ reimbursed: true, source: "TVA 2,1 % (médicament remboursable)" });
    expect(reimbursementFromVat(10)).toBeNull();
    expect(reimbursementFromVat(20)).toBeNull();
    expect(reimbursementFromVat(null)).toBeNull();
  });

  it("BDPM : un taux publié, ou ni taux ni prix (non remboursable), ou la fiche de l'Assurance Maladie", () => {
    expect(reimbursementFromBdpm({ reimbursementRate: 65, priceCents: 321 })).toEqual({ reimbursed: true, source: "BDPM : remboursé à 65 %" });
    expect(reimbursementFromBdpm({ reimbursementRate: null, priceCents: null })).toEqual({ reimbursed: false, source: "BDPM : non remboursable" });
    expect(reimbursementFromBdpm({ reimbursementRate: 65, priceCents: 321, notReimbursable: true })).toEqual({ reimbursed: false, source: "Assurance Maladie : non remboursable" });
    // Un prix sans taux : la source est incomplète, on ne tranche pas.
    expect(reimbursementFromBdpm({ reimbursementRate: null, priceCents: 321 })).toBeNull();
  });
});
