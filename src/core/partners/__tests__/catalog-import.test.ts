import { describe, expect, it } from "vitest";
import { detectDelimiter, normalizeHeader, parseActive, parseCatalogCsv, parseEuroCents, planCatalogImport, splitCsv } from "../catalog-import";

/**
 * Import d'un catalogue partenaire collé : chaque ligne est validée, aucune
 * n'est complétée ni inventée. Les codes ci-dessous sont des codes de test
 * (clé de contrôle juste), pas des produits réels.
 */

const EAN_A = "3760000000017";
const EAN_B = "3760000000024";
const CIP_A = "3400930000014";
const RANGES = [{ id: "r1", name: "Hydratation intense" }];

describe("lecture du texte collé", () => {
  it("détecte le séparateur de l'en-tête", () => {
    expect(detectDelimiter("nom;ean;prix_pro_ht")).toBe(";");
    expect(detectDelimiter("nom\tean\tprix")).toBe("\t");
    expect(detectDelimiter("nom,ean,prix")).toBe(",");
    expect(detectDelimiter('"nom;x",ean,prix')).toBe(",");
  });

  it("respecte les guillemets, les guillemets doublés et les fins de ligne Windows", () => {
    const records = splitCsv('nom;conditionnement\r\n"Crème ""riche""; 50 ml";Tube\r\nBaume;Pot', ";");
    expect(records).toEqual([
      { line: 1, cells: ["nom", "conditionnement"] },
      { line: 2, cells: ['Crème "riche"; 50 ml', "Tube"] },
      { line: 3, cells: ["Baume", "Pot"] },
    ]);
  });

  it("normalise les en-têtes sans accents ni casse", () => {
    expect(normalizeHeader("Prix public conseillé")).toBe("prix_public_conseille");
    expect(normalizeHeader(" Référence ")).toBe("reference");
  });

  it("lit les prix en euros et refuse ce qui est illisible", () => {
    expect(parseEuroCents("12,90 €")).toEqual({ value: 1290, error: null });
    expect(parseEuroCents("1 234,5")).toEqual({ value: 123450, error: null });
    expect(parseEuroCents("")).toEqual({ value: null, error: null });
    expect(parseEuroCents("douze").error).toMatch(/illisible/);
    expect(parseEuroCents("-3").error).toMatch(/illisible/);
    expect(parseEuroCents("1.234,50").error).toMatch(/illisible/);
  });

  it("lit la colonne actif", () => {
    expect(parseActive("")).toEqual({ value: true, error: null });
    expect(parseActive("Non")).toEqual({ value: false, error: null });
    expect(parseActive("peut-être").error).not.toBeNull();
  });
});

