import { describe, expect, it } from "vitest";
import { disabledRuleKeys, mayShowAtCounter, reviewsByKey, ruleState, type ReviewableRule } from "../rule-review";

const rules: ReviewableRule[] = [
  { key: "dry-mouth-hygiene", version: "1.0", validation: { status: "PENDING" } },
  { key: "rehydration-digestive", version: "1.2", validation: { status: "PENDING" } },
  { key: "ancienne-regle-validee-en-code", version: "1.0", validation: { status: "VALIDATED" } },
];

describe("où en est une règle dans une officine", () => {
  it("à relire tant que personne n'a décidé", () => {
    expect(ruleState(rules[0], reviewsByKey([]))).toBe("TO_REVIEW");
  });

  it("validée ou refusée selon la décision de la pharmacienne, pour la version relue", () => {
    const reviews = reviewsByKey([
      { ruleKey: "dry-mouth-hygiene", ruleVersion: "1.0", decision: "VALIDATED" },
      { ruleKey: "rehydration-digestive", ruleVersion: "1.2", decision: "REJECTED" },
    ]);
    expect(ruleState(rules[0], reviews)).toBe("VALIDATED");
    expect(ruleState(rules[1], reviews)).toBe("REJECTED");
  });

  it("une règle réécrite depuis redevient « à relire » : la décision portait sur l'ancienne version", () => {
    const reviews = reviewsByKey([{ ruleKey: "rehydration-digestive", ruleVersion: "1.1", decision: "REJECTED" }]);
    expect(ruleState(rules[1], reviews)).toBe("TO_REVIEW");
  });

  it("une règle validée dans le code l'est partout, sauf refus explicite de la pharmacienne", () => {
    expect(ruleState(rules[2], reviewsByKey([]))).toBe("VALIDATED");
    expect(ruleState(rules[2], reviewsByKey([{ ruleKey: rules[2].key, ruleVersion: "1.0", decision: "REJECTED" }]))).toBe("REJECTED");
  });
});

describe("ce que la relecture gouverne", () => {
  const reviews = reviewsByKey([
    { ruleKey: "dry-mouth-hygiene", ruleVersion: "1.0", decision: "VALIDATED" },
    { ruleKey: "rehydration-digestive", ruleVersion: "1.2", decision: "REJECTED" },
  ]);

  it("une règle refusée sort du moteur pour cette officine, et elle seule", () => {
    expect(disabledRuleKeys(rules, reviews)).toEqual(["rehydration-digestive"]);
    expect(disabledRuleKeys(rules, reviewsByKey([]))).toEqual([]);
  });

  it("seule une règle validée parle dans la fenêtre du poste : ni une règle à relire, ni refusée, ni inconnue, ni absente", () => {
    expect(mayShowAtCounter("dry-mouth-hygiene", rules, reviews)).toBe(true);
    expect(mayShowAtCounter("rehydration-digestive", rules, reviews)).toBe(false);
    expect(mayShowAtCounter("ancienne-regle-validee-en-code", rules, reviewsByKey([]))).toBe(true);
    expect(mayShowAtCounter("regle-supprimee", rules, reviews)).toBe(false);
    expect(mayShowAtCounter(null, rules, reviews)).toBe(false);
    expect(mayShowAtCounter("dry-mouth-hygiene", rules, reviewsByKey([]))).toBe(false);
  });
});
