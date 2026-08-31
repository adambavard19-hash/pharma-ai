import { describe, expect, it } from "vitest";
import {
  InteractionFormatError,
  parseAliasesFile,
  parseClassesFile,
  parseInteractionsFile,
  parseMetaFile,
} from "../parse";

/**
 * Sur des données de sécurité, un fichier à moitié compris est plus dangereux
 * qu'un import qui échoue. Ces tests vérifient que le lecteur refuse — en
 * disant quelle ligne et pourquoi — plutôt que de deviner.
 */

const EN_TETE =
  "type_gauche\tlibelle_gauche\ttype_droit\tlibelle_droit\tniveau\trisque\tconduite_a_tenir";

function fichier(...lignes: string[]) {
  return [EN_TETE, ...lignes].join("\n");
}

describe("lecture du fichier d'interactions", () => {
  it("lit une règle complète", () => {
    const rows = parseInteractionsFile(
      fichier(
        "substance\tWarfarine\tsubstance\tMiconazole\tcontre-indication\tHémorragies imprévisibles.\tAssociation contre-indiquée.",
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      leftLabel: "Warfarine",
      rightLabel: "Miconazole",
      severity: "CONTRAINDICATION",
      risk: "Hémorragies imprévisibles.",
      guidance: "Association contre-indiquée.",
      leftKind: "SUBSTANCE",
    });
  });

  it("accepte les quatre niveaux, accentués ou non", () => {
    const rows = parseInteractionsFile(
      fichier(
        "substance\tA\tsubstance\tB\tcontre-indication\tr\t",
        "substance\tC\tsubstance\tD\tAssociation déconseillée\tr\t",
        "substance\tE\tsubstance\tF\tPrécaution d'emploi\tr\t",
        "substance\tG\tsubstance\tH\tA prendre en compte\tr\t",
      ),
    );
    expect(rows.map((r) => r.severity)).toEqual([
      "CONTRAINDICATION",
      "NOT_RECOMMENDED",
      "PRECAUTION",
      "TO_CONSIDER",
    ]);
  });

  it("refuse un en-tête dont les colonnes ont été interverties", () => {
    const contenu = [
      "libelle_gauche\ttype_gauche\ttype_droit\tlibelle_droit\tniveau\trisque\tconduite_a_tenir",
      "Warfarine\tsubstance\tsubstance\tMiconazole\tcontre-indication\tr\t",
    ].join("\n");
    expect(() => parseInteractionsFile(contenu)).toThrow(InteractionFormatError);
    expect(() => parseInteractionsFile(contenu)).toThrow(/en-tête inattendu/);
  });

  it("refuse une ligne dont le compte de colonnes a changé, en la citant", () => {
    expect(() =>
      parseInteractionsFile(fichier("substance\tA\tsubstance\tB\tcontre-indication\tr")),
    ).toThrow(/ligne 2 : 6 colonne\(s\) au lieu de 7/);
  });

  it("refuse un niveau inconnu au lieu de le ranger au hasard", () => {
    expect(() =>
      parseInteractionsFile(fichier("substance\tA\tsubstance\tB\tgrave\tr\t")),
    ).toThrow(/niveau inconnu : « grave »/);
  });

  it("refuse une règle sans risque décrit", () => {
    // Une alerte dont on ne peut pas dire la raison n'a rien à faire au comptoir.
    expect(() =>
      parseInteractionsFile(fichier("substance\tA\tsubstance\tB\tcontre-indication\t\t")),
    ).toThrow(/risque manquant/);
  });

  it("refuse un couple dont les deux côtés sont identiques", () => {
    expect(() =>
      parseInteractionsFile(fichier("substance\tParacétamol\tsubstance\tPARACETAMOL\tcontre-indication\tr\t")),
    ).toThrow(/identiques/);
  });

  it("refuse un doublon strict, qui produirait deux fois la même alerte", () => {
    expect(() =>
      parseInteractionsFile(
        fichier(
          "substance\tA\tsubstance\tB\tcontre-indication\tr\t",
          "substance\tB\tsubstance\tA\tcontre-indication\tr\t",
        ),
      ),
    ).toThrow(/déjà déclaré/);
  });

  it("laisse la conduite à tenir vide quand la source ne la donne pas", () => {
    const rows = parseInteractionsFile(fichier("substance\tA\tsubstance\tB\tcontre-indication\tr\t"));
    expect(rows[0].guidance).toBeNull();
  });
});

describe("lecture du fichier de classes", () => {
  it("lit les appartenances", () => {
    const rows = parseClassesFile(
      ["classe\tsubstance", "Antiagrégants plaquettaires\tAcide acétylsalicylique"].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].classLabel).toBe("Antiagrégants plaquettaires");
  });

  it("refuse une ligne incomplète", () => {
    expect(() =>
      parseClassesFile(["classe\tsubstance", "Antiagrégants\t"].join("\n")),
    ).toThrow(/classe ou substance manquante/);
  });
});

describe("identité du référentiel", () => {
  it("lit nom, version et date", () => {
    const meta = parseMetaFile(
      JSON.stringify({ name: "Thésaurus ANSM", version: "2023-09", updatedAt: "2023-09-15" }),
    );
    expect(meta.name).toBe("Thésaurus ANSM");
    expect(meta.updatedAt?.getUTCFullYear()).toBe(2023);
  });

  it("refuse un référentiel sans nom ni version", () => {
    expect(() => parseMetaFile(JSON.stringify({ updatedAt: "2023-09-15" }))).toThrow(
      /obligatoires/,
    );
  });

  it("refuse un référentiel sans date de mise à jour", () => {
    // Sans date, aucune alerte ne peut dire de quand elle date.
    expect(() => parseMetaFile(JSON.stringify({ name: "X", version: "1" }))).toThrow(
      /« updatedAt » est obligatoire/,
    );
  });

  it("refuse une date illisible plutôt que de la deviner", () => {
    expect(() =>
      parseMetaFile(JSON.stringify({ name: "X", version: "1", updatedAt: "hier" })),
    ).toThrow(/n'est pas une date lisible/);
  });
});

describe("lecture du fichier d'alias", () => {
  it("lit une correspondance", () => {
    const rows = parseAliasesFile(
      ["libelle_referentiel\tlibelle_catalogue", "Warfarine\tWARFARINE SODIQUE"].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].referentialLabel).toBe("Warfarine");
    expect(rows[0].catalogKey).toBe("WARFARINE SODIQUE");
  });

  it("refuse une correspondance à un seul côté", () => {
    expect(() =>
      parseAliasesFile(["libelle_referentiel\tlibelle_catalogue", "Warfarine\t"].join("\n")),
    ).toThrow(/les deux libellés sont nécessaires/);
  });

  it("refuse un en-tête qui n'est pas celui attendu", () => {
    expect(() =>
      parseAliasesFile(["substance\tcatalogue", "A\tB"].join("\n")),
    ).toThrow(/en-tête inattendu/);
  });
});
