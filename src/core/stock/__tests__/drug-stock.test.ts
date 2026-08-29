import { describe, expect, it } from "vitest";
import {
  BULK_STOCK_MAX_LINES,
  canRecommendDrug,
  drugStockState,
  isLowDrugStock,
  parseBulkStockList,
} from "../drug-stock";

const ANASTROZOLE = "3400949497294";
const AUTRE = "3400949497706";

describe("état du stock", () => {
  it("distingue les trois situations", () => {
    expect(drugStockState({ quantity: 4 })).toBe("IN_STOCK");
    expect(drugStockState({ quantity: 0 })).toBe("REFERENCED_EMPTY");
    expect(drugStockState(null)).toBe("NOT_REFERENCED");
    expect(drugStockState(undefined)).toBe("NOT_REFERENCED");
  });

  it("n'autorise une proposition que si l'officine détient la boîte", () => {
    // La règle centrale du lot : ni la marge, ni la pertinence, ni le
    // classement ne peuvent proposer ce que la pharmacie n'a pas.
    expect(canRecommendDrug({ quantity: 1 })).toBe(true);
    expect(canRecommendDrug({ quantity: 0 })).toBe(false);
    expect(canRecommendDrug(null)).toBe(false);
  });

  it("ne déclenche pas d'alerte quand aucun seuil n'est fixé", () => {
    expect(isLowDrugStock({ quantity: 0, alertThreshold: 0 })).toBe(false);
    expect(isLowDrugStock({ quantity: 2, alertThreshold: 5 })).toBe(true);
    expect(isLowDrugStock({ quantity: 5, alertThreshold: 5 })).toBe(true);
    expect(isLowDrugStock({ quantity: 6, alertThreshold: 5 })).toBe(false);
  });
});

describe("parseBulkStockList", () => {
  it("lit une liste de codes nus", () => {
    const result = parseBulkStockList(`${ANASTROZOLE}\n${AUTRE}\n`);
    expect(result.entries).toEqual([
      { lineNumber: 1, cip13: ANASTROZOLE, quantity: null },
      { lineNumber: 2, cip13: AUTRE, quantity: null },
    ]);
    expect(result.rejected).toHaveLength(0);
  });

  it("accepte les séparateurs qu'un export de logiciel de stock produit", () => {
    const result = parseBulkStockList(
      [`${ANASTROZOLE};12`, `${AUTRE},3`, `${ANASTROZOLE.slice(5, 12)}\t7`].join("\n"),
    );
    expect(result.entries.map((entry) => entry.quantity)).toEqual([7, 3]);
    expect(result.rejected).toHaveLength(0);
  });

  it("reconstruit le CIP13 d'un CIP7", () => {
    const result = parseBulkStockList("4949729;5");
    expect(result.entries[0]).toEqual({ lineNumber: 1, cip13: ANASTROZOLE, quantity: 5 });
  });

  it("ignore les lignes vides et les commentaires", () => {
    const result = parseBulkStockList(`# export du 3 août\n\n${ANASTROZOLE}\n\n`);
    expect(result.entries).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("rend chaque ligne refusée avec son numéro et son motif", () => {
    const result = parseBulkStockList(
      [ANASTROZOLE, "3400949497295", "3017620422003", "doliprane", `${AUTRE};douze`].join("\n"),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.rejected.map((rejection) => rejection.lineNumber)).toEqual([2, 3, 4, 5]);
    expect(result.rejected[0].reason).toMatch(/clé de contrôle/);
    expect(result.rejected[1].reason).toMatch(/catalogue de l'officine/);
    expect(result.rejected[3].reason).toMatch(/Quantité illisible/);
  });

  it("garde la dernière quantité d'un code répété et le signale", () => {
    const result = parseBulkStockList(`${ANASTROZOLE};4\n${ANASTROZOLE};9\n`);
    expect(result.entries).toEqual([{ lineNumber: 2, cip13: ANASTROZOLE, quantity: 9 }]);
    expect(result.duplicates).toBe(1);
  });

  it("compte les lignes lues, pas les codes retenus", () => {
    // Un doublon réduit le nombre d'entrées mais pas le nombre de lignes du
    // fichier : annoncer « 7 lignes lues » pour un fichier de 8 serait faux.
    const result = parseBulkStockList(
      ["# commentaire", `${ANASTROZOLE};4`, `${ANASTROZOLE};9`, "", `${AUTRE}`, "doliprane"].join(
        "\n",
      ),
    );
    expect(result.read).toBe(4);
    expect(result.entries).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("compte les lignes valides dépourvues de quantité", () => {
    const result = parseBulkStockList(`${ANASTROZOLE}\n${AUTRE};7\n`);
    expect(result.withoutQuantity).toBe(1);
  });

  it("s'arrête au-delà du plafond plutôt que de bloquer le serveur", () => {
    const content = `${ANASTROZOLE}\n`.repeat(BULK_STOCK_MAX_LINES + 10);
    const result = parseBulkStockList(content);
    // Un même code répété ne remplit qu'une entrée : c'est la ligne de refus
    // qui doit apparaître, avec son motif.
    expect(result.rejected.at(-1)?.reason).toMatch(/l'import est refusé/);
  });
});
