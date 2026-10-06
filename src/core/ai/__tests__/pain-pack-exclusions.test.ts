import { describe, expect, it } from "vitest";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { ADVICE_RULES } from "../engines/advice";
import { findCandidateProducts } from "../engines/matching";
import { product } from "./fixtures";
import { analyse, detect, names, namesFor, retained } from "./corrections-helpers";

/**
 * Douleur musculaire ou articulaire : la poche chaud-froid ne se propose pas en masque pour les yeux.
 *
 * Le test d'origine ne regardait que `matchesAny(rule.productExclude, nom)` : il passait alors que
 * l'exclusion était sans effet. `matching.ts` n'écarte un nom exclu que s'il n'est PAS sauvé par un
 * motif de `productPrefer` ; or « thera ?pearl », « chaud ?froid » et « poche » reconnaissaient
 * justement ces masques. Les tests ci-dessous passent par `findCandidateProducts` et par le moteur.
 */

const RULE = "pain-cold-hot-pack";

/** Rangés comme l'ancien dictionnaire le faisait : en poches chaud-froid, avec les deux étiquettes. */
const pack = (id: string, name: string) =>
  product({ id, name, brand: null, category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: ["chaud froid", "douleur musculaire"], commercialClaims: [], description: null, stockQuantity: 5 });

const mask = pack("masque", "THERAPEARL MASQ OCUL COMP XXXX");
const kids = pack("kids", "THERA PEARL KIDS DRAGON");
const back = pack("dos", "THERAPEARL DOS COMP XXX");
const knee = pack("genou", "THERAPEARL GENOU COMP XXXX");
const joint = pack("articulation", "THERAPEARL ARTICUL XXXX");

describe("la règle chaud-froid écarte le masque oculaire et la poche « kids » malgré ses formules préférées", () => {
  it("la règle existe et porte l'exclusion des masques oculaires", () => {
    const rule = ADVICE_RULES.find((candidate) => candidate.key === RULE);
    expect(rule).toBeDefined();
    expect(rule!.productExclude).toEqual(expect.arrayContaining([expect.stringContaining("ocul")]));
  });

  it("findCandidateProducts : ni le masque oculaire ni la poche « kids » ; dos, genou et articulation oui", () => {
    const opportunity = detect("M01AE01").find((o) => o.key === RULE)!;
    const found = findCandidateProducts({ opportunity, catalog: [mask, kids, back, knee, joint] }).map((c) => c.product.name);
    expect(found).not.toContain("THERAPEARL MASQ OCUL COMP XXXX");
    expect(found).not.toContain("THERA PEARL KIDS DRAGON");
    expect([...found].sort()).toEqual(["THERAPEARL ARTICUL XXXX", "THERAPEARL DOS COMP XXX", "THERAPEARL GENOU COMP XXXX"]);
  });

  it("le masque d'une autre marque n'est sauvé ni par « chaud froid » ni par « poche » ni par « thermcool »", () => {
    const others = [
      pack("m2", "MASQUE OCULAIRE chaud froid gel"),
      pack("m3", "POCHE CHAUD FROID MASQUE YEUX OCULAIRE"),
      pack("m4", "THERMCOOL MASQ OCUL"),
      pack("m5", "KIDS THERAPEARL ANIMAL"),
      pack("m6", "THERA PEARL POCHE CHAUD FROID"),
    ];
    const opportunity = detect("M01AE01").find((o) => o.key === RULE)!;
    expect(findCandidateProducts({ opportunity, catalog: others }).map((c) => c.product.name)).toEqual(["THERA PEARL POCHE CHAUD FROID"]);
  });

  it.each([
    ["M01AE01", "ibuprofène"],
    ["N02BE01", "paracétamol"],
    ["N02AX02", "tramadol"],
  ])("%s (%s) : le moteur retient la poche du dos, jamais le masque", (atc) => {
    const catalog = [mask, kids, back];
    expect(names(retained(RULE, atc, catalog))).toEqual(["THERAPEARL DOS COMP XXX"]);
    expect(namesFor(analyse(atc, catalog), RULE, catalog)).toEqual(["THERAPEARL DOS COMP XXX"]);
  });

  it("seul le masque (ou la poche « kids ») en rayon : rien n'est proposé pour la douleur musculaire", () => {
    expect(retained(RULE, "M01AE01", [mask, kids])).toEqual([]);
    expect(namesFor(analyse("M01AE01", [mask, kids]), RULE, [mask, kids])).toEqual([]);
  });
});

describe("le dictionnaire ne range plus le masque oculaire en poche chaud-froid", () => {
  it("« THERAPEARL MASQ OCUL COMP XXXX » n'est pas étiqueté « chaud froid »", () => {
    expect(classifyProductByName("THERAPEARL MASQ OCUL COMP XXXX")?.tags ?? []).not.toContain("chaud froid");
    expect(classifyProductByName("MASQUE OCULAIRE chaud froid gel")?.tags ?? []).not.toContain("chaud froid");
  });

  it("les poches du dos, du genou et de l'articulation restent étiquetées", () => {
    for (const name of ["THERAPEARL DOS COMP XXX", "THERAPEARL GENOU COMP XXXX", "THERAPEARL ARTICUL XXXX", "THERMCOOL poche chaud froid"]) {
      expect(classifyProductByName(name)?.tags, name).toContain("chaud froid");
    }
  });
});
