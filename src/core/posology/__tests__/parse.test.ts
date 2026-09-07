import { describe, expect, it } from "vitest";
import {
  buildDailyPlan,
  formatSchedule,
  parsePosology,
  readSchedule,
  totalDailyDoses,
  unitsForDuration,
} from "../index";

describe("lecture d'une posologie", () => {
  it("lit les moments nommés sans rien déduire", () => {
    const result = parsePosology("1 comprimé matin et soir");
    expect(result).not.toBeNull();
    expect(result!.inferred).toBe(false);
    expect(result!.schedule.morning).toBe(1);
    expect(result!.schedule.evening).toBe(1);
    expect(result!.schedule.noon).toBe(0);
    expect(result!.schedule.bedtime).toBe(0);
  });

  it("lit la quantité par prise", () => {
    const result = parsePosology("2 comprimés le matin");
    expect(result!.schedule.morning).toBe(2);
    expect(totalDailyDoses(result!.schedule)).toBe(2);
  });

  it("reconnaît les moments malgré les accents et la casse", () => {
    const result = parsePosology("1 gélule le MIDI");
    expect(result!.schedule.noon).toBe(1);
  });

  /**
   * Une fréquence ne dit pas QUAND. La répartition proposée est une convention
   * d'officine : elle doit être signalée comme déduite, pour que l'écran la
   * fasse confirmer au lieu de la présenter comme lue sur l'ordonnance.
   */
  it("marque comme déduite une répartition tirée d'une fréquence", () => {
    const result = parsePosology("1 comprimé 3 fois par jour");
    expect(result!.inferred).toBe(true);
    expect(result!.schedule.morning).toBe(1);
    expect(result!.schedule.noon).toBe(1);
    expect(result!.schedule.evening).toBe(1);
  });

  it("traduit un intervalle horaire en fréquence", () => {
    const result = parsePosology("1 comprimé toutes les 8 heures");
    expect(result!.inferred).toBe(true);
    expect(totalDailyDoses(result!.schedule)).toBe(3);
  });

  it("ne double pas la prise quand « soir » et « coucher » se suivent", () => {
    const result = parsePosology("1 comprimé le soir au coucher");
    expect(totalDailyDoses(result!.schedule)).toBe(1);
    expect(result!.schedule.bedtime).toBe(1);
  });

  it("lit le moment par rapport au repas", () => {
    expect(parsePosology("1 comprimé matin et soir au cours des repas")!.schedule.mealTiming).toBe("DURING");
    expect(parsePosology("1 gélule le matin à jeun")!.schedule.mealTiming).toBe("BEFORE");
    expect(parsePosology("1 comprimé après le repas du midi")!.schedule.mealTiming).toBe("AFTER");
  });

  /** Le cœur de la règle : ne rien inventer. */
  it("ne rend rien lorsque la phrase ne permet pas de conclure", () => {
    expect(parsePosology("selon avis médical")).toBeNull();
    expect(parsePosology("")).toBeNull();
    expect(parsePosology(null)).toBeNull();
    expect(parsePosology("à adapter")).toBeNull();
  });

  it("ne propose pas de répartition au-delà de quatre prises", () => {
    expect(parsePosology("1 comprimé 6 fois par jour")).toBeNull();
  });

  it("lit la sténographie des ordonnances manuscrites comme des prises", () => {
    // Telles que lues sur une vraie ordonnance : le nombre est collé au
    // marqueur de fréquence, sans unité entre les deux.
    for (const phrase of ["3 par jour", "3/J", "2 F/J", "2 x/jour", "3 fois/j"]) {
      const result = parsePosology(phrase);
      expect(result, phrase).not.toBeNull();
      expect(result!.inferred, phrase).toBe(true);
      expect(
        result!.schedule.morning +
          result!.schedule.noon +
          result!.schedule.evening +
          result!.schedule.bedtime,
        phrase,
      ).toBe(Number(phrase[0]));
    }
  });

  it("laisse ambigu un nombre d'unités par jour sans nombre de prises", () => {
    // « 2 comprimés par jour » : deux prises, ou deux comprimés en une seule ?
    // Le pharmacien tranche, pas le parseur.
    expect(parsePosology("2 comprimés par jour")).toBeNull();
    expect(parsePosology("1/2 comprimé par jour")).toBeNull();
  });
});

describe("restitution", () => {
  it("écrit une phrase courte à partir de la répartition", () => {
    const parsed = parsePosology("1 comprimé matin et soir au cours des repas")!;
    expect(formatSchedule(parsed.schedule, "comprimé")).toBe(
      "1 matin · 1 soir — 2 comprimés par jour, pendant le repas",
    );
  });

  it("calcule les unités nécessaires pour la durée", () => {
    const parsed = parsePosology("1 comprimé matin et soir")!;
    expect(unitsForDuration(parsed.schedule, 6)).toBe(12);
    expect(unitsForDuration(parsed.schedule, null)).toBeNull();
  });
});

describe("relecture de la colonne JSON", () => {
  it("rejette une forme inattendue", () => {
    expect(readSchedule(null)).toBeNull();
    expect(readSchedule("matin")).toBeNull();
    expect(readSchedule({})).toBeNull();
  });

  it("relit une répartition enregistrée", () => {
    const schedule = readSchedule({ morning: 1, evening: 2, mealTiming: "DURING", times: ["08:00"] });
    expect(schedule).toEqual({
      morning: 1,
      noon: 0,
      evening: 2,
      bedtime: 0,
      mealTiming: "DURING",
      times: ["08:00"],
    });
  });

  it("ignore des valeurs aberrantes plutôt que de les propager", () => {
    const schedule = readSchedule({ morning: -3, noon: "deux", evening: 999, bedtime: 1 });
    expect(schedule).toEqual({
      morning: 0,
      noon: 0,
      evening: 20,
      bedtime: 1,
      mealTiming: null,
      times: [],
    });
  });
});

describe("plan de la journée", () => {
  const withSchedule = {
    drugName: "Amoxicilline",
    dosage: "1 g",
    form: "Comprimé",
    schedule: parsePosology("1 comprimé matin et soir")!.schedule,
  };
  const withoutSchedule = {
    drugName: "Crème",
    dosage: null,
    form: "Crème",
    schedule: null,
  };

  it("range les prises par moment de la journée", () => {
    const plan = buildDailyPlan([withSchedule]);
    expect(plan.map((section) => section.moment)).toEqual(["morning", "evening"]);
    expect(plan[0].entries[0]).toEqual({
      drugName: "Amoxicilline",
      dosage: "1 g",
      doses: 1,
      unit: "comprimé",
    });
  });

  /** Le point qui compte : aucun horaire n'est fabriqué pour compléter. */
  it("ignore les traitements sans répartition confirmée", () => {
    expect(buildDailyPlan([withoutSchedule])).toEqual([]);
    const plan = buildDailyPlan([withSchedule, withoutSchedule]);
    expect(plan.flatMap((s) => s.entries.map((e) => e.drugName))).toEqual([
      "Amoxicilline",
      "Amoxicilline",
    ]);
  });

  it("ne garde aucun moment vide", () => {
    const plan = buildDailyPlan([withSchedule]);
    expect(plan.every((section) => section.entries.length > 0)).toBe(true);
  });
});
