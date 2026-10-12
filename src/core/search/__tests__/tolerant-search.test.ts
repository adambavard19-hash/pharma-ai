import { describe, expect, it } from "vitest";
import { parseSearchQuery, scoreMatch, searchableText, sqlTermPattern, sqlTypedPattern, sqlWordPattern, wordsOf } from "../tolerant-search";

/**
 * La recherche tolérante : ce que le pharmacien tape, tel qu'il le tape. Le cas d'origine — « cétirizine 10 mg boîte de 15 »
 * ne trouvait rien alors que la boîte était en stock — est le premier fixé ici.
 */

const found = (query: string, name: string, secondary: string[] = []) => scoreMatch(parseSearchQuery(query), name, secondary) !== null;

describe("le texte comparé", () => {
  it("sans accents ni casse, ligatures dépliées, dosage collé à son unité, virgule décimale en point", () => {
    expect(searchableText("Cétirizine 10 mg")).toBe("CETIRIZINE 10MG");
    expect(searchableText("Œil  sec, 0,5 mg/ml")).toBe("OEIL SEC, 0.5MG/ML");
    expect(searchableText("de 15 comprimé(s)")).toBe("DE 15 COMPRIME(S)");
  });

  it("découpe en mots : dosage, nombre seul, mot ; « 30CPR » et « X30 » se séparent, « B6 » et « SPF50 » non", () => {
    expect(wordsOf(searchableText("CETIRIZINE BIOGARAN 10MG CPR B/15"))).toEqual(["CETIRIZINE", "BIOGARAN", "10MG", "CPR", "B", "15"]);
    expect(wordsOf("30CPR X30 B6 SPF50 10MG/ML")).toEqual(["30", "CPR", "X", "30", "B6", "SPF50", "10MG", "ML"]);
    // Le « X » de multiplication ne colle pas à l'unité : deux flacons de 200 ml, une bande de 5 cm sur 5 m.
    expect(wordsOf(searchableText("HYDRALIN LOT 200MLX2 · 5 cm x 5 m"))).toEqual(["HYDRALIN", "LOT", "200ML", "X", "2", "5CM", "X", "5M"]);
  });
});

describe("ce que le pharmacien tape", () => {
  it("garde les mots significatifs : « boîte », « de », « b/ » ne comptent pas, « 10 mg » est un seul mot", () => {
    const { terms } = parseSearchQuery("cétirizine 10 mg boîte de 15");
    expect(terms.map((term) => term.text)).toEqual(["CETIRIZINE", "10MG", "15"]);
    expect(terms.map((term) => term.bareNumber)).toEqual([false, false, true]);
    expect(parseSearchQuery("B/30 de la").terms.map((term) => term.text)).toEqual(["30"]);
  });

  it("reconnaît un code (EAN, CIP) et rien d'autre", () => {
    expect(parseSearchQuery("3400936403114").code).toBe("3400936403114");
    expect(parseSearchQuery(" 3400 9364 03114 ").code).toBe("3400936403114");
    expect(parseSearchQuery("doliprane 1000").code).toBeNull();
  });

  it("le pluriel ne compte pas, les abréviations du logiciel de gestion valent le mot entier", () => {
    const [comprimes] = parseSearchQuery("comprimés").terms;
    expect(comprimes.text).toBe("COMPRIME");
    expect(comprimes.wholeWords).toContain("CPR");
    const [cpr] = parseSearchQuery("cpr").terms;
    expect(cpr.expansions).toEqual(["COMPRIME"]);
  });
});

