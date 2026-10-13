import { describe, expect, it, vi } from "vitest";

/**
 * Plusieurs fichiers dans un envoi : lus avec les lecteurs habituels, réunis, rendus en un CSV que l'import relit.
 * Un fichier illisible bloque tout l'envoi, avec son nom.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("../pdf-text", () => ({ extractPdfLayoutText: vi.fn(async () => ({ text: "rien", pages: 1, skippedPages: 0, totalPages: 1 })) }));
vi.mock("../product-classification", () => ({ classifyPharmacyProducts: vi.fn() }));

const { combineStockFiles } = await import("../stock-files");
const { parseImportFile } = await import("../stock-import");
const { readRows, suggestMapping } = await import("@/core/stock-import");

const csv = (text: string) => new TextEncoder().encode(text);
const PAMP = { fileName: "stock-pamp.csv", bytes: csv("Code produit;Désignation;Qté stock;PAMP net;TVA\n3400930000012;DOLIPRANE 1000;10;1,50;2,1\n3401500000031;CREME MAINS;4;3,20;20\n") };
const PV = { fileName: "stock-pv.csv", bytes: csv("Code produit;Désignation;Qté stock;PV TTC;TVA\n3400930000012;DOLIPRANE 1000;9;2,18;2,1\n3401500000055;SERUM;30;3,50;5,5\n") };

describe("combineStockFiles", () => {
  it("un seul fichier : l'envoi d'avant, octet pour octet", async () => {
    const result = await combineStockFiles([PAMP]);
    expect(result).toMatchObject({ ok: true, fileName: "stock-pamp.csv", merge: null });
    expect(result.ok && result.bytes).toBe(PAMP.bytes);
  });

  it("deux CSV : un fichier réuni, relu par l'import avec les deux prix de chaque produit commun", async () => {
    const result = await combineStockFiles([PAMP, PV]);
    if (!result.ok) throw new Error(result.error);
    expect(result.fileName).toBe("Réunion de 2 fichiers (stock-pamp.csv + stock-pv.csv).csv");
    expect(result.merge).toMatchObject({ quantityConflicts: 1, files: [{ priceKind: "PURCHASE", priceLabel: "PAMP net" }, { priceKind: "SALE", priceLabel: "PV TTC" }] });
    const parsed = parseImportFile(result.fileName, result.bytes);
    const rows = readRows(parsed.records, suggestMapping(parsed.headers));
    expect(rows.find((row) => row.code === "3400930000012")).toMatchObject({ quantity: 9, purchasePriceCents: 150, salePriceCents: 218, vatRate: 2.1, name: "DOLIPRANE 1000" });
    expect(rows.find((row) => row.code === "3401500000031")).toMatchObject({ quantity: 4, purchasePriceCents: 320, salePriceCents: null });
    expect(rows.find((row) => row.code === "3401500000055")).toMatchObject({ quantity: 30, purchasePriceCents: null, salePriceCents: 350 });
  });

  it("un fichier illisible bloque l'envoi entier, avec son nom, sans rien réunir", async () => {
    const result = await combineStockFiles([PAMP, { fileName: "scan.pdf", bytes: csv("%PDF-1.4") }]);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/« scan\.pdf ».*Rien n'a été modifié\./) });
  });

  it("garde-fous : 3 fichiers au plus, formats et taille vérifiés pour chacun", async () => {
    expect(await combineStockFiles([PAMP, PV, PAMP, PV])).toEqual({ ok: false, error: expect.stringContaining("3 fichiers au plus") });
    expect(await combineStockFiles([PAMP, { fileName: "photo.jpg", bytes: csv("x") }])).toEqual({ ok: false, error: expect.stringContaining("« photo.jpg » : format non accepté") });
    expect(await combineStockFiles([PAMP, { fileName: "vide.csv", bytes: new Uint8Array() }])).toEqual({ ok: false, error: "« vide.csv » est vide." });
  });
});
