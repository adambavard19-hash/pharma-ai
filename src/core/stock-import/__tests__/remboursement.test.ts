import { describe, expect, it } from "vitest";
import { readRows, suggestMapping } from "..";

describe("import : colonne de remboursement", () => {
  it("reconnaît « Prest. », « Taux remb. » et « Code LPP », jamais un montant (« Base de remboursement », « Tarif LPP »)", () => {
    expect(suggestMapping(["Code produit", "Désignation", "Qte Stock", "PA HT", "TVA", "Prest."]).reimbursement).toBe("Prest.");
    expect(suggestMapping(["CIP", "Libellé", "Stock", "Taux remb."]).reimbursement).toBe("Taux remb.");
    expect(suggestMapping(["EAN", "Nom", "Qté", "Code LPP"]).reimbursement).toBe("Code LPP");
    expect(suggestMapping(["EAN", "Nom", "Qté", "Base de remboursement", "Tarif LPP"]).reimbursement).toBeUndefined();
  });

  it("l'export réel de LGPI (Code produit ; Désignation ; Qte Stock ; PA HT ; TVA) n'a pas de colonne de remboursement", () => {
    expect(suggestMapping(["Code produit", "Désignation", "Qte Stock", "PA HT", "TVA"]).reimbursement).toBeUndefined();
  });

  it("lit la prestation sur la ligne ; à défaut, une TVA à 2,1 % ; sinon : inconnu", () => {
    const mapping = { code: "Code produit", name: "Désignation", quantity: "Qte Stock", purchasePrice: "PA HT", vatRate: "TVA", reimbursement: "Prest." };
    const rows = readRows(
      [
        { "Code produit": "3401044533429", Désignation: "AEQUASYAL SPRAY BUC FL 40ML T", "Qte Stock": "1", "PA HT": "6,400", TVA: "20", "Prest.": "AAD" },
        { "Code produit": "3400932454006", Désignation: "ARTISIAL SOL PRESS FL 100ML", "Qte Stock": "1", "PA HT": "3,210", TVA: "2,1", "Prest.": "" },
        { "Code produit": "3577056024221", Désignation: "ELUDAY GENCIVE BAIN BOUCHE", "Qte Stock": "12", "PA HT": "4,960", TVA: "20", "Prest.": "" },
        { "Code produit": "3400930213940", Désignation: "BETADINE 1% BAIN BOUCHE 200ML", "Qte Stock": "9", "PA HT": "5,994", TVA: "10", "Prest.": "PHN" },
      ],
      mapping,
    );
    expect(rows.map((row) => [row.name, row.reimbursed, row.reimbursementSource])).toEqual([
      ["AEQUASYAL SPRAY BUC FL 40ML T", true, "export : prestation AAD (LPP)"],
      ["ARTISIAL SOL PRESS FL 100ML", true, "TVA 2,1 % (médicament remboursable)"],
      ["ELUDAY GENCIVE BAIN BOUCHE", null, null],
      ["BETADINE 1% BAIN BOUCHE 200ML", false, "export : prestation PHN"],
    ]);
    expect(rows[0]).toMatchObject({ purchasePriceCents: 640, vatRate: 20 });
  });

  it("deux lignes du même produit : le remboursement connu d'une ligne n'est pas perdu", () => {
    const rows = readRows(
      [
        { Code: "3401044533429", Qté: "1", Prest: "" },
        { Code: "3401044533429", Qté: "2", Prest: "AAD" },
      ],
      { code: "Code", quantity: "Qté", reimbursement: "Prest" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 3, reimbursed: true, reimbursementSource: "export : prestation AAD (LPP)" });
  });
});