describe("ce qui est trouvé", () => {
  it("le constat d'origine : « cétirizine 10 mg boîte de 15 » trouve le libellé du logiciel ET celui du catalogue national", () => {
    expect(found("cétirizine 10 mg boîte de 15", "CETIRIZINE BIOGARAN 10MG CPR B/15")).toBe(true);
    expect(found("cétirizine 10 mg boîte de 15", "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", ["plaquette(s) thermoformée(s) PVC PVDC aluminium de 15 comprimé(s)"])).toBe(true);
  });

  it("insensible aux accents et à la casse, des deux côtés", () => {
    expect(found("CETIRIZINE", "Cétirizine Biogaran")).toBe(true);
    expect(found("crème", "DEXERYL CREME 250G")).toBe(true);
    expect(found("creme", "Crème émolliente")).toBe(true);
  });

  it("« 10 mg » trouve « 10MG », « 10MG » trouve « 10 mg » ; un nombre ne déborde jamais sur un autre", () => {
    expect(found("doliprane 10 mg", "DOLIPRANE 10MG")).toBe(true);
    expect(found("doliprane 10MG", "Doliprane 10 mg")).toBe(true);
    expect(found("doliprane 10", "DOLIPRANE 100 mg")).toBe(false);
    expect(found("doliprane 1000", "DOLIPRANE 1000 mg, comprimé")).toBe(true);
    expect(found("cetirizine 15", "CETIRIZINE B/150")).toBe(false);
    expect(found("0,5 mg", "X 0.5MG")).toBe(true);
  });

  it("mot par mot, dans n'importe quel ordre : chaque mot doit y être, au début d'un mot", () => {
    expect(found("mains creme neutrogena", "NEUTROGENA CREME MAINS")).toBe(true);
    expect(found("neutrogena pieds", "NEUTROGENA CREME MAINS")).toBe(false);
    expect(found("cetiri", "CETIRIZINE ZENTIVA")).toBe(true);
    // « cétirizine » n'est pas « lévocétirizine » : une autre molécule.
    expect(found("cetirizine", "LEVOCETIRIZINE VIATRIS 5 mg")).toBe(false);
  });

  it("les abréviations : « crème mains » trouve « CR MAIN », « comprimé » trouve « CPR », une lettre seule veut le mot entier", () => {
    expect(found("crème mains", "NEUTROGENA CR MAIN CONF/HYD")).toBe(true);
    expect(found("lactibiane comprimé", "LACTIBIANE BUCCODENTAL Cpr suc B/30")).toBe(true);
    expect(found("cpr", "DOLIPRANE 1000 mg, comprimé")).toBe(true);
    expect(found("vitamine c", "VITAMINE C 1000")).toBe(true);
    expect(found("vitamine c", "VITAMINE CALCIUM")).toBe(false);
  });

  it("le nom passe avant le reste : marque, conditionnement, substance trouvent aussi, mais comptent moins", () => {
    const query = parseSearchQuery("cetirizine");
    const generic = scoreMatch(query, "CETIRIZINE ZENTIVA 10 mg", ["CETIRIZINE (DICHLORHYDRATE DE)"]) as number;
    const brand = scoreMatch(query, "ZYRTEC 10 mg/ml", ["CETIRIZINE (DICHLORHYDRATE DE)"]) as number;
    expect(brand).not.toBeNull();
    expect(generic).toBeGreaterThan(brand);
  });

  it("classe le mot exact avant un mot plus long, et le conditionnement exact avant un approchant", () => {
    const creme = parseSearchQuery("creme");
    expect(scoreMatch(creme, "DEXERYL CREME 250G") as number).toBeGreaterThan(scoreMatch(creme, "CREMELINE HP/HC") as number);
    const boite15 = parseSearchQuery("cétirizine 10 mg boîte de 15");
    const zentiva = scoreMatch(boite15, "CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable", ["plaquette(s) de 15 comprimé(s)"]) as number;
    const gouttes = scoreMatch(boite15, "CETIRIZINE BIOGARAN 10 mg/ml, solution buvable en gouttes", ["1 flacon(s) de 15 ml"]) as number;
    expect(zentiva).toBeGreaterThan(gouttes);
  });

  it("les produits (`inside`) : un mot collé dans le libellé du logiciel se trouve aussi, classé après ; jamais un médicament", () => {
    const inside = (query: string, name: string, secondary: string[] = []) => scoreMatch(parseSearchQuery(query), name, secondary, { inside: true });
    // Le constat : « biafine », « mannose », « voyage » ne trouvaient plus ces produits, que l'ancienne recherche trouvait.
    expect(inside("biafine", "CICABIAFINE BAUME CREVASSES")).not.toBeNull();
    expect(inside("mannose", "FEMANNOSE PLUS SACH 14")).not.toBeNull();
    expect(inside("stress", "ERGYSTRESS SEREN Gél B/60")).not.toBeNull();
    expect(inside("voyage", "LACTIBIANE VOYAGE 480mg Gél B/14") as number).toBeGreaterThan(inside("voyage", "PHARMAVOYAGE Bracel anti-naus ad bleu lge B/2") as number);
    // Un dosage collé derrière des lettres, sans déborder : 400 ml dans « GENCIV400ML », pas 25 ml dans « 125ML ».
    expect(inside("400 ml", "MERIDOL B/BOUCH PROTEC GENCIV400ML")).not.toBeNull();
    expect(inside("25 ml", "FOUCAUD FRICT 65D SP RECH125ML")).toBeNull();
    expect(inside("10", "DOLIPRANE 100 mg")).toBeNull();
    // Un morceau de code (cinq chiffres au moins) dans l'EAN, comme le trouvait l'ancienne recherche.
    expect(inside("12345", "Spray nasal", ["3401234567890"])).not.toBeNull();
    // Moins de trois lettres : pas au milieu d'un mot (« av » dans « LAV » ne désigne rien).
    expect(inside("av", "SAFORELLE SOL LAV DOUC FL100ML")).toBeNull();
    // Sans `inside` — les médicaments —, la règle reste stricte.
    expect(found("biafine", "CICABIAFINE BAUME CREVASSES")).toBe(false);
    expect(found("cetirizine", "LEVOCETIRIZINE VIATRIS 5 mg")).toBe(false);
  });

  it("sans mot significatif : tout répond, sans classement", () => {
    expect(scoreMatch(parseSearchQuery("de la"), "N'importe quoi")).toBe(0);
  });
});

