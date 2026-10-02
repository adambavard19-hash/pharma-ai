/**
 * « Se former sur ce produit » : le bon contenu, et seulement lui.
 *
 * Protège l'ordre de précision du ciblage (produit > code > marque > univers),
 * la règle « le ciblage le plus précis renseigné fait foi », la lecture des
 * codes CIP/EAN tels que les logiciels et les douchettes les donnent, et le tri
 * des contenus proposés.
 */
import { describe, expect, it } from "vitest";
import {
  matchTrainingToProduct,
  normalizeProductCode,
  rankTrainingsForProduct,
  trainingsByProduct,
  universeCoversCategory,
  type RankableTraining,
  type TrainingProductRef,
} from "../match";

// Codes vérifiés : clé EAN-13 calculée par src/core/stock/cip.ts.
const CIP13 = "3400930000014"; // CIP7 3000001
const EAN13 = "3337875545778";

function content(overrides: Partial<RankableTraining> = {}): RankableTraining {
  return { id: "c1", title: "Contenu", productIds: [], productCodes: [], brandKey: null, universe: null, ...overrides };
}

const product: TrainingProductRef = {
  id: "p1",
  name: "AVENE CICALFATE+ CREME 40ML",
  brand: null,
  category: "DERMOCOSMETIQUE",
  codes: [EAN13, "REF-INTERNE-12", null],
};

describe("lecture des codes produit", () => {
  it("garde un CIP13 ou un EAN13 valide, sans espaces ni tirets", () => {
    expect(normalizeProductCode(CIP13)).toBe(CIP13);
    expect(normalizeProductCode("3 400930 000014")).toBe(CIP13);
    expect(normalizeProductCode("3337875-545778")).toBe(EAN13);
  });

  it("reconstruit le CIP13 d'un CIP7 et ramène un GTIN-14 de douchette à 13 chiffres", () => {
    expect(normalizeProductCode("3000001")).toBe(CIP13);
    expect(normalizeProductCode(`0${CIP13}`)).toBe(CIP13);
  });

  it("refuse une clé fausse, une référence interne, un texte", () => {
    expect(normalizeProductCode("3400930000015")).toBeNull();
    expect(normalizeProductCode("REF-INTERNE-12")).toBeNull();
    expect(normalizeProductCode("12345")).toBeNull();
    expect(normalizeProductCode("")).toBeNull();
    expect(normalizeProductCode(null)).toBeNull();
  });
});

