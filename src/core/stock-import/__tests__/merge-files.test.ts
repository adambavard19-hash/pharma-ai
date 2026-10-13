import { describe, expect, it } from "vitest";
import { lgpiInventoryToRecords, parseLgpiInventoryText } from "../lgpi-inventory";
import { MERGE_MAX_FILES, mergeImportFiles, mergedFileName, mergedToCsv, parseEditedAt } from "../merge-files";
import { readRows } from "../rows";
import { suggestMapping } from "../columns";

/**
 * Deux éditions d'inventaire LGPI SYNTHÉTIQUES (mise en page exacte, aucune donnée réelle) : la même officine, l'une
 * valorisée au PAMP net (prix d'achat), l'autre au PV TTC (prix de vente). Réunies, chaque produit a ses deux prix.
 */
const edition = (basis: string, at: string, lines: string[]) => ` PHARMACIE TEST                                                                                                Page       1     /      1
 1 rue du Test

 75001          PARIS
 TEST Donna
 Tél 0100000000         Fax
 Ape 4773Z              Siret 00000000000000


                                       Inventaire du ${at} valorisé par ${basis}

  Code Produit   Désignation                       Nb unité   Zone Géo.       Dépôt                Qté Qté         Prix        Total          Taux
                                                    / boite   principale                          boite unité                                  TVA
${lines.join("\n")}
`;
// Le total d'une ligne, comme LGPI l'écrit : quantité × prix, virgule décimale (le lecteur vérifie qu'il concorde).
const total = (qty: number, price: string) => (qty * Number(price.replace(",", "."))).toFixed(2).replace(".", ",");
const line = (code: string, name: string, qty: number, price: string, vat: string) =>
  `${code}    ${name.padEnd(34)}                           PHARMACIE              ${String(qty).padStart(2)}             ${price.padStart(6)}         ${total(qty, price).padStart(6)}      ${vat}`;

const lgpi = (fileName: string, basis: string, at: string, lines: string[]) => {
  const inventory = parseLgpiInventoryText(edition(basis, at, lines));
  return { fileName, ...lgpiInventoryToRecords(inventory), editedAt: inventory.editedAt, priceBasis: inventory.priceBasis };
};

const PAMP = lgpi("inventaire-pamp.pdf", "PAMP net", "12/10/2026 08h00", [
  line("3400930000012", "DOLIPRANE 1000MG CPR B/8", 10, "1,500", "2,1%"),
  line("3401500000031", "CREME MAINS 75ML", 4, "3,200", "20%"),
  line("3401500000048", "BAUME LEVRES", 2, "1,100", "20%"),
]);
const PV = lgpi("inventaire-pv.pdf", "PV TTC", "13/10/2026 09h30", [
  line("3400930000012", "DOLIPRANE 1000MG CPR B/8", 9, "2,180", "2,1%"),
  line("3401500000031", "CREME MAINS 75ML", 4, "6,900", "20%"),
  line("3401500000055", "SERUM PHYSIOLOGIQUE", 30, "3,500", "5,5%"),
]);

const ok = (result: ReturnType<typeof mergeImportFiles>) => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const rowsOf = (result: ReturnType<typeof ok>) => readRows(result.records, suggestMapping(result.headers));
const byCode = (result: ReturnType<typeof ok>, code: string) => rowsOf(result).find((row) => row.code === code)!;

