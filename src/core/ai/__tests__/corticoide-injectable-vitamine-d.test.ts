import { describe, expect, it } from "vitest";
import { detectAdviceOpportunities } from "../engines/advice";
import { drug, patient } from "./fixtures";
import { names, retained, stock } from "./corrections-helpers";

/**
 * Fondateur, 23 nov. 2026, au comptoir de la Pharmacie du Dr Nicolas : « PEDIAKID GOM VIT D3 FRAISE 60 pour DIPROSTENE ».
 * Deux erreurs : une injection de corticoïde n'est pas une corticothérapie orale au long cours, et un produit pour enfant
 * n'a rien à faire dans un conseil osseux d'adulte.
 */
const BONE = ["vitamin-d-elderly", "corticosteroid-oral-calcium"];

function keysFor(name: string, form: string | null) {
  return detectAdviceOpportunities({
    drugs: [{ lineIndex: 0, drugName: name, knowledge: drug({ name, inn: "BETAMETHASONE", atcCode: "H02AB01", therapeuticClass: "Corticoïde systémique", form, commonSideEffects: [] }) }],
    patient: patient(),
    needs: [],
  }).map((o) => o.key);
}

describe("corticoïde injectable : ni vitamine D ni calcium", () => {
  it("DIPROSTENE suspension injectable n'ouvre aucun conseil osseux", () => {
    for (const key of BONE) expect(keysFor("DIPROSTENE", "suspension injectable")).not.toContain(key);
  });

  it("le nom seul suffit : « DIPROSTENE SUSP INJ »", () => {
    for (const key of BONE) expect(keysFor("DIPROSTENE SUSP INJ", null)).not.toContain(key);
  });

  it("le même corticoïde à avaler (CELESTENE comprimé) garde les conseils osseux", () => {
    expect(keysFor("CELESTENE 2 mg comprimé", "comprimé")).toEqual(expect.arrayContaining(BONE));
  });

  it("forme inconnue : la règle reste, la question tranche", () => {
    expect(keysFor("BETAMETHASONE", null)).toEqual(expect.arrayContaining(BONE));
  });
});

describe("conseil osseux : jamais un produit pour enfant", () => {
  it("Pediakid gommes est écarté, la vitamine D d'adulte reste", () => {
    const kept = names(retained("vitamin-d-elderly", "M05BA04", [stock("a", "PEDIAKID GOM VIT D3 FRAISE 60"), stock("b", "UVEDOSE 100 000 UI solution buvable")]));
    expect(kept).not.toContain("PEDIAKID GOM VIT D3 FRAISE 60");
  });
});