describe("le premier tri en base", () => {
  it("un motif plus large que la comparaison exacte : accents, espace entre nombre et unité, abréviations", () => {
    const [cetirizine, dose, number] = parseSearchQuery("cétirizine 10 mg boîte de 15").terms;
    const regex = (pattern: string) => new RegExp(pattern, "i");
    expect(regex(sqlTermPattern(cetirizine)).test("CÉTIRIZINE")).toBe(true);
    expect(regex(sqlTermPattern(dose)).test("10 MG")).toBe(true);
    expect(regex(sqlTermPattern(dose)).test("10MG")).toBe(true);
    expect(regex(sqlTermPattern(number)).test("B/15")).toBe(true);
    const [comprime] = parseSearchQuery("comprimé").terms;
    expect(regex(sqlTermPattern(comprime)).test("LACTIBIANE CPR")).toBe(true);
  });

  it("ne contient que des lettres, des chiffres et des classes : rien de ce qui est tapé n'y passe tel quel", () => {
    const { terms } = parseSearchQuery("'; DROP TABLE products; -- %_ (a|b)* \\");
    const safe = /^[A-Z0-9 *\[\]\(\)\?:|.,ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÎÏÍÌîïíìÑñÔÖÓÒÕôöóòõÙÛÜÚùûüúŸÝÿýŒœÆæ]+$/;
    for (const term of terms) {
      expect(sqlTermPattern(term)).toMatch(safe);
      expect(sqlTypedPattern(term)).toMatch(safe);
      // Le motif « début de mot » n'ajoute que `\m`, `\M` et le garde-fou d'un nombre non prolongé.
      expect(sqlWordPattern(term).replace(/\\[mM]/g, "").replace("(?![0-9])", "")).toMatch(safe);
    }
  });

  it("range d'abord ce qui a chaque mot au DÉBUT d'un mot : une abréviation ou une lettre en mot entier, un nombre non prolongé", () => {
    // Les marques de PostgreSQL (`\m` début de mot, `\M` fin de mot), traduites pour JavaScript sur des libellés sans accents.
    const regex = (pattern: string) => new RegExp(pattern.replace(/\\m/g, "(?<![A-Za-z0-9_])(?=[A-Za-z0-9_])").replace(/\\M/g, "(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])"), "i");
    const [tube] = parseSearchQuery("tube").terms;
    expect(regex(sqlWordPattern(tube)).test("HYALUGEL 1ERE DENT TUBE 20ML")).toBe(true);
    expect(regex(sqlWordPattern(tube)).test("APIVITA CR PIED T/150")).toBe(true);
    expect(regex(sqlWordPattern(tube)).test("PARODONTAX DENT BITUBE")).toBe(false);
    expect(regex(sqlWordPattern(tube)).test("COTON TIGE")).toBe(false);
    expect(regex(sqlTypedPattern(tube)).test("PARODONTAX DENT BITUBE")).toBe(true);
    const [dose] = parseSearchQuery("10 mg").terms;
    expect(regex(sqlWordPattern(dose)).test("DOLIPRANE 10 MG")).toBe(true);
    expect(regex(sqlWordPattern(dose)).test("DOLIPRANE 10MG")).toBe(true);
    expect(regex(sqlWordPattern(dose)).test("DOLIPRANE 100MG")).toBe(false);
    expect(regex(sqlWordPattern(dose)).test("GENCIV10MG")).toBe(false);
  });
});
