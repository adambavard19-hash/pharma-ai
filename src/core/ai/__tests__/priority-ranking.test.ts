import { describe, expect, it } from "vitest";
import { applyPriorityRankings, rankedRulesForFamily, readRankings } from "../priority-ranking";

/** Le classement des conseils par famille de médicaments, choisi dans la console (fondateur, 26 oct. 2026). */

const opp = (ruleKey: string, priority: number, lineIndex = 0) => ({ ruleKey, priority, triggeredBy: [{ lineIndex }] });
const amox = { lineIndex: 0, atcCode: "J01CA04" };

describe("classement des conseils par famille", () => {
  it("redistribue les priorités dans l'ordre choisi : la règle 1 passe devant", () => {
    const result = applyPriorityRankings([opp("flore", 90), opp("intime", 46), opp("vitamines", 46)], [amox], { J01: ["vitamines", "flore", "intime"] });
    expect(result.map((item) => [item.ruleKey, item.priority])).toEqual([["vitamines", 90], ["flore", 46], ["intime", 45]]);
  });

  it("la famille la plus précise l'emporte (Pénicillines avant Antibiotiques)", () => {
    const result = applyPriorityRankings([opp("flore", 90), opp("intime", 46)], [amox], { J01: ["flore", "intime"], J01C: ["intime", "flore"] });
    expect(result[0].ruleKey).toBe("intime");
  });

  it("ne touche ni aux conseils d'un autre médicament, ni à ceux d'une autre famille", () => {
    const doliprane = { lineIndex: 1, atcCode: "N02BE01" };
    const result = applyPriorityRankings([opp("flore", 90), opp("fievre", 60, 1), opp("intime", 46)], [amox, doliprane], { J01: ["intime", "flore"] });
    expect(result.map((item) => [item.ruleKey, item.priority])).toEqual([["intime", 90], ["fievre", 60], ["flore", 46]]);
    expect(applyPriorityRankings([opp("fievre", 60, 1)], [doliprane], { J01: ["intime"] })[0].priority).toBe(60);
  });

  it("liste les règles d'une famille, celles classées d'abord", () => {
    const rules = [
      { key: "flore", atcPrefixes: ["J01"], basePriority: 90 },
      { key: "soleil", atcPrefixes: ["J01AA"], basePriority: 88 },
      { key: "estomac", atcPrefixes: ["M01A"], basePriority: 70 },
    ];
    expect(rankedRulesForFamily(rules, "J01").map((rule) => rule.key)).toEqual(["flore", "soleil"]);
    expect(rankedRulesForFamily(rules, "J01", ["soleil"]).map((rule) => rule.key)).toEqual(["soleil", "flore"]);
    expect(rankedRulesForFamily(rules, "J01C").map((rule) => rule.key)).toEqual(["flore"]);
  });

  it("ignore une famille inconnue ou une valeur abîmée", () => {
    expect(readRankings({ J01: ["a", "a", 3], XX: ["b"] })).toEqual({ J01: ["a"] });
    expect(readRankings(null)).toEqual({});
  });
});