describe("rattachement d'un contenu à un produit", () => {
  it("reconnaît un produit de l'officine désigné explicitement", () => {
    expect(matchTrainingToProduct(content({ productIds: ["p1"] }), product)).toBe("PRODUCT");
  });

  it("reconnaît un code produit, quelle que soit sa forme", () => {
    expect(matchTrainingToProduct(content({ productCodes: [EAN13] }), product)).toBe("CODE");
    const drug: TrainingProductRef = { id: "p2", name: "DOLIPRANE 1000MG CPR", codes: ["3000001"] };
    expect(matchTrainingToProduct(content({ productCodes: [CIP13] }), drug)).toBe("CODE");
  });

  it("reconnaît la marque par le champ marque ou par le libellé, jamais par une sous-chaîne", () => {
    expect(matchTrainingToProduct(content({ brandKey: "avene" }), product)).toBe("BRAND");
    expect(matchTrainingToProduct(content({ brandKey: "AVÈNE" }), product)).toBe("BRAND");
    expect(matchTrainingToProduct(content({ brandKey: "arko" }), { id: "p3", name: "ARKOPHARMA ARKOGELULES" })).toBeNull();
    expect(matchTrainingToProduct(content({ brandKey: "la roche-posay" }), { id: "p4", name: "EFFACLAR GEL 200ML", brand: "La Roche-Posay" })).toBe("BRAND");
  });

  it("préfère le rattachement le plus précis quand plusieurs s'appliquent", () => {
    expect(matchTrainingToProduct(content({ productIds: ["p1"], productCodes: [EAN13], brandKey: "avene", universe: "BEBE" }), product)).toBe("PRODUCT");
    expect(matchTrainingToProduct(content({ productCodes: [EAN13], brandKey: "avene" }), product)).toBe("CODE");
  });

  it("ne propose pas, par son univers, un contenu qui vise une autre marque", () => {
    const vitamins: TrainingProductRef = { id: "p5", name: "BEROCCA BOOST CPR", category: "VITAMINES" };
    expect(matchTrainingToProduct(content({ brandKey: "supradyn", universe: "COMPLEMENTS_ALIMENTAIRES" }), vitamins)).toBeNull();
    expect(matchTrainingToProduct(content({ productCodes: [CIP13], universe: "COMPLEMENTS_ALIMENTAIRES" }), vitamins)).toBeNull();
  });

  it("rattache par l'univers un contenu général, seulement si l'univers couvre la catégorie du produit", () => {
    const vitamins: TrainingProductRef = { id: "p5", name: "BEROCCA BOOST CPR", category: "VITAMINES" };
    expect(matchTrainingToProduct(content({ universe: "COMPLEMENTS_ALIMENTAIRES" }), vitamins)).toBe("UNIVERSE");
    expect(matchTrainingToProduct(content({ universe: "NUTRITION" }), vitamins)).toBeNull();
    // « Bébé » n'est relié à aucune catégorie du moteur : il ne couvre aucun produit à lui seul.
    expect(universeCoversCategory("BEBE", "DERMOCOSMETIQUE")).toBe(false);
    expect(matchTrainingToProduct(content({ universe: "BEBE" }), product)).toBeNull();
    expect(matchTrainingToProduct(content({ universe: "COMPLEMENTS_ALIMENTAIRES" }), { id: "p6", name: "X", category: null })).toBeNull();
  });

  it("ne rattache rien à un contenu sans aucun ciblage", () => {
    expect(matchTrainingToProduct(content(), product)).toBeNull();
  });
});

describe("tri des contenus proposés pour un produit", () => {
  const contents: RankableTraining[] = [
    content({ id: "univers", title: "A — dermocosmétique en général", universe: "COMPLEMENTS_ALIMENTAIRES" }),
    content({ id: "marque-globale", title: "B — Avène, la gamme", brandKey: "avene" }),
    content({ id: "marque-officine", title: "C — Avène vu par l'officine", brandKey: "avene", isOwn: true }),
    content({ id: "code", title: "D — Cicalfate+", productCodes: [EAN13] }),
    content({ id: "produit", title: "E — notre fiche Cicalfate", productIds: ["p1"], isOwn: true }),
    content({ id: "autre", title: "F — autre marque", brandKey: "uriage" }),
  ];

  it("classe du plus précis au plus large, l'officine avant PharmaBoost à précision égale", () => {
    expect(rankTrainingsForProduct(contents, product).map((c) => c.id)).toEqual(["produit", "code", "marque-officine", "marque-globale"]);
  });

  it("limite le nombre de contenus et indique le rattachement", () => {
    const ranked = rankTrainingsForProduct(contents, product, 2);
    expect(ranked.map((c) => [c.id, c.match])).toEqual([["produit", "PRODUCT"], ["code", "CODE"]]);
  });

  it("donne pour chaque produit ses contenus, et omet les produits sans contenu", () => {
    const vitamins: TrainingProductRef = { id: "p5", name: "BEROCCA BOOST CPR", category: "VITAMINES" };
    const orphan: TrainingProductRef = { id: "p7", name: "COMPRESSES STERILES", category: "DISPOSITIFS_MEDICAUX" };
    const map = trainingsByProduct(contents, [product, vitamins, orphan], 3);
    expect(map.get("p1")?.map((c) => c.id)).toEqual(["produit", "code", "marque-officine"]);
    expect(map.get("p5")).toEqual([{ id: "univers", title: "A — dermocosmétique en général", match: "UNIVERSE" }]);
    expect(map.has("p7")).toBe(false);
  });
});
