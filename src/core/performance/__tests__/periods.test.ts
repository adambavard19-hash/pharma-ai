import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_PERIOD_DAYS,
  MIN_CUSTOM_YEAR,
  PERIOD_OPTIONS,
  PERIOD_PARAM_VALUES,
  RHYTHM_WINDOW_DAYS,
  isValidCalendarDate,
  monthBoundsFor,
  parsePeriodParams,
  periodToSearchParams,
  resolvePerformancePeriod,
  zonedDateParts,
  zonedStartOfDay,
} from "../periods";
import type { PerformancePeriod, PerformancePeriodKey } from "../types";

const TZ = "Europe/Paris";
const at = (instant: string) => new Date(instant);
const iso = (date: Date) => date.toISOString();

/** Les quatre bornes d'une période, en texte, pour des assertions lisibles. */
function bounds(period: PerformancePeriod) {
  return {
    start: iso(period.start),
    end: iso(period.end),
    previousStart: iso(period.previousStart),
    previousEnd: iso(period.previousEnd),
  };
}

function resolve(key: PerformancePeriodKey, now: string, extra: { from?: string; to?: string } = {}) {
  return resolvePerformancePeriod({ key, now: at(now), timeZone: TZ, ...extra });
}

describe("isValidCalendarDate", () => {
  it.each(["2026-01-01", "2026-12-31", "2026-04-30", "2024-02-29", "2000-02-29", "2026-10-06"])("accepte %s", (value) => {
    expect(isValidCalendarDate(value)).toBe(true);
  });

  it.each([
    "2026-02-31",
    "2026-02-29",
    "2100-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "2026-04-31",
    "2026-06-31",
    "2026-9-1",
    "2026-09-1",
    "26-09-01",
    "2026/09/01",
    "2026-09-01T00:00:00Z",
    " 2026-09-01",
    "2026-09-01 ",
    "",
    "abcd-ef-gh",
    "0000-01-01",
  ])("refuse %j", (value) => {
    expect(isValidCalendarDate(value)).toBe(false);
  });

  it("reste un contrôle de CALENDRIER : une année ancienne existe (le plancher de l'an 2000 est celui de la période, pas de la date)", () => {
    expect(isValidCalendarDate("0001-01-01")).toBe(true);
    expect(isValidCalendarDate("1999-12-31")).toBe(true);
  });

  it("ne lève jamais d'exception sur une valeur qui n'est pas un texte", () => {
    expect(isValidCalendarDate(undefined as unknown as string)).toBe(false);
    expect(isValidCalendarDate(20260101 as unknown as string)).toBe(false);
    expect(isValidCalendarDate(null as unknown as string)).toBe(false);
  });
});

describe("zonedDateParts", () => {
  it("donne l'heure d'horloge du fuseau, pas celle du serveur", () => {
    // Hiver (UTC+1) : 23 h 30 UTC, c'est déjà le lendemain à Paris.
    expect(zonedDateParts(at("2026-01-15T23:30:00Z"), TZ)).toEqual({ year: 2026, month: 1, day: 16, hour: 0, weekday: 4 });
    // Été (UTC+2).
    expect(zonedDateParts(at("2026-07-14T22:30:00Z"), TZ)).toEqual({ year: 2026, month: 7, day: 15, hour: 0, weekday: 2 });
    // Passage à l'année suivante.
    expect(zonedDateParts(at("2026-12-31T23:00:00Z"), TZ)).toEqual({ year: 2027, month: 1, day: 1, hour: 0, weekday: 4 });
  });

  it("compte le lundi pour 0 et le dimanche pour 6", () => {
    expect(zonedDateParts(at("2026-10-05T10:00:00Z"), TZ).weekday).toBe(0);
    expect(zonedDateParts(at("2026-10-06T10:00:00Z"), TZ).weekday).toBe(1);
    expect(zonedDateParts(at("2026-10-11T10:00:00Z"), TZ).weekday).toBe(6);
  });

  it("saute l'heure qui n'existe pas au passage à l'heure d'été (dimanche 29 mars 2026)", () => {
    expect(zonedDateParts(at("2026-03-29T00:59:59Z"), TZ).hour).toBe(1);
    expect(zonedDateParts(at("2026-03-29T01:00:00Z"), TZ).hour).toBe(3);
  });

  it("répète l'heure au retour à l'heure d'hiver (dimanche 25 octobre 2026), sans jamais afficher 24", () => {
    expect(zonedDateParts(at("2026-10-25T00:30:00Z"), TZ).hour).toBe(2);
    expect(zonedDateParts(at("2026-10-25T01:30:00Z"), TZ).hour).toBe(2);
    expect(zonedDateParts(at("2026-10-25T22:59:59Z"), TZ).hour).toBe(23);
    expect(zonedDateParts(at("2026-10-24T22:00:00Z"), TZ).hour).toBe(0);
  });

  it("suit un autre fuseau", () => {
    expect(zonedDateParts(at("2026-01-15T20:00:00Z"), "Pacific/Auckland")).toEqual({ year: 2026, month: 1, day: 16, hour: 9, weekday: 4 });
  });
});

