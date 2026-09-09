import { describe, expect, it } from "vitest";
import {
  classifyRows,
  expandCip,
  missingRequiredFields,
  normalizeName,
  parsePriceCents,
  parseQuantity,
  readRows,
  suggestMapping,
  summarize,
  type Lookups,
} from "..";

const lookups: Lookups = {
  presentationByCip13: new Map([
    ["3400932903818", { id: "pres-rulid", label: "RULID 150 mg, comprimé enrobé" }],
  ]),
  productByEan: new Map([["3400900000318", { id: "spray", name: "Spray nasal eau de mer isotonique" }]]),
  productByName: new Map([[normalizeName("Bain de bouche sans alcool"), { id: "bain", name: "Bain de bouche sans alcool" }]]),
  candidatesFor: (name) =>
    normalizeName(name).includes("magnesium")
      ? [{ id: "mag", label: "Magnésium Marin + B6", detail: "produit de l'officine" }]
      : [],
};

describe("reconnaissance des colonnes", () => {
  it("propose une correspondance depuis des en-têtes d'export officinal", () => {
    const mapping = suggestMapping(["Désignation", "Code CIP", "Qté stock", "Prix vente TTC", "Prix d'achat HT"]);
    expect(mapping).toEqual({
      name: "Désignation",
      code: "Code CIP",
      quantity: "Qté stock",
      salePrice: "Prix vente TTC",
      purchasePrice: "Prix d'achat HT",
    });
  });

  it("ne confond pas le prix d'achat avec le prix de vente", () => {
    const mapping = suggestMapping(["Produit", "Prix achat", "Quantité"]);
    expect(mapping.purchasePrice).toBe("Prix achat");
    expect(mapping.salePrice).toBeUndefined();
  });

  it("exige au moins la quantité et un nom ou un code", () => {
    expect(missingRequiredFields({})).toEqual(["quantity", "name"]);
    expect(missingRequiredFields({ quantity: "q", code: "c" })).toEqual([]);
  });
});

describe("lecture des lignes", () => {
  it("lit quantités et prix dans leurs formes usuelles", () => {
    expect(parseQuantity("12")).toEqual({ value: 12, issue: null });
    expect(parseQuantity(" 3 boîtes")).toEqual({ value: 3, issue: null });
    expect(parseQuantity("-2")).toEqual({ value: 0, issue: "QUANTITE_NEGATIVE" });
    expect(parseQuantity("beaucoup")).toEqual({ value: null, issue: "QUANTITE_INVALIDE" });
    expect(parsePriceCents("6,90 €")).toEqual({ value: 690, issue: null });
    expect(parsePriceCents(6.9)).toEqual({ value: 690, issue: null });
    expect(parsePriceCents("")).toEqual({ value: null, issue: "PRIX_MANQUANT" });
    expect(parsePriceCents("gratuit")).toEqual({ value: null, issue: "PRIX_INVALIDE" });
  });

  it("additionne les doublons et les signale", () => {
    const rows = readRows(
      [
        { nom: "Spray nasal", code: "3400900000318", qte: "5", prix: "6,90" },
        { nom: "Spray nasal", code: "3400900000318", qte: "3", prix: "6,90" },
      ],
      { name: "nom", code: "code", quantity: "qte", salePrice: "prix" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(8);
    expect(rows[0].issues).toContain("DOUBLON");
  });

  it("complète un CIP7 en CIP13 avec sa clé", () => {
    expect(expandCip("3290381")).toBe("3400932903818");
    expect(expandCip("3400932903818")).toBe("3400932903818");
    expect(expandCip("12")).toBeNull();
  });
});

describe("rattachement", () => {
  const rows = readRows(
    [
      { nom: "Rulid", code: "3400932903818", qte: "4", prix: "" },
      { nom: "Spray nasal eau de mer", code: "3400900000318", qte: "10", prix: "6,90" },
      { nom: "Bain de bouche sans alcool", code: "", qte: "0", prix: "7,90" },
      { nom: "Magnésium marin", code: "", qte: "6", prix: "13,90" },
      { nom: "Produit mystère", code: "", qte: "2", prix: "9,90" },
      { nom: "Ligne cassée", code: "", qte: "abc", prix: "1" },
      { nom: "", code: "", qte: "3", prix: "1" },
    ],
    { name: "nom", code: "code", quantity: "qte", salePrice: "prix" },
  );
  const classified = classifyRows(rows, lookups);

  it("privilégie le code au nom", () => {
    expect(classified[0]).toMatchObject({ status: "MEDICAMENT", targetId: "pres-rulid" });
    expect(classified[1]).toMatchObject({ status: "PRODUIT_EXISTANT", targetId: "spray" });
  });

  it("rattache un nom strictement identique, propose seulement un nom proche", () => {
    expect(classified[2]).toMatchObject({ status: "PRODUIT_EXISTANT", targetId: "bain" });
    expect(classified[3].status).toBe("A_VERIFIER");
    expect(classified[3].candidates[0].id).toBe("mag");
    expect(classified[3].targetId).toBeNull();
  });

  it("laisse l'inconnu et l'invalide à part, sans rien inventer", () => {
    expect(classified[4].status).toBe("NON_RECONNU");
    expect(classified[5].status).toBe("INVALIDE");
    expect(classified[6].status).toBe("INVALIDE");
  });

  it("garde une quantité à zéro comme une ligne valide : c'est une rupture, pas une erreur", () => {
    expect(classified[2].quantity).toBe(0);
    expect(classified[2].status).not.toBe("INVALIDE");
  });

  it("résume sans rien perdre", () => {
    expect(summarize(classified)).toEqual({
      detected: 7,
      medicaments: 1,
      existing: 2,
      toVerify: 1,
      unknown: 1,
      invalid: 2,
      withIssues: 3,
    });
  });
});

describe("colonnes supplémentaires : TVA, marque, catégorie", () => {
  it("reconnaît les en-têtes d'un export officinal complet", async () => {
    const { suggestMapping, parseVatRate, readRows } = await import("../index");
    const mapping = suggestMapping(["Code produit", "Désignation", "Qte Stock", "PV TTC", "PA HT", "TVA", "Laboratoire", "Rayon"]);
    expect(mapping).toEqual({
      code: "Code produit",
      name: "Désignation",
      quantity: "Qte Stock",
      salePrice: "PV TTC",
      purchasePrice: "PA HT",
      vatRate: "TVA",
      brand: "Laboratoire",
      category: "Rayon",
    });
    expect(parseVatRate("5,5 %")).toBe(5.5);
    expect(parseVatRate(0.2)).toBe(20);
    expect(parseVatRate("20")).toBe(20);
    expect(parseVatRate("beaucoup")).toBeNull();

    const rows = readRows([{ "Code produit": "3400934379444", Désignation: "ULTRA-LEVURE 100MG", "Qte Stock": "12", "PV TTC": "6,90", "PA HT": "4,10", TVA: "10", Laboratoire: "Biocodex", Rayon: "Digestion" }], mapping);
    expect(rows[0]).toMatchObject({ code: "3400934379444", quantity: 12, salePriceCents: 690, purchasePriceCents: 410, vatRate: 10, brand: "Biocodex", categoryLabel: "Digestion" });
  });

  it("CIP13 seul + quantité suffisent quand la référence est identifiable", async () => {
    const { suggestMapping, missingRequiredFields } = await import("../index");
    const mapping = suggestMapping(["CIP13", "Quantité"]);
    expect(mapping.code).toBe("CIP13");
    expect(missingRequiredFields(mapping)).toEqual([]);
  });
});
