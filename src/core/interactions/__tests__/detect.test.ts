import { describe, expect, it } from "vitest";
import { detectInteractions, interactionKey } from "../detect";
import type { InteractionClassMember, InteractionLine, InteractionRule } from "../types";

/**
 * Ce que ces tests protègent : le moteur ne rapporte QUE ce que le référentiel
 * déclare, il ne conclut jamais à l'absence de risque, et il distingue
 * soigneusement ce qu'il a analysé de ce qu'il n'a pas pu analyser.
 */

function ligne(id: string, label: string, substances: string[]): InteractionLine {
  return {
    id,
    label,
    substances: substances.map((s) => ({ key: interactionKey(s), label: s })),
  };
}

function regle(overrides: Partial<InteractionRule> = {}): InteractionRule {
  return {
    leftLabel: "Warfarine",
    rightLabel: "Miconazole",
    leftKey: interactionKey("Warfarine"),
    rightKey: interactionKey("Miconazole"),
    leftKind: "SUBSTANCE",
    rightKind: "SUBSTANCE",
    severity: "CONTRAINDICATION",
    risk: "Hémorragies imprévisibles.",
    guidance: "Association contre-indiquée.",
    sourceName: "Référentiel test",
    sourceVersion: "2023-09",
    ...overrides,
  };
}

const AUCUNE = { rules: [], classMembers: [] as InteractionClassMember[] };

describe("croisement des médicaments prescrits", () => {
  it("ne trouve rien quand aucun référentiel n'est chargé", () => {
    const result = detectInteractions({
      lines: [ligne("1", "Coumadine", ["Warfarine"]), ligne("2", "Daktarin", ["Miconazole"])],
      ...AUCUNE,
    });
    expect(result.matches).toEqual([]);
    // Et surtout : les deux lignes comptent comme analysées côté composition —
    // c'est la couverture, pas le moteur, qui dira que rien n'a été croisé.
    expect(result.analysedLineIds).toEqual(["1", "2"]);
  });

  it("rapporte un couple déclaré, quel que soit l'ordre des lignes", () => {
    const lines = [ligne("1", "Coumadine", ["Warfarine"]), ligne("2", "Daktarin", ["Miconazole"])];
    const direct = detectInteractions({ lines, rules: [regle()], classMembers: [] });
    const inverse = detectInteractions({
      lines: [lines[1], lines[0]],
      rules: [regle()],
      classMembers: [],
    });

    expect(direct.matches).toHaveLength(1);
    expect(inverse.matches).toHaveLength(1);
    expect(direct.matches[0].severity).toBe("CONTRAINDICATION");
    expect(direct.matches[0].risk).toBe("Hémorragies imprévisibles.");
    expect(direct.matches[0].sourceName).toBe("Référentiel test");
  });

  it("n'invente aucun couple absent du référentiel", () => {
    const result = detectInteractions({
      lines: [ligne("1", "Doliprane", ["Paracétamol"]), ligne("2", "Advil", ["Ibuprofène"])],
      rules: [regle()],
      classMembers: [],
    });
    expect(result.matches).toEqual([]);
  });

  it("ne rapproche pas deux substances au libellé voisin", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "A", ["Warfarine sodique"]),
        ligne("2", "B", ["Miconazole"]),
      ],
      rules: [regle()],
      classMembers: [],
    });
    // « Warfarine sodique » n'est pas « Warfarine » : sans déclaration
    // explicite, on se tait plutôt que de supposer.
    expect(result.matches).toEqual([]);
  });

  it("ignore les accents et la casse, qui ne sont pas des différences", () => {
    const result = detectInteractions({
      lines: [ligne("1", "A", ["WARFARINE"]), ligne("2", "B", ["miconazole"])],
      rules: [regle()],
      classMembers: [],
    });
    expect(result.matches).toHaveLength(1);
  });

  it("applique une règle exprimée au niveau d'une classe", () => {
    const result = detectInteractions({
      lines: [ligne("1", "Coumadine", ["Warfarine"]), ligne("2", "Kardegic", ["Acide acétylsalicylique"])],
      rules: [
        regle({
          rightLabel: "Antiagrégants plaquettaires",
          rightKey: interactionKey("Antiagrégants plaquettaires"),
          rightKind: "CLASS",
          severity: "NOT_RECOMMENDED",
        }),
      ],
      classMembers: [
        {
          classKey: interactionKey("Antiagrégants plaquettaires"),
          classLabel: "Antiagrégants plaquettaires",
          substanceKey: interactionKey("Acide acétylsalicylique"),
        },
      ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].viaClass).toBe(true);
    expect(result.matches[0].severity).toBe("NOT_RECOMMENDED");
  });

  it("ne déborde pas d'une classe vers une substance qui n'y appartient pas", () => {
    const result = detectInteractions({
      lines: [ligne("1", "Coumadine", ["Warfarine"]), ligne("2", "Doliprane", ["Paracétamol"])],
      rules: [
        regle({
          rightLabel: "Antiagrégants plaquettaires",
          rightKey: interactionKey("Antiagrégants plaquettaires"),
          rightKind: "CLASS",
        }),
      ],
      classMembers: [
        {
          classKey: interactionKey("Antiagrégants plaquettaires"),
          classLabel: "Antiagrégants plaquettaires",
          substanceKey: interactionKey("Acide acétylsalicylique"),
        },
      ],
    });
    expect(result.matches).toEqual([]);
  });

  it("sépare les lignes analysables de celles qui ne le sont pas", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "Coumadine", ["Warfarine"]),
        ligne("2", "Médicament non rattaché", []),
      ],
      rules: [regle()],
      classMembers: [],
    });
    expect(result.analysedLineIds).toEqual(["1"]);
    expect(result.unanalysedLineIds).toEqual(["2"]);
    expect(result.matches).toEqual([]);
  });

  it("signale une même substance apportée par deux lignes", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "Doliprane 1 g", ["Paracétamol"]),
        ligne("2", "Dafalgan codéiné", ["Paracétamol", "Codéine"]),
      ],
      ...AUCUNE,
    });
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].substanceLabel).toBe("Paracétamol");
    // Une redondance n'est pas une interaction : elle ne doit jamais grossir
    // le compte des couples déclarés.
    expect(result.matches).toEqual([]);
  });

  it("ne signale pas d'interaction d'une substance avec elle-même", () => {
    const result = detectInteractions({
      lines: [ligne("1", "A", ["Paracétamol"]), ligne("2", "B", ["Paracétamol"])],
      rules: [
        regle({
          leftLabel: "Paracétamol",
          rightLabel: "Paracétamol",
          leftKey: interactionKey("Paracétamol"),
          rightKey: interactionKey("Paracétamol"),
        }),
      ],
      classMembers: [],
    });
    expect(result.matches).toEqual([]);
    expect(result.overlaps).toHaveLength(1);
  });

  it("trie les alertes de la plus grave à la moins grave", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "A", ["Warfarine"]),
        ligne("2", "B", ["Miconazole"]),
        ligne("3", "C", ["Amiodarone"]),
      ],
      rules: [
        regle({ severity: "TO_CONSIDER" }),
        regle({
          leftLabel: "Warfarine",
          rightLabel: "Amiodarone",
          rightKey: interactionKey("Amiodarone"),
          severity: "CONTRAINDICATION",
        }),
      ],
      classMembers: [],
    });
    expect(result.matches.map((m) => m.severity)).toEqual([
      "CONTRAINDICATION",
      "TO_CONSIDER",
    ]);
  });

  it("ne produit pas deux fois la même alerte pour le même couple de lignes", () => {
    // Une substance peut appartenir à une classe ET être nommée directement.
    const result = detectInteractions({
      lines: [ligne("1", "A", ["Warfarine"]), ligne("2", "B", ["Miconazole"])],
      rules: [regle(), regle()],
      classMembers: [],
    });
    expect(result.matches).toHaveLength(1);
  });
});

