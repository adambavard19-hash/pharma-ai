import { describe, expect, it } from "vitest";
import { lgpiInventoryToRecords, parseLgpiInventoryText } from "../lgpi-inventory";

/**
 * Un extrait SYNTHÉTIQUE, dans la mise en page exacte de l'édition
 * d'inventaire LGPI (texte extrait avec les colonnes conservées). Aucune
 * donnée réelle d'officine.
 */
const SAMPLE = ` PHARMACIE TEST                                                                                                Page       1     /      2
 1 rue du Test

 75001          PARIS
 TEST Donna
 Tél 0100000000         Fax
 Ape 4773Z              Siret 00000000000000


                                       Inventaire du 12/09/2026 04h26 valorisé par PAMP net

Tri par TVA, CIP, désignation, codification libre 4
Rupture sur TVA
  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3760000000017    KIT TEST SYNTHETIQUE                                         PHARMACIE              6             0,000             0,00       0%
                 PRODUIT SANS CODE                                            PHARMACIE              1            10,000         10,00          0%


  0%

                                                                              Qté en boite   Qté en unité                         Total

                                                                                         7               0                          10,00


  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3400930000012    LABO EXEMPLE 15CH DOSES                 hodos1 (HOMEO DOSES PHARMACIE               2             3,010             6,02      10%
                 GLOBULES                                TIROIR 1)
3400930000029    LABO EXEMPLE SIROP 150ML                hogra1 (HOMEO       PHARMACIE               1        12   3,330             3,33      10%
                                                         GRANULES TIROIR 1)
 PHARMACIE TEST                                                                                                Page       2     /      2
 1 rue du Test

 75001          PARIS
 TEST Donna
 Tél 0100000000         Fax
 Ape 4773Z              Siret 00000000000000


                                       Inventaire du 12/09/2026 04h26 valorisé par PAMP net
  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3401500000031    CREME MAINS 75ML                                             PHARMACIE               0             4,500             0,00      20%
`;

describe("édition d'inventaire LGPI", () => {
  it("extrait une ligne par produit, avec code, quantité, prix et TVA", () => {
    const inventory = parseLgpiInventoryText(SAMPLE);
    expect(inventory.pages).toBe(2);
    expect(inventory.priceBasis).toBe("PAMP net");
    expect(inventory.editedAt).toBe("12/09/2026 04h26");
    expect(inventory.lines).toHaveLength(5);
    expect(inventory.lines[0]).toEqual({ code: "3760000000017", name: "KIT TEST SYNTHETIQUE", quantity: 6, priceCents: 0, vatRate: 0 });
    expect(inventory.lines[1]).toEqual({ code: null, name: "PRODUIT SANS CODE", quantity: 1, priceCents: 1000, vatRate: 0 });
  });

  it("recolle une désignation coupée sur deux lignes et lit la quantité en boîtes quand une quantité en unités existe", () => {
    const { lines } = parseLgpiInventoryText(SAMPLE);
    expect(lines[2]).toMatchObject({ code: "3400930000012", name: "LABO EXEMPLE 15CH DOSES GLOBULES", quantity: 2, priceCents: 301, vatRate: 10 });
    expect(lines[3]).toMatchObject({ code: "3400930000029", name: "LABO EXEMPLE SIROP 150ML", quantity: 1, priceCents: 333 });
  });

  it("ignore les en-têtes, l'adresse répétée à chaque page et les sous-totaux", () => {
    const { lines } = parseLgpiInventoryText(SAMPLE);
    expect(lines.map((l) => l.name)).not.toContain("PHARMACIE TEST");
    expect(lines.some((l) => /Qté en boite|Page/.test(l.name))).toBe(false);
    expect(lines[4]).toMatchObject({ code: "3401500000031", quantity: 0, vatRate: 20 });
  });

  it("se présente comme un tableau que l'import reconnaît, avec le bon nom de colonne de prix", () => {
    const table = lgpiInventoryToRecords(parseLgpiInventoryText(SAMPLE));
    expect(table.headers).toEqual(["Code produit", "Désignation", "Qte Stock", "PA HT", "TVA"]);
    expect(table.records[0]).toMatchObject({ "Code produit": "3760000000017", "Qte Stock": 6, "PA HT": 0, TVA: 0 });
    const sale = lgpiInventoryToRecords({ ...parseLgpiInventoryText(SAMPLE), priceBasis: "Prix de vente" });
    expect(sale.headers[3]).toBe("PV TTC");
  });
});

describe("base de valorisation", () => {
  it("« valorisé par PV TTC » donne une colonne de prix de vente, « PAMP net » un prix d'achat", () => {
    const line = { code: "3400930000001", name: "X", quantity: 1, priceCents: 1234, vatRate: 10 } as never;
    expect(lgpiInventoryToRecords({ lines: [line], priceBasis: "PV TTC", editedAt: null, pages: 1 }).headers).toContain("PV TTC");
    expect(lgpiInventoryToRecords({ lines: [line], priceBasis: "Prix de vente", editedAt: null, pages: 1 }).headers).toContain("PV TTC");
    expect(lgpiInventoryToRecords({ lines: [line], priceBasis: "PAMP net", editedAt: null, pages: 1 }).headers).toContain("PA HT");
    expect(lgpiInventoryToRecords({ lines: [line], priceBasis: null, editedAt: null, pages: 1 }).headers).toContain("PA HT");
  });
});


describe("un total de 1 000 € et plus (espace des milliers)", () => {
  // Synthétique, dans la mise en page de l'édition « valorisé par PV TTC » : 52 × 26,95 € = 1 401,40 €.
  const PV = `                                       Inventaire du 13/10/2026 02h35 valorisé par PV TTC
  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3401560000001    PROBIOTIQUE TEST GELU BT30                                   PHARMACIE             52            26,950          1 401,40     5,5%
3401560000002    PROBIOTIQUE TEST GELU BT10                                   PHARMACIE              3            11,500             34,50     5,5%
3401560000003    GROS VOLUME TEST                                             PHARMACIE            400        12   30,000         12 000,00     20%
`;

  it("lit le prix, pas le « 1 » des milliers du total", () => {
    const { lines } = parseLgpiInventoryText(PV);
    expect(lines.map((line) => [line.code, line.quantity, line.priceCents, line.vatRate])).toEqual([
      ["3401560000001", 52, 2695, 5.5],
      ["3401560000002", 3, 1150, 5.5],
      ["3401560000003", 400, 3000, 20],
    ]);
  });
});

describe("un prix que le total ne confirme pas n'est jamais enregistré", () => {
  it("quantité gardée, prix laissé vide (l'ancien prix reste en base)", () => {
    const LINE = `                                       Inventaire du 13/10/2026 02h35 valorisé par PV TTC
  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
3401560000009    PRODUIT INCOHERENT                                           PHARMACIE              5            10,000            99,00     5,5%
`;
    const { lines } = parseLgpiInventoryText(LINE);
    expect(lines[0]).toMatchObject({ code: "3401560000009", quantity: 5, priceCents: null });
  });
});