describe("validation ligne par ligne", () => {
  it("importe les lignes valides telles qu'écrites", () => {
    const text = [
      "nom;gamme;ean;cip13;conditionnement;prix_pro_ht;prix_public_conseille;reference;actif",
      `Produit A;Hydratation intense;${EAN_A};${CIP_A};Tube 50 ml;8,40;15,90;REF-1;oui`,
      `Produit B;;${EAN_B};;;;;;non`,
    ].join("\n");
    const result = parseCatalogCsv(text, RANGES);
    expect(result.errors).toEqual([]);
    expect(result.dataLines).toBe(2);
    expect(result.rows).toEqual([
      { line: 2, name: "Produit A", rangeId: "r1", ean: EAN_A, cip13: CIP_A, packaging: "Tube 50 ml", proPriceCents: 840, publicPriceCents: 1590, externalRef: "REF-1", isActive: true },
      { line: 3, name: "Produit B", rangeId: null, ean: EAN_B, cip13: null, packaging: null, proPriceCents: null, publicPriceCents: null, externalRef: null, isActive: false },
    ]);
  });

  it("reconnaît les intitulés usuels et signale les colonnes ignorées", () => {
    const result = parseCatalogCsv(`Désignation,EAN13,Prix public,Couleur\nProduit A,${EAN_A},9.9,bleu`, []);
    expect(result.errors).toEqual([]);
    expect(result.ignoredColumns).toEqual(["Couleur"]);
    expect(result.columns).toEqual(["name", "ean", "publicPrice"]);
    expect(result.rows[0]).toMatchObject({ name: "Produit A", ean: EAN_A, publicPriceCents: 990 });
  });

  it("refuse un en-tête sans colonne nom, sans rien importer", () => {
    const result = parseCatalogCsv(`ean;prix\n${EAN_A};3`, []);
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toMatch(/nom/);
  });

  it("refuse un texte vide ou un en-tête seul", () => {
    expect(parseCatalogCsv("  \n ", []).errors).toHaveLength(1);
    expect(parseCatalogCsv("nom;ean\n", []).errors[0].message).toMatch(/aucune ligne/);
  });

  it("refuse chaque ligne fautive avec son numéro et n'en invente aucune", () => {
    const text = [
      "nom;gamme;ean;cip13;prix_pro_ht;actif",
      `;;${EAN_A};;;`,
      "Produit C;Gamme inconnue;;;;",
      "Produit D;;1234567890123;;;",
      `Produit E;;;${EAN_A};;`,
      "Produit F;;;;douze;",
      "Produit G;;;;;peut-être",
      "",
      "Produit H;;;;;",
    ].join("\n");
    const result = parseCatalogCsv(text, RANGES);
    expect(result.rows.map((row) => row.name)).toEqual(["Produit H"]);
    expect(result.rows[0].line).toBe(9);
    expect(result.errors.map((error) => [error.line, error.column])).toEqual([
      [2, "nom"],
      [3, "gamme"],
      [4, "ean"],
      [5, "cip13"],
      [6, "prix_pro_ht"],
      [7, "actif"],
    ]);
  });

  it("refuse la seconde occurrence d'un même code dans le texte collé", () => {
    const text = ["nom;ean;reference", `Produit A;${EAN_A};R1`, `Produit A bis;${EAN_A};R2`, `Produit B;${EAN_B};R1`].join("\n");
    const result = parseCatalogCsv(text, []);
    expect(result.rows.map((row) => row.line)).toEqual([2]);
    expect(result.errors.map((error) => error.message)).toEqual(["EAN déjà présent ligne 2.", "Référence déjà présente ligne 2."]);
  });

  it("refuse une colonne en double", () => {
    const result = parseCatalogCsv("nom;produit\nA;B", []);
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toMatch(/double/);
  });
});

describe("rapprochement avec le catalogue existant", () => {
  const row = (line: number, codes: { ean?: string; cip13?: string; externalRef?: string }) => ({
    line,
    name: `Produit ${line}`,
    rangeId: null,
    ean: codes.ean ?? null,
    cip13: codes.cip13 ?? null,
    packaging: null,
    proPriceCents: null,
    publicPriceCents: null,
    externalRef: codes.externalRef ?? null,
    isActive: true,
  });

  it("met à jour par EAN, puis CIP13, puis référence, et crée le reste", () => {
    const existing = [
      { id: "p1", ean: EAN_A, cip13: null, externalRef: null },
      { id: "p2", ean: null, cip13: CIP_A, externalRef: null },
      { id: "p3", ean: null, cip13: null, externalRef: "R3" },
    ];
    const plan = planCatalogImport([row(2, { ean: EAN_A }), row(3, { cip13: CIP_A }), row(4, { externalRef: "R3" }), row(5, { ean: EAN_B })], existing);
    expect(plan.updates.map((update) => [update.id, update.row.line])).toEqual([["p1", 2], ["p2", 3], ["p3", 4]]);
    expect(plan.creates.map((created) => created.line)).toEqual([5]);
    expect(plan.errors).toEqual([]);
  });

  it("refuse deux lignes qui visent le même produit existant", () => {
    const existing = [{ id: "p1", ean: EAN_A, cip13: null, externalRef: "R1" }];
    const plan = planCatalogImport([row(2, { ean: EAN_A }), row(3, { externalRef: "R1" })], existing);
    expect(plan.updates).toHaveLength(1);
    expect(plan.errors).toEqual([{ line: 3, column: null, message: "Désigne le même produit existant que la ligne 2." }]);
  });
});