describe("réunir une édition PAMP net et une édition PV TTC", () => {
  it("lit bien un prix d'achat d'un côté, un prix de vente de l'autre", () => {
    expect(PAMP.headers).toContain("PA HT");
    expect(PV.headers).toContain("PV TTC");
  });

  it("chaque produit commun a ses deux prix, par code produit", () => {
    const merged = ok(mergeImportFiles([PAMP, PV]));
    const doliprane = byCode(merged, "3400930000012");
    expect(doliprane).toMatchObject({ purchasePriceCents: 150, salePriceCents: 218, vatRate: 2.1, reimbursed: true });
    expect(byCode(merged, "3401500000031")).toMatchObject({ purchasePriceCents: 320, salePriceCents: 690, quantity: 4 });
    expect(merged.products).toBe(4);
    expect(merged.withBothPrices).toBe(2);
    expect(merged.files.map((file) => [file.fileName, file.priceKind, file.priceLabel])).toEqual([
      ["inventaire-pamp.pdf", "PURCHASE", "PAMP net"],
      ["inventaire-pv.pdf", "SALE", "PV TTC"],
    ]);
  });

  it("quantités différentes : celle de l'édition la plus récente, et l'écart est compté", () => {
    const merged = ok(mergeImportFiles([PAMP, PV]));
    expect(byCode(merged, "3400930000012").quantity).toBe(9); // PV TTC, édité le 13/10
    expect(merged.quantityConflicts).toBe(1);
    // Ordre d'envoi inversé : la date d'édition décide toujours.
    expect(byCode(ok(mergeImportFiles([PV, PAMP])), "3400930000012").quantity).toBe(9);
  });

  it("sans date d'édition, le dernier fichier envoyé fait foi", () => {
    const merged = ok(mergeImportFiles([{ ...PV, editedAt: null }, { ...PAMP, editedAt: null }]));
    expect(byCode(merged, "3400930000012").quantity).toBe(10);
  });

  it("un produit présent dans un seul fichier garde ce que ce fichier en dit, sans prix inventé", () => {
    const merged = ok(mergeImportFiles([PAMP, PV]));
    expect(byCode(merged, "3401500000048")).toMatchObject({ quantity: 2, purchasePriceCents: 110, salePriceCents: null });
    expect(byCode(merged, "3401500000055")).toMatchObject({ quantity: 30, purchasePriceCents: null, salePriceCents: 350, vatRate: 5.5 });
  });

  it("le CSV réuni se relit à l'identique (point-virgule, guillemets) et porte un nom qui dit les fichiers d'origine", () => {
    const merged = ok(mergeImportFiles([PAMP, { ...PV, records: [...PV.records, { "Code produit": "3401500000062", Désignation: 'GEL "FRAIS"; 200ML', "Qte Stock": 1, "PV TTC": 5, TVA: 20 }] }]));
    const csv = mergedToCsv(merged);
    expect(csv.startsWith("﻿Code produit;Désignation;Qte Stock;PA HT;PV TTC")).toBe(true);
    expect(csv).toContain('"GEL ""FRAIS""; 200ML"');
    expect(mergedFileName(["inventaire-pamp.pdf", "inventaire-pv.pdf"])).toBe("Réunion de 2 fichiers (inventaire-pamp.pdf + inventaire-pv.pdf).csv");
    expect(mergedFileName(["a".repeat(150) + ".pdf", "b".repeat(150) + ".pdf"])).toMatch(/…\)\.csv$/);
    expect(mergedFileName(["a".repeat(150) + ".pdf", "b".repeat(150) + ".pdf"]).length).toBeLessThanOrEqual(190);
  });
});

describe("CIP7 d'un côté, CIP13 de l'autre", () => {
  const csv = (fileName: string, rows: Record<string, unknown>[]) => ({ fileName, headers: Object.keys(rows[0]), records: rows });
  it("une même présentation est réunie (CIP7 ramené au CIP13), ses deux prix et l'écart de quantité aussi", () => {
    const achat = csv("export-achat.csv", [{ Code: "3400936403116", Désignation: "DOLIPRANE 1000MG", Qte: 10, "PA HT": "1,50" }]);
    const vente = csv("export-vente.csv", [{ Code: "3640311", Désignation: "DOLIPRANE 1000MG", Qte: 9, "PV TTC": "2,18" }]);
    for (const order of [[achat, vente], [vente, achat]]) {
      const merged = ok(mergeImportFiles(order));
      expect(merged.products).toBe(1);
      expect(merged.withBothPrices).toBe(1);
      expect(merged.quantityConflicts).toBe(1);
      expect(rowsOf(merged)[0]).toMatchObject({ code: "3400936403116", purchasePriceCents: 150, salePriceCents: 218, quantity: order[1].records[0].Qte });
    }
  });
});

describe("garde-fous de la réunion", () => {
  it(`${MERGE_MAX_FILES} fichiers au plus`, () => {
    expect(mergeImportFiles([PAMP, PV, PAMP, PV])).toEqual({ ok: false, error: expect.stringContaining("3 fichiers au plus") });
  });

  it("un fichier sans quantité bloque tout, avec son nom", () => {
    const result = mergeImportFiles([PAMP, { fileName: "tarifs.csv", headers: ["Code", "Prix"], records: [{ Code: "3400930000012", Prix: 2 }] }]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("« tarifs.csv »") });
  });

  it("un fichier lu en partie est signalé : la réunion n'est jamais un stock complet en silence", () => {
    const merged = ok(mergeImportFiles([PAMP, { ...PV, incomplete: true, incompleteReason: "2 pages du fichier n'ont pas pu être lues" }]));
    expect(merged.incomplete).toBe(true);
    expect(merged.incompleteReason).toContain("inventaire-pv.pdf");
  });

  it("lit la date d'édition LGPI", () => {
    expect(parseEditedAt("13/10/2026 09h30")).toBe(Date.UTC(2026, 9, 13, 9, 30));
    expect(parseEditedAt(null)).toBeNull();
  });
});
