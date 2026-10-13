import { describe, expect, it } from "vitest";
import { ADVICE_OUTCOME_LABEL, adviceOutcome, boardAdvice, describeAdviceCount } from "../board";

describe("« Au comptoir » : l'état des conseils", () => {
  it("ramène chaque statut à Proposé / Vendu / Non vendu (ou Sans réponse), et cache un conseil retiré", () => {
    expect(adviceOutcome("PROPOSED")).toBe("PROPOSED");
    expect(adviceOutcome("PRESENTED")).toBe("PROPOSED");
    expect(adviceOutcome("PURCHASED")).toBe("SOLD");
    expect(adviceOutcome("ACCEPTED")).toBe("SOLD");
    expect(adviceOutcome("DECLINED")).toBe("NOT_SOLD");
    expect(adviceOutcome("IGNORED")).toBe("UNANSWERED");
    expect(adviceOutcome("REMOVED")).toBeNull();
    expect(ADVICE_OUTCOME_LABEL).toEqual({ PROPOSED: "Proposé", SOLD: "Vendu", NOT_SOLD: "Non vendu", UNANSWERED: "Sans réponse" });
  });

  it("montre chaque conseil une fois, sans les retirés ni les noms vides", () => {
    expect(
      boardAdvice([
        { name: "Probiotique", status: "PURCHASED" },
        { name: "Probiotique", status: "PROPOSED" },
        { name: "Crème", status: "REMOVED" },
        { name: "  ", status: "PROPOSED" },
        { name: null, status: "PROPOSED" },
        { name: "Spray nasal", status: "DECLINED" },
      ]),
    ).toEqual([
      { name: "Probiotique", outcome: "SOLD" },
      { name: "Spray nasal", outcome: "NOT_SOLD" },
    ]);
  });

  it("résume les conseils d'une vente terminée", () => {
    expect(describeAdviceCount(0, 0)).toBe("aucun conseil");
    expect(describeAdviceCount(0, 2)).toBe("2 conseils proposés, aucun vendu");
    expect(describeAdviceCount(1, 1)).toBe("1 conseil vendu sur 1");
    expect(describeAdviceCount(2, 3)).toBe("2 conseils vendus sur 3");
  });
});
