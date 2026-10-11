import { describe, expect, it } from "vitest";
import { objectiveProgress, periodBounds, validateObjective } from "../objectives";
import { bonusTotals, canManageTeam, nextBonusStatus, parseEuros, visibleToCollaborator } from "../bonuses";

const october = { metric: "ADVICE_SOLD", target: 20, startsOn: "2026-10-01", endsOn: "2026-10-31" };

describe("l'avancement d'un objectif", () => {
  it("atteint dès que la cible est atteinte", () => {
    expect(objectiveProgress(october, 20, "2026-10-11")).toMatchObject({ state: "DONE", percent: 100, value: 20 });
    expect(objectiveProgress(october, 35, "2026-10-11").percent).toBe(100);
  });
  it("dans les temps quand la part atteinte suit le temps écoulé, à accélérer sinon", () => {
    // 11 octobre : 10 jours sur 31 passés ≈ 32 %.
    expect(objectiveProgress(october, 7, "2026-10-11").state).toBe("ON_TRACK");
    expect(objectiveProgress(october, 6, "2026-10-11").state).toBe("BEHIND");
    expect(objectiveProgress(october, 0, "2026-10-01").state).toBe("ON_TRACK");
  });
  it("non atteint une fois la période passée, à venir avant", () => {
    expect(objectiveProgress(october, 12, "2026-11-02")).toMatchObject({ state: "MISSED", daysRemaining: 0 });
    expect(objectiveProgress(october, 0, "2026-09-20").state).toBe("UPCOMING");
  });
  it("un objectif libre n'affiche aucun chiffre inventé", () => {
    expect(objectiveProgress({ ...october, metric: "CUSTOM" }, null, "2026-10-11")).toMatchObject({ value: null, percent: null, state: "MANUAL" });
  });
  it("compte les jours restants, aujourd'hui compris", () => {
    expect(objectiveProgress(october, 1, "2026-10-31").daysRemaining).toBe(1);
  });
});

describe("les périodes et la saisie", () => {
  it("semaine du lundi au dimanche, mois et trimestre civils", () => {
    expect(periodBounds("WEEK", "2026-10-11")).toEqual({ startsOn: "2026-10-05", endsOn: "2026-10-11" });
    expect(periodBounds("MONTH", "2026-02-10")).toEqual({ startsOn: "2026-02-01", endsOn: "2026-02-28" });
    expect(periodBounds("QUARTER", "2026-11-15")).toEqual({ startsOn: "2026-10-01", endsOn: "2026-12-31" });
  });
  it("valide une saisie correcte et refuse les incohérences", () => {
    expect(validateObjective({ userId: "u1", title: "  30 conseils  ", metric: "ADVICE_SOLD", target: 30, period: "MONTH" }, "2026-10-11")).toEqual({
      ok: true,
      value: { userId: "u1", title: "30 conseils", metric: "ADVICE_SOLD", target: 30, period: "MONTH", startsOn: "2026-10-01", endsOn: "2026-10-31", challengeId: null },
    });
    const bad = validateObjective({ userId: "", title: "x", metric: "CA", target: 0, period: "CUSTOM", startsOn: "2026-10-20", endsOn: "2026-10-10" }, "2026-10-11");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["endsOn", "metric", "target", "title", "userId"]);
    const past = validateObjective({ userId: "u1", title: "Septembre", metric: "ADVICE_SOLD", target: 5, period: "CUSTOM", startsOn: "2026-09-01", endsOn: "2026-09-30" }, "2026-10-11");
    expect(past.ok).toBe(false);
  });
});

describe("les primes", () => {
  it("le collaborateur ne voit que les primes validées ou versées", () => {
    expect(["PROPOSED", "VALIDATED", "PAID", "CANCELLED"].filter(visibleToCollaborator)).toEqual(["VALIDATED", "PAID"]);
  });
  it("transitions : proposée → validée → versée ; annulable avant versement ; rien après", () => {
    expect(nextBonusStatus("PROPOSED", "VALIDATE")).toBe("VALIDATED");
    expect(nextBonusStatus("PROPOSED", "PAY")).toBeNull();
    expect(nextBonusStatus("VALIDATED", "PAY")).toBe("PAID");
    expect(nextBonusStatus("VALIDATED", "CANCEL")).toBe("CANCELLED");
    expect(nextBonusStatus("PAID", "CANCEL")).toBeNull();
    expect(nextBonusStatus("CANCELLED", "VALIDATE")).toBeNull();
  });
  it("totaux : jamais une proposition ni une annulation", () => {
    expect(bonusTotals([{ status: "VALIDATED", amountCents: 5000 }, { status: "PAID", amountCents: 2000 }, { status: "PROPOSED", amountCents: 9999 }, { status: "CANCELLED", amountCents: 7000 }])).toEqual({ validatedCents: 5000, paidCents: 2000 });
  });
  it("montants en euros, bornés", () => {
    expect(parseEuros("25")).toBe(2500);
    expect(parseEuros("25,5 €")).toBe(2550);
    expect(parseEuros("0")).toBeNull();
    expect(parseEuros("6000")).toBeNull();
    expect(parseEuros("abc")).toBeNull();
  });
  it("seul le titulaire gère l'équipe", () => {
    expect(canManageTeam("OWNER")).toBe(true);
    expect(["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER", null].some(canManageTeam)).toBe(false);
  });
});
