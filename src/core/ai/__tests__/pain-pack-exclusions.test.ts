import { describe, expect, it } from "vitest";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { ADVICE_RULES } from "../engines/advice";
import { findCandidateProducts } from "../engines/matching";
import { product } from "./fixtures";
import { analyse, detect, names, namesFor, retained } from "./corrections-helpers";

/**
 * Douleur musculaire ou articulaire : la poche chaud-froid d'UNE ZONE, jamais le masque pour les yeux, jamais la poche d'une autre zone.
 *
 * Ces tests passent par `findCandidateProducts` et par le moteur (et non par la seule expression régulière de la règle) : `matching.ts`
 * n'écarte un nom exclu que s'il n'est PAS sauvé par un motif de `productPrefer`. Depuis le 10 octobre 2026 la règle se découpe par
 * zone (`pain-zones.ts`) : la gamme Thérapearl existe par zone, et on ne conseille pas « le dos » sans avoir demandé où le patient a mal.
 */

/** Rangés comme l'ancien dictionnaire le faisait : en poches chaud-froid, sans zone dans les étiquettes (seul le NOM dit la zone). */
const pack = (id: string, name: string) =>
  product({ id, name, brand: null, category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: ["chaud froid", "douleur musculaire"], commercialClaims: [], description: null, stockQuantity: 5 });

const mask = pack("masque", "THERAPEARL MASQ OCUL COMP XXXX");
const kids = pack("kids", "THERA PEARL KIDS DRAGON");
const back = pack("dos", "THERAPEARL DOS COMP XXX");
const knee = pack("genou", "THERAPEARL GENOU COMP XXXX");
const ankle = pack("cheville", "THERAPEARL CHEVILLE COMP XXXX");
const multi = pack("multi", "THERA PEARL POCHE CHAUD FROID");

describe("les règles chaud-froid écartent le masque oculaire et la poche « kids » malgré leurs formules préférées", () => {
  it("chaque zone a sa règle, et chacune porte l'exclusion des masques oculaires", () => {
    for (const key of ["back", "neck", "shoulder", "knee", "hip", "ankle", "other"]) {
      const rule = ADVICE_RULES.find((candidate) => candidate.key === `pain-pack-${key}`);
      expect(rule, key).toBeDefined();
      expect(rule!.productExclude, key).toEqual(expect.arrayContaining([expect.stringContaining("ocul")]));
      expect(rule!.question, key).toBeTruthy();
    }
    expect(ADVICE_RULES.find((candidate) => candidate.key === "pain-cold-hot-pack")).toBeUndefined();
  });

  it("findCandidateProducts, règle du dos : ni le masque, ni « kids », ni la poche d'une autre zone — la poche du dos seule", () => {
    const opportunity = detect("M01AE01").find((o) => o.key === "pain-pack-back")!;
    const found = findCandidateProducts({ opportunity, catalog: [mask, kids, back, knee, ankle, multi] }).map((c) => c.product.name);
    expect(found).toEqual(expect.arrayContaining(["THERAPEARL DOS COMP XXX"]));
    for (const refused of ["THERAPEARL MASQ OCUL COMP XXXX", "THERA PEARL KIDS DRAGON", "THERAPEARL GENOU COMP XXXX", "THERAPEARL CHEVILLE COMP XXXX"]) expect(found).not.toContain(refused);
  });

  it("findCandidateProducts, règle du genou : la poche du genou seule", () => {
    const opportunity = detect("N02BE01").find((o) => o.key === "pain-pack-knee")!;
    const found = findCandidateProducts({ opportunity, catalog: [mask, kids, back, knee, ankle] }).map((c) => c.product.name);
    expect(found).toEqual(["THERAPEARL GENOU COMP XXXX"]);
  });

  it("« ailleurs » : une poche multi-zones, jamais celle d'une zone précise", () => {
    const opportunity = detect("N02BE01").find((o) => o.key === "pain-pack-other")!;
    const found = findCandidateProducts({ opportunity, catalog: [mask, kids, back, knee, ankle, multi] }).map((c) => c.product.name);
    expect(found).toEqual(["THERA PEARL POCHE CHAUD FROID"]);
  });

  it("le masque d'une autre marque n'est sauvé ni par « chaud froid » ni par « poche » ni par « thermcool »", () => {
    const others = [
      pack("m2", "MASQUE OCULAIRE chaud froid gel"),
      pack("m3", "POCHE CHAUD FROID MASQUE YEUX OCULAIRE"),
      pack("m4", "THERMCOOL MASQ OCUL"),
      pack("m5", "KIDS THERAPEARL ANIMAL"),
      pack("m6", "THERA PEARL POCHE CHAUD FROID"),
    ];
    const opportunity = detect("M01AE01").find((o) => o.key === "pain-pack-other")!;
    expect(findCandidateProducts({ opportunity, catalog: others }).map((c) => c.product.name)).toEqual(["THERA PEARL POCHE CHAUD FROID"]);
  });

  it.each([
    ["M01AE01", "ibuprofène"],
    ["N02BE01", "paracétamol"],
  ])("%s (%s) : le moteur retient la poche du dos pour le dos, jamais le masque", (atc) => {
    const catalog = [mask, kids, back];
    expect(names(retained("pain-pack-back", atc, catalog))).toEqual(["THERAPEARL DOS COMP XXX"]);
    expect(namesFor(analyse(atc, catalog), "pain-pack-back", catalog)).toEqual(["THERAPEARL DOS COMP XXX"]);
  });

  it("seul le masque (ou la poche « kids ») en rayon : rien n'est proposé pour la douleur musculaire", () => {
    for (const key of ["pain-pack-back", "pain-pack-other"]) {
      expect(retained(key, "M01AE01", [mask, kids]), key).toEqual([]);
      expect(namesFor(analyse("M01AE01", [mask, kids]), key, [mask, kids]), key).toEqual([]);
    }
  });
});

describe("le dictionnaire range chaque poche par sa zone, et jamais le masque oculaire en poche", () => {
  it("« THERAPEARL MASQ OCUL COMP XXXX » n'est pas étiqueté « chaud froid »", () => {
    expect(classifyProductByName("THERAPEARL MASQ OCUL COMP XXXX")?.tags ?? []).not.toContain("chaud froid");
    expect(classifyProductByName("MASQUE OCULAIRE chaud froid gel")?.tags ?? []).not.toContain("chaud froid");
  });

  it("les poches de zone portent l'étiquette de leur zone ; la poche multi-zones n'en porte aucune", () => {
    const expected: [string, string][] = [
      ["THERAPEARL DOS COMP XXX", "zone dos"],
      ["THERAPEARL GENOU COMP XXXX", "zone genou"],
      ["THERAPEARL HANCHE COMP", "zone hanche"],
      ["THERAPEARL CHEVILLE COMP XXXX", "zone cheville"],
      ["THERAPEARL NUQUE COMP", "zone nuque"],
      ["THERAPEARL EPAULE COMP", "zone épaule"],
    ];
    for (const [name, tag] of expected) {
      const tags = classifyProductByName(name)?.tags ?? [];
      expect(tags, name).toContain("chaud froid");
      expect(tags, name).toContain(tag);
    }
    const multiTags = classifyProductByName("THERMCOOL poche chaud froid")?.tags ?? [];
    expect(multiTags).toContain("chaud froid");
    expect(multiTags.filter((tag) => tag.startsWith("zone "))).toEqual([]);
  });
});