describe("correspondances de vocabulaire", () => {
  // Le catalogue national écrit « WARFARINE SODIQUE », le référentiel écrit
  // « Warfarine ». Sans alias déclaré, l'alerte ne partirait jamais.
  const alias: InteractionClassMember = {
    classKey: interactionKey("Warfarine"),
    classLabel: "Warfarine",
    substanceKey: interactionKey("WARFARINE SODIQUE"),
    isAlias: true,
  };

  it("sans alias, l'appariement strict ne trouve rien", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "Coumadine", ["WARFARINE SODIQUE"]),
        ligne("2", "Daktarin", ["MICONAZOLE"]),
      ],
      rules: [regle()],
      classMembers: [],
    });
    expect(result.matches).toEqual([]);
  });

  it("avec alias déclaré, l'interaction est retrouvée", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "Coumadine", ["WARFARINE SODIQUE"]),
        ligne("2", "Daktarin", ["MICONAZOLE"]),
      ],
      rules: [regle()],
      classMembers: [alias],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].severity).toBe("CONTRAINDICATION");
  });

  it("un alias n'est pas présenté comme un raisonnement par classe", () => {
    const result = detectInteractions({
      lines: [
        ligne("1", "Coumadine", ["WARFARINE SODIQUE"]),
        ligne("2", "Daktarin", ["MICONAZOLE"]),
      ],
      rules: [regle()],
      classMembers: [alias],
    });
    expect(result.matches[0].viaClass).toBe(false);
  });
});
