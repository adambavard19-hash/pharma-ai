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
