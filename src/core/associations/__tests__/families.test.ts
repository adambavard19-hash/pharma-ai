import { describe, expect, it } from "vitest";
import { belongsToFamily, cleanTerms, parseTerm, termMatches, type FamilyDefinition } from "../families";

const family = (over: Partial<FamilyDefinition> = {}): FamilyDefinition => ({
  id: "f1",
  includeTerms: ["shamp/shp chute"],
  excludeTerms: ["chien/chat"],
  members: new Map(),
  ...over,
});

describe("familles déclencheuses", () => {
  it("lit un terme : mots obligatoires, variantes séparées par /", () => {
    expect(parseTerm("Shamp/SHP  anti-chute")).toEqual([["shamp", "shp"], ["antichute"]]);
  });

  it("reconnaît le libellé abrégé du stock (LGPI), en début de mot", () => {
    expect(termMatches(parseTerm("shamp/shp chute"), "PHYTOCYANE SHP ANTI-CHUTE 200ML")).toBe(true);
    expect(termMatches(parseTerm("shamp/shp chute"), "Shampooing antichute fortifiant")).toBe(true);
    expect(termMatches(parseTerm("shamp/shp anti chute"), "KLORANE SHAMPOOING ANTI CHUTE QUININE")).toBe(true);
    expect(termMatches(parseTerm("shamp/shp chute"), "SHAMPOOING DOUX")).toBe(false);
  });

  it("un mot exclu écarte le produit", () => {
    expect(belongsToFamily(family(), { labels: ["SHP ANTI-CHUTE CHIEN 200ML"], keys: [] })).toBe(false);
    expect(belongsToFamily(family(), { labels: ["SHP ANTI-CHUTE 200ML"], keys: [] })).toBe(true);
  });

  it("un ajout à la main suffit, un retrait l'emporte sur le libellé", () => {
    const f = family({ members: new Map([["ean:111", true], ["ean:222", false]]) });
    expect(belongsToFamily(f, { labels: ["NEOPTIDE LOTION"], keys: ["ean:111"] })).toBe(true);
    expect(belongsToFamily(f, { labels: ["SHP ANTI-CHUTE 200ML"], keys: ["ean:222"] })).toBe(false);
  });

  it("nettoie les termes saisis : vides et doublons retirés", () => {
    expect(cleanTerms(["  shamp chute ", "", "SHAMP  chute", "masque/msq nourr"])).toEqual(["shamp chute", "masque/msq nourr"]);
  });
});
