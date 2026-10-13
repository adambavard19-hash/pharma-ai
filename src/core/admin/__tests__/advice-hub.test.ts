import { describe, expect, it } from "vitest";
import { atcLevels, atcMatches, countByFilter, filterFromParam, HUB_FILTERS, matchesFilter, matchesHubQuery, medicineTerms, parseHubQuery, type HubFacets } from "../advice-hub";
import { activeNavItem, allNavItems } from "../nav";

/** « Conseils » : un seul endroit, des filtres en mots simples, une recherche par n'importe quel mot. */

const entry = (overrides: Partial<HubFacets> & { id: string }): HubFacets => ({ trigger: "MEDICINE", review: false, robot: false, removed: false, atcPrefixes: [], searchText: "", ...overrides });

const ENTRIES = [
  entry({ id: "rule:a", review: true, atcPrefixes: ["R06AE"], searchText: "Bouche ou gorge sèche sous antihistaminique · Pas avant 12 ans · Votre traitement peut assécher la gorge" }),
  entry({ id: "rule:b", atcPrefixes: ["N02BE"], searchText: "Thermomètre · Fièvre" }),
  entry({ id: "association:c", trigger: "PRODUCT", review: true, searchText: "Crème solaire → Après-soleil" }),
  entry({ id: "robot:d", review: true, robot: true, atcPrefixes: ["A02AD01"], searchText: "MAALOX → Tisane digestive" }),
  entry({ id: "rule:e", removed: true, searchText: "Collyre anti-allergique supprimé" }),
  entry({ id: "rule:f", robot: true, atcPrefixes: ["J01"], searchText: "Probiotiques sous antibiotique" }),
];

describe("les filtres en mots simples", () => {
  it("dans cet ordre, sans nom technique", () => {
    expect(HUB_FILTERS.map((filter) => filter.label)).toEqual(["Tous", "Déclenchés par un médicament", "Déclenchés par un produit", "À relire", "Proposés par le robot", "Retirés", "Familles déclencheuses", "À ne pas associer"]);
  });

  it("regroupent règles, conseils déclenchés par un produit et suggestions du robot ; « Retirés » à part", () => {
    expect(countByFilter(ENTRIES)).toEqual({ ALL: 5, MEDICINE: 4, PRODUCT: 1, REVIEW: 3, ROBOT: 2, REMOVED: 1 });
    expect(ENTRIES.filter((item) => matchesFilter(item, "ROBOT")).map((item) => item.id)).toEqual(["robot:d", "rule:f"]);
    expect(ENTRIES.filter((item) => matchesFilter(item, "REMOVED")).map((item) => item.id)).toEqual(["rule:e"]);
    expect(matchesFilter(ENTRIES[4], "REVIEW")).toBe(false);
  });

  it("se lisent dans l'adresse (les anciennes adresses mènent au bon filtre)", () => {
    expect(filterFromParam("robot")).toBe("ROBOT");
    expect(filterFromParam("a-ne-pas-associer")).toBe("AVOID");
    expect(filterFromParam(["produit"])).toBe("PRODUCT");
    expect(filterFromParam("n-importe-quoi")).toBe("ALL");
    expect(filterFromParam(undefined)).toBe("ALL");
  });
});

describe("la recherche : n'importe quel mot, de n'importe quel champ", () => {
  const find = (query: string, codes: Record<string, string[]> = {}) => ENTRIES.filter((item) => matchesHubQuery(item, parseHubQuery(query), codes)).map((item) => item.id);

  it("sans accents ni casse, et pas seulement le titre", () => {
    expect(find("SECHE")).toEqual(["rule:a"]);
    expect(find("thermometre")).toEqual(["rule:b"]);
    expect(find("après-soleil")).toEqual(["association:c"]);
    expect(find("assécher")).toEqual(["rule:a"]);
  });

  it("mot par mot : tous les mots tapés doivent se retrouver quelque part", () => {
    expect(find("gorge 12 ans")).toEqual(["rule:a"]);
    expect(find("gorge fièvre")).toEqual([]);
    // « 12 » ne trouve pas « 120 ».
    expect(matchesHubQuery(entry({ id: "x", searchText: "boîte de 120" }), parseHubQuery("12"))).toBe(false);
  });

  it("« allergie » trouve « anti-allergique » (une lettre près, au milieu d'un mot)", () => {
    // Le conseil retiré « Collyre anti-allergique » est trouvé aussi : la recherche ne dépend pas du filtre.
    expect(find("allergie")).toEqual(["rule:e"]);
    expect(matchesHubQuery(entry({ id: "y", searchText: "Collyre anti-allergique" }), parseHubQuery("allergie"))).toBe(true);
  });

  it("par le NOM d'un médicament : le serveur donne ses familles, le conseil qui vise la famille est trouvé", () => {
    expect(find("cétirizine")).toEqual([]);
    expect(find("cétirizine", { CETIRIZINE: ["R06AE07"] })).toEqual(["rule:a"]);
    expect(find("maalox")).toEqual(["robot:d"]);
    expect(find("amoxicilline", { AMOXICILLINE: ["J01CA04"] })).toEqual(["rule:f"]);
    // Un code de famille tapé tel quel.
    expect(find("N02BE01")).toEqual(["rule:b"]);
  });

  it("seuls les vrais mots partent au catalogue des médicaments", () => {
    expect(medicineTerms(parseHubQuery("cétirizine 10 mg boîte"))).toEqual(["CETIRIZINE"]);
    expect(medicineTerms(parseHubQuery("12 ans R06AE"))).toEqual([]);
  });

  it("les niveaux d'une famille, du plus large au plus précis", () => {
    expect(atcLevels("R06AE07")).toEqual(["R", "R06", "R06A", "R06AE", "R06AE07"]);
    expect(atcMatches(["R06A"], ["R06AE07"])).toBe(true);
    expect(atcMatches(["R06AX"], ["R06AE07"])).toBe(false);
  });
});

describe("la navigation : « Conseils » est le seul onglet, les anciennes adresses y restent rattachées", () => {
  it("plus d'onglet « Suggestions du robot » ni « Conseils & associations »", () => {
    const labels = allNavItems().map(({ item }) => item.label);
    expect(labels).toContain("Conseils");
    expect(labels).not.toContain("Suggestions du robot");
    expect(labels).not.toContain("Conseils & associations");
    expect(activeNavItem("/admin/suggestions-robot").item?.label).toBe("Conseils");
  });
});