describe("zonedStartOfDay", () => {
  it.each([
    ["hiver", "2026-01-15T12:00:00Z", "2026-01-14T23:00:00.000Z"],
    ["été", "2026-07-15T12:00:00Z", "2026-07-14T22:00:00.000Z"],
    ["juste après minuit à Paris", "2026-10-05T22:00:00Z", "2026-10-05T22:00:00.000Z"],
    ["une milliseconde avant minuit à Paris", "2026-10-05T21:59:59.999Z", "2026-10-04T22:00:00.000Z"],
  ])("%s", (_name, instant, expected) => {
    expect(iso(zonedStartOfDay(at(instant), TZ))).toBe(expected);
  });

  it("donne un jour de 23 h le dimanche 29 mars 2026", () => {
    const sunday = zonedStartOfDay(at("2026-03-29T10:00:00Z"), TZ);
    const monday = zonedStartOfDay(at("2026-03-30T10:00:00Z"), TZ);
    expect(iso(sunday)).toBe("2026-03-28T23:00:00.000Z");
    expect(iso(monday)).toBe("2026-03-29T22:00:00.000Z");
    expect((monday.getTime() - sunday.getTime()) / 3_600_000).toBe(23);
  });

  it("donne un jour de 25 h le dimanche 25 octobre 2026", () => {
    const sunday = zonedStartOfDay(at("2026-10-25T10:00:00Z"), TZ);
    const monday = zonedStartOfDay(at("2026-10-26T10:00:00Z"), TZ);
    expect(iso(sunday)).toBe("2026-10-24T22:00:00.000Z");
    expect(iso(monday)).toBe("2026-10-25T23:00:00.000Z");
    expect((monday.getTime() - sunday.getTime()) / 3_600_000).toBe(25);
  });

  it("suit d'autres fuseaux, y compris un décalage d'une demi-heure et un minuit qui n'existe pas", () => {
    expect(iso(zonedStartOfDay(at("2026-01-15T20:00:00Z"), "Asia/Kolkata"))).toBe("2026-01-15T18:30:00.000Z");
    expect(iso(zonedStartOfDay(at("2026-01-15T20:00:00Z"), "UTC"))).toBe("2026-01-15T00:00:00.000Z");
    expect(iso(zonedStartOfDay(at("2026-03-08T12:00:00Z"), "America/New_York"))).toBe("2026-03-08T05:00:00.000Z");
    // La Havane passe de minuit à 1 h : le jour commence à 1 h, le premier instant qui existe.
    expect(iso(zonedStartOfDay(at("2026-03-08T12:00:00Z"), "America/Havana"))).toBe("2026-03-08T05:00:00.000Z");
    expect(iso(zonedStartOfDay(at("2026-03-09T12:00:00Z"), "America/Havana"))).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("monthBoundsFor", () => {
  it.each([
    ["octobre 2026 (31 jours, l'heure d'hiver revient)", "2026-10-06T10:30:00Z", "2026-09-30T22:00:00.000Z", "2026-10-31T23:00:00.000Z", "octobre 2026"],
    ["février 2026 (28 jours)", "2026-02-10T12:00:00Z", "2026-01-31T23:00:00.000Z", "2026-02-28T23:00:00.000Z", "février 2026"],
    ["février 2028 (bissextile, 29 jours)", "2028-02-15T12:00:00Z", "2028-01-31T23:00:00.000Z", "2028-02-29T23:00:00.000Z", "février 2028"],
    ["mars 2026 (l'heure d'été arrive)", "2026-03-15T12:00:00Z", "2026-02-28T23:00:00.000Z", "2026-03-31T22:00:00.000Z", "mars 2026"],
    ["décembre 2026 (l'année change à la fin)", "2026-12-20T12:00:00Z", "2026-11-30T23:00:00.000Z", "2026-12-31T23:00:00.000Z", "décembre 2026"],
  ])("%s", (_name, now, start, end, label) => {
    const month = monthBoundsFor(at(now), TZ);
    expect({ start: iso(month.start), end: iso(month.end), label: month.label }).toEqual({ start, end, label });
  });

  it("change de mois à minuit heure de Paris, pas à minuit UTC", () => {
    expect(monthBoundsFor(at("2026-09-30T22:00:00.000Z"), TZ).label).toBe("octobre 2026");
    expect(monthBoundsFor(at("2026-09-30T21:59:59.999Z"), TZ).label).toBe("septembre 2026");
  });
});

describe("resolvePerformancePeriod : aujourd'hui", () => {
  it("va de minuit à maintenant, contre hier de minuit à la même heure", () => {
    const period = resolve("today", "2026-10-06T10:30:00Z");
    expect(bounds(period)).toEqual({
      start: "2026-10-05T22:00:00.000Z",
      end: "2026-10-06T10:30:00.000Z",
      previousStart: "2026-10-04T22:00:00.000Z",
      previousEnd: "2026-10-05T10:30:00.000Z",
    });
    expect(period).toMatchObject({ key: "today", label: "Aujourd'hui", granularity: "hour", dayCount: 1, inProgress: true });
    expect(period.from).toBeUndefined();
    expect(period.to).toBeUndefined();
  });

  it("prend le jour de Paris même quand le jour UTC n'a pas changé", () => {
    const period = resolve("today", "2026-10-05T22:30:00Z"); // 00 h 30 le 6 octobre à Paris
    expect(iso(period.start)).toBe("2026-10-05T22:00:00.000Z");
    expect(iso(period.previousEnd)).toBe("2026-10-04T22:30:00.000Z");
  });

  it("garde les bonnes bornes le dimanche du passage à l'heure d'été (jour de 23 h)", () => {
    expect(bounds(resolve("today", "2026-03-29T12:00:00Z"))).toEqual({
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T12:00:00.000Z",
      previousStart: "2026-03-27T23:00:00.000Z",
      previousEnd: "2026-03-28T13:00:00.000Z", // samedi 14 h, comme dimanche 14 h
    });
  });

  it("compare le lendemain du passage à l'heure d'été à la même heure d'horloge", () => {
    // Lundi 10 h : hier (dimanche, 23 h) à 10 h.
    expect(bounds(resolve("today", "2026-03-30T08:00:00Z"))).toEqual({
      start: "2026-03-29T22:00:00.000Z",
      end: "2026-03-30T08:00:00.000Z",
      previousStart: "2026-03-28T23:00:00.000Z",
      previousEnd: "2026-03-29T08:00:00.000Z",
    });
  });

  it("garde les bonnes bornes le dimanche du retour à l'heure d'hiver (jour de 25 h)", () => {
    expect(bounds(resolve("today", "2026-10-25T12:00:00Z"))).toEqual({
      start: "2026-10-24T22:00:00.000Z",
      end: "2026-10-25T12:00:00.000Z",
      previousStart: "2026-10-23T22:00:00.000Z",
      previousEnd: "2026-10-24T11:00:00.000Z",
    });
    expect(bounds(resolve("today", "2026-10-26T10:00:00Z"))).toEqual({
      start: "2026-10-25T23:00:00.000Z",
      end: "2026-10-26T10:00:00.000Z",
      previousStart: "2026-10-24T22:00:00.000Z",
      previousEnd: "2026-10-25T10:00:00.000Z",
    });
  });

  it("ne produit jamais une heure d'hier qui n'existe pas : 2 h 30 devient 3 h 30", () => {
    // Lundi 2 h 30 ; dimanche 2 h 30 n'a pas existé (23 h → 3 h).
    const period = resolve("today", "2026-03-30T00:30:00Z");
    expect(iso(period.previousEnd)).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedDateParts(period.previousEnd, TZ).hour).toBe(3);
  });

  it("ne dépend pas de l'instant de départ exact : minuit pile ne couvre rien", () => {
    const period = resolve("today", "2026-10-05T22:00:00Z");
    expect(iso(period.start)).toBe(iso(period.end));
    expect(iso(period.previousStart)).toBe("2026-10-04T22:00:00.000Z");
    expect(iso(period.previousEnd)).toBe("2026-10-04T22:00:00.000Z");
  });
});

describe("resolvePerformancePeriod : 7 derniers jours", () => {
  it("couvre 7 jours civils jusqu'à maintenant, contre les 7 jours d'avant à la même heure", () => {
    const period = resolve("7d", "2026-10-06T10:30:00Z"); // mardi 12 h 30
    expect(bounds(period)).toEqual({
      start: "2026-09-29T22:00:00.000Z", // mercredi 30 septembre, 0 h
      end: "2026-10-06T10:30:00.000Z",
      previousStart: "2026-09-22T22:00:00.000Z", // mercredi 23 septembre, 0 h
      previousEnd: "2026-09-29T10:30:00.000Z", // mardi 29 septembre, 12 h 30
    });
    expect(period).toMatchObject({ key: "7d", label: "7 derniers jours", granularity: "day", dayCount: 7, inProgress: true });
  });

  it("« les 6 jours précédents et aujourd'hui » : un lundi à 8 h, la fenêtre démarre le mardi d'avant à 0 h (6 jours 8 h), pas 7 jours pleins", () => {
    // Lundi 5 octobre 2026, 8 h à Paris. Le début est le mardi 29 septembre, 0 h.
    const period = resolve("7d", "2026-10-05T06:00:00Z");
    expect(iso(period.start)).toBe("2026-09-28T22:00:00.000Z");
    expect((period.end.getTime() - period.start.getTime()) / 3_600_000).toBe(6 * 24 + 8);
    // Une vente du lundi précédent à 15 h n'est pas dans la fenêtre (c'est ce que dit le panneau « Comment c'est calculé »).
    expect(at("2026-09-28T13:00:00Z") < period.start).toBe(true);
    // La comparaison dure exactement autant : même durée écoulée, jamais 7 jours pleins contre 6 j 8 h.
    expect(period.previousEnd.getTime() - period.previousStart.getTime()).toBe(period.end.getTime() - period.start.getTime());
  });

  it("traverse le retour à l'heure d'hiver sans décaler les jours", () => {
    expect(bounds(resolve("7d", "2026-10-27T10:00:00Z"))).toEqual({
      start: "2026-10-20T22:00:00.000Z",
      end: "2026-10-27T10:00:00.000Z",
      previousStart: "2026-10-13T22:00:00.000Z",
      previousEnd: "2026-10-20T09:00:00.000Z", // mardi 20 octobre, 11 h (heure d'été)
    });
  });

  it("traverse le passage à l'heure d'été sans décaler les jours", () => {
    expect(bounds(resolve("7d", "2026-03-31T10:00:00Z"))).toEqual({
      start: "2026-03-24T23:00:00.000Z", // mercredi 25 mars, 0 h (heure d'hiver)
      end: "2026-03-31T10:00:00.000Z",
      previousStart: "2026-03-17T23:00:00.000Z",
      previousEnd: "2026-03-24T11:00:00.000Z", // mardi 24 mars, 12 h (heure d'hiver)
    });
  });
});

describe("resolvePerformancePeriod : ce mois-ci", () => {
  it("va du 1er à maintenant, contre le mois précédent jusqu'au même quantième à la même heure", () => {
    const period = resolve("month", "2026-10-15T10:00:00Z");
    expect(bounds(period)).toEqual({
      start: "2026-09-30T22:00:00.000Z",
      end: "2026-10-15T10:00:00.000Z",
      previousStart: "2026-08-31T22:00:00.000Z",
      previousEnd: "2026-09-15T10:00:00.000Z",
    });
    expect(period).toMatchObject({ key: "month", label: "Ce mois-ci", granularity: "day", dayCount: 15, inProgress: true });
  });

  it("borne la comparaison à la fin du mois précédent quand il est plus court (31 octobre contre septembre)", () => {
    const period = resolve("month", "2026-10-31T09:00:00Z");
    expect(bounds(period)).toEqual({
      start: "2026-09-30T22:00:00.000Z",
      end: "2026-10-31T09:00:00.000Z",
      previousStart: "2026-08-31T22:00:00.000Z",
      previousEnd: "2026-09-30T22:00:00.000Z", // fin de septembre = début d'octobre
    });
    expect(period.dayCount).toBe(31);
  });

  it("borne à février : 28 jours en 2026, 29 jours en 2028", () => {
    expect(bounds(resolve("month", "2026-03-31T10:00:00Z"))).toEqual({
      start: "2026-02-28T23:00:00.000Z",
      end: "2026-03-31T10:00:00.000Z",
      previousStart: "2026-01-31T23:00:00.000Z",
      previousEnd: "2026-02-28T23:00:00.000Z",
    });
    // Le 28 mars existe en février : pas de borne.
    expect(iso(resolve("month", "2026-03-28T10:00:00Z").previousEnd)).toBe("2026-02-28T10:00:00.000Z");
    // 2028 est bissextile : le 29 existe, le 30 non.
    expect(iso(resolve("month", "2028-03-29T10:00:00Z").previousEnd)).toBe("2028-02-29T11:00:00.000Z");
    expect(iso(resolve("month", "2028-03-30T10:00:00Z").previousEnd)).toBe("2028-02-29T23:00:00.000Z");
  });

  it("compare janvier à décembre de l'année d'avant", () => {
    expect(bounds(resolve("month", "2027-01-10T10:00:00Z"))).toEqual({
      start: "2026-12-31T23:00:00.000Z",
      end: "2027-01-10T10:00:00.000Z",
      previousStart: "2026-11-30T23:00:00.000Z",
      previousEnd: "2026-12-10T10:00:00.000Z",
    });
  });

  it("compte le premier jour du mois comme un seul jour", () => {
    const period = resolve("month", "2026-03-01T10:00:00Z");
    expect(period.dayCount).toBe(1);
    expect(iso(period.start)).toBe("2026-02-28T23:00:00.000Z");
    expect(iso(period.previousEnd)).toBe("2026-02-01T10:00:00.000Z");
  });
});

describe("resolvePerformancePeriod : personnalisée", () => {
  const NOW = "2026-10-06T10:00:00Z"; // mardi 6 octobre 2026, 12 h à Paris

  it("couvre du premier au dernier jour inclus, contre la fenêtre de même durée juste avant", () => {
    const period = resolve("custom", NOW, { from: "2026-09-01", to: "2026-09-15" });
    expect(bounds(period)).toEqual({
      start: "2026-08-31T22:00:00.000Z",
      end: "2026-09-15T22:00:00.000Z", // le début du 16, `au` compris
      previousStart: "2026-08-16T22:00:00.000Z", // le 17 août
      previousEnd: "2026-08-31T22:00:00.000Z",
    });
    expect(period).toMatchObject({
      key: "custom",
      label: "Du 1er au 15 septembre 2026",
      granularity: "day",
      dayCount: 15,
      inProgress: false,
      from: "2026-09-01",
      to: "2026-09-15",
    });
  });

  it("remet les dates dans l'ordre quand `du` est après `au`", () => {
    const inverted = resolve("custom", NOW, { from: "2026-09-15", to: "2026-09-01" });
    const ordered = resolve("custom", NOW, { from: "2026-09-01", to: "2026-09-15" });
    expect(inverted).toEqual(ordered);
    expect(inverted.from).toBe("2026-09-01");
    expect(inverted.to).toBe("2026-09-15");
  });

  it("s'arrête à maintenant quand `au` est aujourd'hui, et compare à durée écoulée égale", () => {
    const period = resolve("custom", NOW, { from: "2026-10-01", to: "2026-10-06" });
    expect(bounds(period)).toEqual({
      start: "2026-09-30T22:00:00.000Z",
      end: NOW.replace("Z", ".000Z"), // jamais le début du lendemain
      previousStart: "2026-09-24T22:00:00.000Z",
      previousEnd: "2026-09-30T10:00:00.000Z",
    });
    expect(period).toMatchObject({ dayCount: 6, inProgress: true });
  });

  it("juge « aujourd'hui » dans le fuseau de l'officine : à 0 h 30 le 7 octobre à Paris, `au` du 7 passe et celui du 8 non", () => {
    const now = "2026-10-06T22:30:00Z";
    expect(resolve("custom", now, { from: "2026-10-01", to: "2026-10-07" }).key).toBe("custom");
    expect(resolve("custom", now, { from: "2026-10-01", to: "2026-10-08" }).key).toBe("7d");
    // Le 6 est terminé : sa fin est minuit à Paris.
    const finished = resolve("custom", now, { from: "2026-10-06", to: "2026-10-06" });
    expect(iso(finished.end)).toBe("2026-10-06T22:00:00.000Z");
    expect(finished.inProgress).toBe(false);
  });

  it("refuse une date à venir : repli sur 7 jours", () => {
    const period = resolve("custom", NOW, { from: "2026-10-01", to: "2026-10-07" });
    expect(period.key).toBe("7d");
    expect(period.from).toBeUndefined();
  });

  it(`accepte ${MAX_CUSTOM_PERIOD_DAYS} jours, refuse ${MAX_CUSTOM_PERIOD_DAYS + 1}`, () => {
    const ok = resolve("custom", NOW, { from: "2025-10-06", to: "2026-10-06" });
    expect(ok).toMatchObject({ key: "custom", dayCount: 366, granularity: "week" });
    expect(resolve("custom", NOW, { from: "2025-10-05", to: "2026-10-06" }).key).toBe("7d");
  });

  it("passe de la journée à la semaine au-delà de 35 jours", () => {
    expect(resolve("custom", NOW, { from: "2026-09-02", to: "2026-10-06" })).toMatchObject({ dayCount: 35, granularity: "day" });
    expect(resolve("custom", NOW, { from: "2026-09-01", to: "2026-10-06" })).toMatchObject({ dayCount: 36, granularity: "week" });
  });

  it.each([
    ["30 février", "2026-02-30", "2026-03-05"],
    ["31 février", "2026-02-31", "2026-03-05"],
    ["mois 13", "2026-13-01", "2026-03-05"],
    ["31 avril", "2026-04-31", "2026-05-01"],
    ["29 février d'une année non bissextile", "2026-03-05", "2026-02-29"],
    ["texte", "abc", "2026-03-05"],
    ["mois sur un chiffre", "2026-3-5", "2026-03-06"],
    ["vide", "", ""],
    ["`du` seul", undefined, "2026-03-05"],
    ["`au` seul", "2026-03-05", undefined],
  ])("refuse les dates impossibles (%s) : repli sur 7 jours", (_name, from, to) => {
    expect(resolve("custom", NOW, { from, to }).key).toBe("7d");
  });

  it("garde un jour de 23 h et un jour de 25 h dans la fenêtre", () => {
    const spring = resolve("custom", "2026-10-06T10:00:00Z", { from: "2026-03-28", to: "2026-03-30" });
    expect(bounds(spring)).toEqual({
      start: "2026-03-27T23:00:00.000Z",
      end: "2026-03-30T22:00:00.000Z",
      previousStart: "2026-03-24T23:00:00.000Z",
      previousEnd: "2026-03-27T23:00:00.000Z",
    });
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(71);
    const autumn = resolve("custom", "2026-11-10T10:00:00Z", { from: "2026-10-24", to: "2026-10-26" });
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(73);
  });

  it.each([
    ["un seul jour", "2026-09-15", "2026-09-15", "Le 15 septembre 2026"],
    ["deux mois d'une même année", "2026-08-28", "2026-09-03", "Du 28 août au 3 septembre 2026"],
    ["deux années", "2025-12-28", "2026-01-03", "Du 28 décembre 2025 au 3 janvier 2026"],
    ["un mois entier", "2026-02-01", "2026-02-28", "Du 1er au 28 février 2026"],
    ["un seul jour, le 1er", "2026-09-01", "2026-09-01", "Le 1er septembre 2026"],
    ["du 1er d'un mois à un autre jour d'un autre mois", "2026-09-01", "2026-10-06", "Du 1er septembre au 6 octobre 2026"],
    ["jusqu'au 1er d'un autre mois", "2026-09-15", "2026-10-01", "Du 15 septembre au 1er octobre 2026"],
    ["du 1er au 1er, deux années", "2025-12-01", "2026-01-01", "Du 1er décembre 2025 au 1er janvier 2026"],
    ["jusqu'au 1er, deux années", "2025-12-15", "2026-01-01", "Du 15 décembre 2025 au 1er janvier 2026"],
    ["le 2 reste « 2 »", "2026-09-02", "2026-09-02", "Le 2 septembre 2026"],
  ])("écrit le libellé : %s", (_name, from, to, label) => {
    expect(resolve("custom", NOW, { from, to }).label).toBe(label);
  });

  describe("une année trop ancienne retombe sur 7 jours (la base refuse les dates de l'an 0)", () => {
    it.each([
      ["l'an 1, deux jours", "0001-01-01", "0001-01-02"],
      ["l'an 1, un seul jour", "0001-01-01", "0001-01-01"],
      ["le 31 décembre 1999", "1999-12-31", "1999-12-31"],
      ["du 31 décembre 1999 au 5 janvier 2000", "1999-12-31", "2000-01-05"],
      ["dates inversées, la plus ancienne en 1999", "2000-03-01", "1999-12-31"],
    ])("%s : repli sur 7 jours, sans dates", (_name, from, to) => {
      const period = resolve("custom", NOW, { from, to });
      expect(period.key).toBe("7d");
      expect(period.from).toBeUndefined();
      expect(period.to).toBeUndefined();
      expect(period.label).toBe("7 derniers jours");
    });

    it("le 1er janvier 2000 est accepté, et sa période précédente reste dans une année que la base accepte", () => {
      const period = resolve("custom", NOW, { from: "2000-01-01", to: "2000-01-05" });
      expect(period).toMatchObject({ key: "custom", from: "2000-01-01", to: "2000-01-05", dayCount: 5, label: "Du 1er au 5 janvier 2000" });
      expect(bounds(period)).toEqual({
        start: "1999-12-31T23:00:00.000Z",
        end: "2000-01-05T23:00:00.000Z",
        previousStart: "1999-12-26T23:00:00.000Z",
        previousEnd: "1999-12-31T23:00:00.000Z",
      });
    });

    it("le plancher est l'an 2000", () => {
      expect(MIN_CUSTOM_YEAR).toBe(2000);
    });
  });

  it("ignore `du` et `au` quand le choix n'est pas personnalisé", () => {
    const period = resolve("month", NOW, { from: "2026-01-01", to: "2026-01-31" });
    expect(period.key).toBe("month");
    expect(period.from).toBeUndefined();
  });

  it("retombe sur 7 jours quand les dates manquent", () => {
    expect(resolve("custom", NOW).key).toBe("7d");
  });
});

describe("invariants de toutes les périodes", () => {
  it("garde toujours previousStart ≤ previousEnd ≤ start ≤ end ≤ maintenant, autour des deux changements d'heure", () => {
    const keys: PerformancePeriodKey[] = ["today", "7d", "month"];
    const windows: [string, string][] = [
      ["2026-03-26T00:00:00Z", "2026-04-02T00:00:00Z"],
      ["2026-10-22T00:00:00Z", "2026-10-30T00:00:00Z"],
    ];
    for (const [from, to] of windows) {
      for (let t = at(from).getTime(); t < at(to).getTime(); t += 47 * 60_000) {
        const now = new Date(t);
        for (const key of keys) {
          const period = resolvePerformancePeriod({ key, now, timeZone: TZ });
          const label = `${key} @ ${iso(now)}`;
          expect(period.previousStart.getTime(), label).toBeLessThanOrEqual(period.previousEnd.getTime());
          expect(period.previousEnd.getTime(), label).toBeLessThanOrEqual(period.start.getTime());
          expect(period.start.getTime(), label).toBeLessThanOrEqual(period.end.getTime());
          expect(period.end.getTime(), label).toBe(t);
          // Le début est toujours un minuit de Paris ; la comparaison aussi.
          expect(zonedDateParts(period.start, TZ).hour, label).toBe(0);
          expect(zonedDateParts(period.previousStart, TZ).hour, label).toBe(0);
          if (key !== "month") {
            // Même heure d'horloge qu'avant, sauf l'heure sautée au passage à l'heure d'été.
            const hour = zonedDateParts(now, TZ).hour;
            const previousHour = zonedDateParts(period.previousEnd, TZ).hour;
            expect(previousHour === hour || (hour === 2 && previousHour === 3), label).toBe(true);
            expect(period.previousEnd.getUTCMinutes(), label).toBe(now.getUTCMinutes());
          }
        }
      }
    }
  });

  it("donne les mêmes bornes quel que soit le fuseau du serveur", () => {
    const compute = () =>
      JSON.stringify(
        (["today", "7d", "month"] as const).flatMap((key) => [
          resolve(key, "2026-03-30T08:00:00Z"),
          resolve(key, "2026-10-26T10:00:00Z"),
          resolve(key, "2026-10-05T22:30:00Z"),
        ]),
      );
    const reference = compute();
    const original = process.env.TZ;
    try {
      for (const serverZone of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
        process.env.TZ = serverZone;
        expect(compute()).toBe(reference);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("parsePeriodParams", () => {
  const NOW = at("2026-10-06T10:00:00Z");
  const parse = (params: Parameters<typeof parsePeriodParams>[0]) => parsePeriodParams(params, NOW, TZ);

  it("choisit 7 jours par défaut", () => {
    expect(parse({}).key).toBe("7d");
    expect(parse({ periode: undefined }).key).toBe("7d");
    expect(parse(undefined).key).toBe("7d");
    expect(parse(null).key).toBe("7d");
  });

  it.each([
    ["aujourdhui", "today"],
    ["7j", "7d"],
    ["mois", "month"],
  ])("lit ?periode=%s", (value, key) => {
    expect(parse({ periode: value }).key).toBe(key);
  });

  it("lit la période personnalisée avec ses dates", () => {
    const period = parse({ periode: "perso", du: "2026-09-01", au: "2026-09-15" });
    expect(period).toMatchObject({ key: "custom", from: "2026-09-01", to: "2026-09-15", dayCount: 15 });
  });

  it("prend le premier élément d'un paramètre répété", () => {
    expect(parse({ periode: ["mois", "aujourdhui"] }).key).toBe("month");
    expect(parse({ periode: [] }).key).toBe("7d");
    const period = parse({ periode: ["perso", "mois"], du: ["2026-09-01", "2026-01-01"], au: ["2026-09-15"] });
    expect(period).toMatchObject({ key: "custom", from: "2026-09-01", to: "2026-09-15" });
  });

  it("retombe sur 7 jours pour une période personnalisée sans dates, impossible, trop longue ou à venir", () => {
    expect(parse({ periode: "perso" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "2026-09-01" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "2026-02-31", au: "2026-03-05" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "2024-01-01", au: "2026-10-06" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "2026-10-01", au: "2026-12-31" }).key).toBe("7d");
  });

  it("retombe sur 7 jours quand `du` est avant l'an 2000 (0001-01-01, 0001-01-02, 1999-12-31), et accepte 2000-01-01", () => {
    expect(parse({ periode: "perso", du: "0001-01-01", au: "0001-01-02" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "0001-01-01", au: "0001-01-01" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "0001-01-02", au: "0001-01-02" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "1999-12-31", au: "1999-12-31" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "1999-12-31", au: "2000-01-02" }).key).toBe("7d");
    expect(parse({ periode: "perso", du: "2000-01-01", au: "2000-01-02" })).toMatchObject({ key: "custom", from: "2000-01-01", to: "2000-01-02" });
    // Le repli est une vraie période de 7 jours : aucune borne en l'an 0.
    const fallback = parse({ periode: "perso", du: "0001-01-01", au: "0001-01-02" });
    expect(fallback.previousStart.getUTCFullYear()).toBe(2026);
  });

  it("remet `du` et `au` dans l'ordre", () => {
    const period = parse({ periode: "perso", du: "2026-09-15", au: "2026-09-01" });
    expect(period).toMatchObject({ key: "custom", from: "2026-09-01", to: "2026-09-15" });
  });

  it("ignore les dates quand la période n'est pas personnalisée", () => {
    const period = parse({ periode: "7j", du: "2026-09-01", au: "2026-09-15" });
    expect(period.key).toBe("7d");
    expect(period.from).toBeUndefined();
  });

  it.each([
    "semaine",
    "",
    " 7j",
    "7J",
    "MOIS",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "7j; DROP TABLE conseils",
    "<script>alert(1)</script>",
    "%00",
    "a".repeat(10_000),
  ])("répond 7 jours à une valeur inconnue : %j", (value) => {
    expect(parse({ periode: value }).key).toBe("7d");
  });

  it("ne lève jamais d'exception, même avec des valeurs qui ne sont pas des textes", () => {
    const hostile = [
      { periode: 42 },
      { periode: { toString: () => "mois" } },
      { periode: [undefined] },
      { periode: [["mois"]] },
      { periode: "perso", du: 20260901, au: ["2026-09-15"] },
      { periode: "perso", du: null, au: {} },
    ] as unknown as Parameters<typeof parsePeriodParams>[0][];
    for (const params of hostile) {
      expect(() => parse(params)).not.toThrow();
      expect(parse(params).key).toBe("7d");
    }
  });
});

describe("periodToSearchParams", () => {
  it("ne met les dates que pour la période personnalisée", () => {
    const now = at("2026-10-06T10:00:00Z");
    expect(periodToSearchParams(resolve("today", "2026-10-06T10:00:00Z"))).toEqual({ periode: "aujourdhui" });
    expect(periodToSearchParams(resolve("7d", "2026-10-06T10:00:00Z"))).toEqual({ periode: "7j" });
    expect(periodToSearchParams(resolve("month", "2026-10-06T10:00:00Z"))).toEqual({ periode: "mois" });
    const custom = parsePeriodParams({ periode: "perso", du: "2026-09-01", au: "2026-09-15" }, now, TZ);
    expect(periodToSearchParams(custom)).toEqual({ periode: "perso", du: "2026-09-01", au: "2026-09-15" });
  });

  it("reconstruit exactement la même période (aller-retour)", () => {
    const now = at("2026-10-06T10:00:00Z");
    const periods = [
      resolve("today", "2026-10-06T10:00:00Z"),
      resolve("7d", "2026-10-06T10:00:00Z"),
      resolve("month", "2026-10-06T10:00:00Z"),
      resolve("custom", "2026-10-06T10:00:00Z", { from: "2026-09-15", to: "2026-09-01" }),
    ];
    for (const period of periods) {
      expect(parsePeriodParams(periodToSearchParams(period), now, TZ)).toEqual(period);
    }
  });
});

describe("constantes", () => {
  it("lit le rythme sur 90 jours", () => {
    expect(RHYTHM_WINDOW_DAYS).toBe(90);
  });

  it("propose les quatre choix, dans l'ordre, avec une valeur d'adresse distincte", () => {
    expect(PERIOD_OPTIONS.map((option) => option.key)).toEqual(["today", "7d", "month", "custom"]);
    expect(PERIOD_OPTIONS.map((option) => option.label)).toEqual(["Aujourd'hui", "7 derniers jours", "Ce mois-ci", "Personnalisée"]);
    expect(PERIOD_OPTIONS.map((option) => option.value)).toEqual(["aujourdhui", "7j", "mois", "perso"]);
    for (const option of PERIOD_OPTIONS) expect(PERIOD_PARAM_VALUES[option.key]).toBe(option.value);
  });
});
