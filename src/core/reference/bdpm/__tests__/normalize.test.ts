import { describe, expect, it } from "vitest";
import {
  cell,
  parseCompactDate,
  parseFrenchDate,
  parseInteger,
  parsePercent,
  parsePriceCents,
  parseYesNo,
  splitList,
} from "../normalize";

/**
 * Ces tests protègent des conversions qui, si elles étaient « évidentes »,
 * produiraient des données fausses sans rien signaler. Chaque cas vient d'une
 * mesure sur les fichiers réels, pas d'une supposition.
 */

describe("parsePriceCents", () => {
  it("lit un prix ordinaire", () => {
    expect(parsePriceCents("44,38")).toBe(4438);
    expect(parsePriceCents("1,02")).toBe(102);
    expect(parsePriceCents("120,04")).toBe(12004);
  });

  it("traite la virgule des milliers comme un séparateur, pas comme une décimale", () => {
    // Le piège central de la source : `18,507,89` vaut 18 507,89 € et non
    // 18,51 €. Un remplacement naïf de « , » par « . » se tromperait d'un
    // facteur mille sur les traitements les plus chers du catalogue.
    expect(parsePriceCents("18,507,89")).toBe(1_850_789);
    expect(parsePriceCents("11,360,89")).toBe(1_136_089);
    expect(parsePriceCents("1,234,567,89")).toBe(123_456_789);
  });

  it("ignore les espaces, y compris insécables", () => {
    expect(parsePriceCents(" 44,38 ")).toBe(4438);
    expect(parsePriceCents("11 360,89")).toBe(1_136_089);
  });

  it("refuse plutôt que de deviner", () => {
    expect(parsePriceCents("")).toBeNull();
    expect(parsePriceCents(undefined)).toBeNull();
    expect(parsePriceCents("gratuit")).toBeNull();
    expect(parsePriceCents("44.38")).toBeNull();
    expect(parsePriceCents("44,3")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("accepte les deux graphies présentes dans la source", () => {
    // Mesuré : 10 304 occurrences de « 65% » et 322 de « 65 % ».
    expect(parsePercent("65%")).toBe(65);
    expect(parsePercent("65 %")).toBe(65);
    expect(parsePercent("100%")).toBe(100);
  });

  it("refuse ce qui n'est pas un taux", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("65")).toBeNull();
    expect(parsePercent("120%")).toBeNull();
  });
});

describe("parseFrenchDate", () => {
  it("lit le format des fichiers CIS et CIP", () => {
    expect(parseFrenchDate("12/03/1998")?.toISOString()).toBe("1998-03-12T00:00:00.000Z");
  });

  it("refuse une date impossible plutôt que de la décaler", () => {
    // `new Date(2020, 1, 31)` donnerait le 2 mars sans prévenir.
    expect(parseFrenchDate("31/02/2020")).toBeNull();
    expect(parseFrenchDate("00/01/2020")).toBeNull();
    expect(parseFrenchDate("20170208")).toBeNull();
    expect(parseFrenchDate("")).toBeNull();
  });
});

describe("parseCompactDate", () => {
  it("lit le format du seul fichier daté en AAAAMMJJ", () => {
    expect(parseCompactDate("20170208")?.toISOString()).toBe("2017-02-08T00:00:00.000Z");
  });

  it("ne confond pas les deux formats de date de la source", () => {
    expect(parseCompactDate("12/03/1998")).toBeNull();
    expect(parseCompactDate("20170231")).toBeNull();
  });
});

describe("parseYesNo", () => {
  it("lit les seules valeurs rencontrées", () => {
    expect(parseYesNo("oui")).toBe(true);
    expect(parseYesNo("Oui")).toBe(true);
    expect(parseYesNo("non")).toBe(false);
    expect(parseYesNo("Non")).toBe(false);
  });

  it("laisse l'inconnu inconnu", () => {
    expect(parseYesNo("")).toBeNull();
    expect(parseYesNo("o")).toBeNull();
    expect(parseYesNo("true")).toBeNull();
  });
});

describe("splitList", () => {
  it("découpe et nettoie", () => {
    expect(splitList("orale;cutanée")).toEqual(["orale", "cutanée"]);
    expect(splitList("orale ; cutanée ;")).toEqual(["orale", "cutanée"]);
  });

  it("rend une liste vide plutôt qu'une entrée vide", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
    expect(splitList(" ; ")).toEqual([]);
  });
});

describe("cell et parseInteger", () => {
  it("normalisent l'absence en null", () => {
    expect(cell("  PHARMA DEVELOPPEMENT ")).toBe("PHARMA DEVELOPPEMENT");
    expect(cell("   ")).toBeNull();
    expect(parseInteger("4")).toBe(4);
    expect(parseInteger("")).toBeNull();
    expect(parseInteger("4a")).toBeNull();
  });
});
