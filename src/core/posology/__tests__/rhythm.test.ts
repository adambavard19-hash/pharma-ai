import { describe, expect, it } from "vitest";
import { describeRhythm, formatSchedule, parsePosology, readSchedule } from "..";

describe("rythmes non quotidiens", () => {
  it("lit « un jour sur deux » et « tous les 3 jours » sans inventer les moments", () => {
    expect(parsePosology("1 comprimé le matin un jour sur deux")?.schedule.everyDays).toBe(2);
    expect(parsePosology("1 comprimé le soir tous les 3 jours")?.schedule.everyDays).toBe(3);
    expect(parsePosology("1 comprimé le matin")?.schedule.everyDays).toBeUndefined();
  });

  it("lit une prise hebdomadaire, déduite comme telle", () => {
    const parsed = parsePosology("1 comprimé par semaine");
    expect(parsed?.schedule.everyDays).toBe(7);
    expect(parsed?.inferred).toBe(true);
  });

  it("le dit dans la phrase et conserve la valeur en base", () => {
    const schedule = parsePosology("1 comprimé le matin un jour sur deux")!.schedule;
    expect(formatSchedule(schedule, "comprimé")).toBe("1 matin — 1 comprimé un jour sur deux");
    expect(readSchedule(JSON.parse(JSON.stringify(schedule)))?.everyDays).toBe(2);
    expect(readSchedule({ morning: 1, everyDays: 1 })?.everyDays).toBeUndefined();
    expect(describeRhythm(7)).toBe("une fois par semaine");
    expect(describeRhythm(undefined)).toBeNull();
  });
});
