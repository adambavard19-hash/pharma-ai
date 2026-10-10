import { describe, expect, it } from "vitest";
import { summariseRuleFeedback } from "../rule-feedback";

const counts = (retained: number, removed: number, bought = 0, waiting = 0) => [
  { status: "ACCEPTED", count: retained - bought },
  { status: "PURCHASED", count: bought },
  { status: "REMOVED", count: removed },
  { status: "PROPOSED", count: waiting },
];

describe("l'accueil d'une règle dans les pharmacies", () => {
  it("ne dit rien sans assez de conseils tranchés", () => {
    const feedback = summariseRuleFeedback(counts(20, 5), 5);
    expect(feedback).toMatchObject({ decided: 25, retained: 20, verdict: "NOT_ENOUGH_DATA" });
    expect(feedback.retainedRate).toBeCloseTo(0.8);
  });
  it("ne dit rien non plus avec trop peu de pharmacies, même sur beaucoup de conseils", () => {
    expect(summariseRuleFeedback(counts(90, 10), 2).verdict).toBe("NOT_ENOUGH_DATA");
  });
  it("« bien accueilli » : beaucoup retenu, par plusieurs pharmacies", () => {
    expect(summariseRuleFeedback(counts(60, 20, 15), 4)).toMatchObject({ verdict: "WELL_RECEIVED", bought: 15 });
  });
  it("« peu retenu » : très rarement retenu", () => {
    expect(summariseRuleFeedback(counts(6, 40), 5).verdict).toBe("RARELY_RETAINED");
  });
  it("entre les deux : neutre", () => {
    expect(summariseRuleFeedback(counts(20, 30), 5).verdict).toBe("NEUTRAL");
  });
  it("ne compte pas les conseils encore en attente, et refuse de diviser par zéro", () => {
    expect(summariseRuleFeedback(counts(0, 0, 0, 12), 3)).toMatchObject({ decided: 0, retainedRate: null, verdict: "NOT_ENOUGH_DATA" });
  });
  it("un refus du patient après retenue compte comme retenu (l'équipe l'a proposé)", () => {
    expect(summariseRuleFeedback([{ status: "DECLINED", count: 40 }], 4)).toMatchObject({ retained: 40, verdict: "WELL_RECEIVED" });
  });
});
