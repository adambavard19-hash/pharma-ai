import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDay,
  challengeWindow,
  dayKeyToDate,
  daysBetween,
  isCalendarDay,
  isInWindow,
  safeTimeZone,
  toDayKey,
  zonedDayStart,
} from "../dates";

/**
 * Les jours d'un challenge : bornes incluses, coupées à minuit heure de
 * l'officine, changements d'heure compris. Une vente de 0 h 30 à Paris est
 * enregistrée la veille en UTC : elle doit pourtant compter pour le bon jour.
 */

describe("jours calendaires", () => {
  it("reconnaît une date qui existe et refuse le 31 février", () => {
    expect(isCalendarDay("2026-10-31")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-02-31")).toBe(false);
    expect(isCalendarDay("31/10/2026")).toBe(false);
    expect(isCalendarDay("")).toBe(false);
  });

  it("lit une colonne date (minuit UTC), une date sérialisée ou une saisie", () => {
    expect(toDayKey(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
    expect(toDayKey("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    expect(toDayKey("2026-10-01")).toBe("2026-10-01");
    expect(() => toDayKey("2026-02-30")).toThrow();
    expect(() => toDayKey("n'importe quoi")).toThrow();
  });

  it("compte les jours entre deux dates et en ajoute", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(daysBetween("2026-10-25", "2026-10-26")).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayKeyToDate("2026-10-01").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("le jour vu depuis l'officine", () => {
  it("bascule à minuit heure de Paris, pas à minuit UTC", () => {
    expect(calendarDay(new Date("2026-09-30T22:30:00Z"), "Europe/Paris")).toBe("2026-10-01");
    expect(calendarDay(new Date("2026-09-30T21:30:00Z"), "Europe/Paris")).toBe("2026-09-30");
    expect(calendarDay(new Date("2026-12-31T23:30:00Z"), "Europe/Paris")).toBe("2027-01-01");
  });

  it("retombe sur Paris quand le fuseau enregistré est illisible", () => {
    expect(safeTimeZone("Pas/UnFuseau")).toBe("Europe/Paris");
    expect(safeTimeZone(null)).toBe("Europe/Paris");
    expect(safeTimeZone("America/Cayenne")).toBe("America/Cayenne");
  });
});

describe("minuit local", () => {
  it("vaut 22 h UTC l'été et 23 h UTC l'hiver", () => {
    expect(zonedDayStart("2026-07-14", "Europe/Paris").toISOString()).toBe("2026-07-13T22:00:00.000Z");
    expect(zonedDayStart("2026-01-15", "Europe/Paris").toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("tient les jours de changement d'heure", () => {
    expect(zonedDayStart("2026-03-29", "Europe/Paris").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedDayStart("2026-03-30", "Europe/Paris").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(zonedDayStart("2026-10-25", "Europe/Paris").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedDayStart("2026-10-26", "Europe/Paris").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("marche aussi outre-mer", () => {
    expect(zonedDayStart("2026-10-01", "Indian/Reunion").toISOString()).toBe("2026-09-30T20:00:00.000Z");
  });
});

describe("fenêtre des ventes d'un challenge", () => {
  const window = challengeWindow("2026-10-01", "2026-10-31", "Europe/Paris");

  it("couvre le premier et le dernier jour en entier", () => {
    expect(window.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(window.until.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(isInWindow(new Date("2026-09-30T22:00:00Z"), window)).toBe(true);
    expect(isInWindow(new Date("2026-10-31T22:59:59Z"), window)).toBe(true);
  });

  it("exclut la veille et le lendemain", () => {
    expect(isInWindow(new Date("2026-09-30T21:59:59Z"), window)).toBe(false);
    expect(isInWindow(new Date("2026-10-31T23:00:00Z"), window)).toBe(false);
  });

  it("d'un seul jour, dure vingt-quatre heures", () => {
    const day = challengeWindow("2026-07-14", "2026-07-14", "Europe/Paris");
    expect(day.until.getTime() - day.from.getTime()).toBe(24 * 3600 * 1000);
  });
});
