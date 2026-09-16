import { describe, expect, it } from "vitest";
import { durationLimitDays, evaluateRegulation, requiresAttention, type CoverageFacts } from "../rules";

const TODAY = new Date("2026-09-17T10:00:00.000Z");

function coverage(over: Partial<CoverageFacts> = {}): CoverageFacts {
  return { isException: false, coverageEndsAt: null, coverageEndReason: null, notReimbursable: false, sourceUpdatedAt: new Date("2026-09-07T00:00:00.000Z"), ...over };
}

function codes(conditions: string[], extra: Partial<Parameters<typeof evaluateRegulation>[0]> = {}) {
  return evaluateRegulation({ conditions, coverage: null, durationDays: null, today: TODAY, ...extra }).map((a) => a.code);
}

describe("evaluateRegulation", () => {
  it("impose l'ordonnance d'exception dès que la base tarifaire le dit", () => {
    const alerts = evaluateRegulation({ conditions: ["liste I"], coverage: coverage({ isException: true }), durationDays: null, today: TODAY });
    expect(alerts[0]?.code).toBe("EXCEPTION_FORM");
    expect(alerts[0]?.severity).toBe("BLOCKING");
    expect(alerts[0]?.action).toContain("12708");
    expect(alerts.map((a) => a.code)).toEqual(["EXCEPTION_FORM", "LIST_I"]);
    expect(requiresAttention(alerts)).toBe(true);
  });

  it("traduit un stupéfiant en ordonnance sécurisée et délai de 3 jours", () => {
    const [alert] = evaluateRegulation({ conditions: ["stupéfiants"], coverage: null, durationDays: null, today: TODAY });
    expect(alert?.code).toBe("NARCOTIC");
    expect(alert?.severity).toBe("BLOCKING");
    expect(alert?.action).toMatch(/3 jours/);
    expect(alert?.basis).toBe("stupéfiants");
  });

  it("reconnaît les assimilés stupéfiants sur ordonnance sécurisée", () => {
    expect(codes(["prescription sur ordonnance sécurisée"])).toEqual(["SECURED_FORM"]);
    expect(codes(["prescription en toutes lettres sur ordonnance sécurisée"])).toEqual(["SECURED_FORM"]);
  });

  it("dit combien de mois vaut une prescription initiale hospitalière", () => {
    const [annual] = evaluateRegulation({ conditions: ["prescription initiale hospitalière annuelle"], coverage: null, durationDays: null, today: TODAY });
    expect(annual?.title).toContain("12 mois");
    const [semestrial] = evaluateRegulation({ conditions: ["prescription initiale hospitalière semestrielle"], coverage: null, durationDays: null, today: TODAY });
    expect(semestrial?.action).toContain("6 mois");
  });

  it("bloque la délivrance en ville d'un médicament hospitalier", () => {
    const [alert] = evaluateRegulation({ conditions: ["réservé à l'usage HOSPITALIER"], coverage: null, durationDays: null, today: TODAY });
    expect(alert?.code).toBe("HOSPITAL_ONLY");
    expect(alert?.severity).toBe("BLOCKING");
  });

  it("compare la durée lue à la limite publiée", () => {
    expect(durationLimitDays("prescription limitée à 4 semaines")).toBe(28);
    expect(durationLimitDays("prescription limitée à 12 semaines")).toBe(84);
    expect(durationLimitDays("prescription limitée à 7 jours ou 28 jours")).toBe(28);
    expect(durationLimitDays("liste I")).toBeNull();
    const ok = evaluateRegulation({ conditions: ["prescription limitée à 4 semaines"], coverage: null, durationDays: 28, today: TODAY });
    expect(ok[0]?.severity).toBe("CHECK");
    const over = evaluateRegulation({ conditions: ["prescription limitée à 4 semaines"], coverage: null, durationDays: 90, today: TODAY });
    expect(over[0]?.severity).toBe("BLOCKING");
    expect(over[0]?.action).toContain("90 jours");
  });

  it("garde la qualification du prescripteur mot pour mot", () => {
    const [alert] = evaluateRegulation({ conditions: ["prescription réservée aux spécialistes et services ONCOLOGIE MEDICALE"], coverage: null, durationDays: null, today: TODAY });
    expect(alert?.code).toBe("SPECIALIST");
    expect(alert?.basis).toBe("prescription réservée aux spécialistes et services ONCOLOGIE MEDICALE");
  });

  it("signale une fin de prise en charge passée, et se tait sur une fin future", () => {
    const past = evaluateRegulation({ conditions: [], coverage: coverage({ coverageEndsAt: new Date("2026-06-30T00:00:00.000Z"), coverageEndReason: "RADIATION" }), durationDays: null, today: TODAY });
    expect(past.map((a) => a.code)).toEqual(["COVERAGE_ENDED"]);
    expect(past[0]?.action).toContain("radiation");
    const future = evaluateRegulation({ conditions: [], coverage: coverage({ coverageEndsAt: new Date("2029-08-16T00:00:00.000Z"), coverageEndReason: "REEXAMEN" }), durationDays: null, today: TODAY });
    expect(future).toEqual([]);
  });

  it("classe les listes en information et ignore le renouvellement non restreint", () => {
    const alerts = evaluateRegulation({ conditions: ["liste II", "renouvellement non restreint"], coverage: null, durationDays: null, today: TODAY });
    expect(alerts.map((a) => [a.code, a.severity])).toEqual([["LIST_II", "INFO"]]);
    expect(requiresAttention(alerts)).toBe(false);
  });

  it("montre une condition inconnue telle quelle plutôt que de la taire", () => {
    const [alert] = evaluateRegulation({ conditions: ["réservé à l'usage professionnel"], coverage: null, durationDays: null, today: TODAY });
    expect(alert?.code).toBe("OTHER_CONDITION");
    expect(alert?.basis).toBe("réservé à l'usage professionnel");
  });

  it("range les alertes des plus bloquantes aux plus informatives", () => {
    const order = codes(["liste I", "prescription initiale hospitalière annuelle", "stupéfiants"]);
    expect(order).toEqual(["NARCOTIC", "INITIAL_HOSPITAL", "LIST_I"]);
  });
});
