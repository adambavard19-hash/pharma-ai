import { describe, expect, it } from "vitest";
import { composeKeyPoints, summarizeDayPlan, unscheduledTreatment, ADVICE_STATUSES_ON_PLAN } from "../compose";
import type { DocumentTreatmentItem } from "../types";

/**
 * Le plan patient ne dit que ce qui a été validé au comptoir. Ces tests
 * fixent ce qu'il a le droit de déduire — c'est-à-dire rien.
 */

const item = (overrides: Partial<DocumentTreatmentItem>): DocumentTreatmentItem => ({
  drugName: "EFFERALGAN 1 g",
  dosage: "1 g",
  form: "comprimé",
  posology: null,
  schedule: null,
  durationDays: null,
  instructions: null,
  purpose: null,
  tips: [],
  precautions: [],
  sourceLabel: "",
  explanationUnavailable: true,
  ...overrides,
});

const morningEvening = { morning: 1, noon: 0, evening: 1, bedtime: 0, mealTiming: null, times: [] };

describe("plan Matin / Midi / Soir", () => {
  it("compte les médicaments par moment à partir des répartitions confirmées, sans les nommer", () => {
    const summary = summarizeDayPlan([
      item({ drugName: "EFFERALGAN 1 g", schedule: morningEvening }),
      item({ drugName: "RULID 150", schedule: { ...morningEvening, noon: 1 } }),
    ]);
    expect(summary.map((m) => [m.label, m.count])).toEqual([["Matin", 2], ["Midi", 1], ["Soir", 2]]);
    expect(JSON.stringify(summary)).not.toMatch(/EFFERALGAN|RULID/);
  });

  it("n'inclut le coucher que s'il y a une prise au coucher", () => {
    expect(summarizeDayPlan([item({ schedule: morningEvening })]).map((m) => m.moment)).not.toContain("bedtime");
    expect(
      summarizeDayPlan([item({ schedule: { ...morningEvening, bedtime: 1 } })]).map((m) => m.moment),
    ).toContain("bedtime");
  });

  it("ne déduit jamais un horaire d'une posologie écrite : la ligne part en « À confirmer »", () => {
    const lines = [
      item({ drugName: "TUSSIDANE", posology: "1 cuillère 3 fois par jour", schedule: null }),
      item({ drugName: "RULID 150", schedule: morningEvening }),
    ];
    expect(summarizeDayPlan(lines).reduce((sum, m) => sum + m.count, 0)).toBe(2);
    expect(unscheduledTreatment(lines).map((l) => l.drugName)).toEqual(["TUSSIDANE"]);
  });
});

describe("« À retenir »", () => {
  it("reprend la durée confirmée et la consigne écrite, rien d'autre", () => {
    const points = composeKeyPoints([
      item({ drugName: "RULID 150", durationDays: 5, precautions: ["Précaution du référentiel"] }),
      item({ drugName: "BECOTIDE 250", instructions: "Rincer la bouche après chaque prise" }),
    ]);
    expect(points).toEqual([
      "RULID 150 : pendant 5 jours, jusqu'au bout même si vous vous sentez mieux.",
      "BECOTIDE 250 : Rincer la bouche après chaque prise.",
    ]);
    expect(points.join(" ")).not.toContain("référentiel");
  });

  it("reste vide quand rien n'a été validé : la zone n'apparaît pas", () => {
    expect(composeKeyPoints([item({}), item({ drugName: "X", durationDays: 0 })])).toEqual([]);
  });

  it("accorde le singulier", () => {
    expect(composeKeyPoints([item({ durationDays: 1 })])[0]).toContain("pendant 1 jour,");
  });
});

describe("conseils sur le plan", () => {
  it("n'admet que les conseils acceptés ou remis — jamais refusés, jamais simplement proposés", () => {
    expect(ADVICE_STATUSES_ON_PLAN).not.toContain("REFUSED");
    expect(ADVICE_STATUSES_ON_PLAN).not.toContain("PROPOSED");
    expect(ADVICE_STATUSES_ON_PLAN).toContain("ACCEPTED");
    expect(ADVICE_STATUSES_ON_PLAN).toContain("PURCHASED");
  });
});
