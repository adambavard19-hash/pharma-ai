import { describe, expect, it } from "vitest";
import { resolvePerformancePeriod, zonedDateParts } from "../periods";
import { buildSeries } from "../series";
import type { AdviceRow, AdviceStatus, ConfirmedLineRow, PerformancePeriod } from "../types";

const TZ = "Europe/Paris";

let seq = 0;
function advice(createdAt: string, status: AdviceStatus = "ACCEPTED", overrides: Partial<AdviceRow> = {}): AdviceRow {
  seq += 1;
  return {
    id: `a${seq}`,
    createdAt: new Date(createdAt),
    origin: "AI",
    status,
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    unitPriceCents: 0,
    prescriptionDeleted: false,
    ...overrides,
  };
}

function line(saleAt: string, overrides: Partial<ConfirmedLineRow> = {}): ConfirmedLineRow {
  seq += 1;
  return {
    saleId: `s${seq}`,
    saleCreatedAt: new Date(saleAt),
    lineId: `l${seq}`,
    recommendationId: `r${seq}`,
    origin: "AI",
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    quantity: 1,
    unitPriceCents: 1000,
    totalCents: 1000,
    vatRate: 20,
    ...overrides,
  };
}

/** Une période écrite à la main : le test ne dépend pas du calcul des périodes (testé ailleurs). */
function period(bounds: {
  granularity: PerformancePeriod["granularity"];
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}): PerformancePeriod {
  return {
    key: "custom",
    label: "test",
    start: new Date(bounds.start),
    end: new Date(bounds.end),
    previousStart: new Date(bounds.previousStart),
    previousEnd: new Date(bounds.previousEnd),
    granularity: bounds.granularity,
    dayCount: 1,
    inProgress: false,
  };
}

function run(p: PerformancePeriod, now: string, rows: Partial<Parameters<typeof buildSeries>[0]> = {}) {
  return buildSeries({
    period: p,
    timeZone: TZ,
    now: new Date(now),
    advice: [],
    previousAdvice: [],
    lines: [],
    previousLines: [],
    ...rows,
  });
}

// Mardi 6 octobre 2026, 14 h 30 à Paris (heure d'été, UTC+2).
const TODAY = period({
  granularity: "hour",
  start: "2026-10-05T22:00:00Z",
  end: "2026-10-06T12:30:00Z",
  previousStart: "2026-10-04T22:00:00Z",
  previousEnd: "2026-10-05T12:30:00Z",
});
const TODAY_NOW = "2026-10-06T12:30:00Z";

describe("séries par heure", () => {
  it("fait une tranche par heure, de minuit jusqu'à l'heure courante, sans tranche future", () => {
    const { current } = run(TODAY, TODAY_NOW);
    expect(current).toHaveLength(15);
    expect(current[0].label).toBe("0 h");
    expect(current[0].startsAt.toISOString()).toBe("2026-10-05T22:00:00.000Z");
    expect(current[14].label).toBe("14 h");
    expect(current[14].startsAt.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(current.map((bucket) => bucket.index)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });

  it("une tranche sans donnée est faite de zéros et d'un taux null", () => {
    const { current } = run(TODAY, TODAY_NOW);
    for (const bucket of current) {
      expect(bucket.proposed).toBe(0);
      expect(bucket.accepted).toBe(0);
      expect(bucket.purchased).toBe(0);
      expect(bucket.revenueTtcCents).toBe(0);
      expect(bucket.acceptanceRate).toBeNull();
    }
  });

  it("range chaque conseil dans l'heure de Paris (pas celle de l'UTC) et ignore ce qui sort de la fenêtre", () => {
    const rows = [
      advice("2026-10-06T07:15:00Z", "ACCEPTED"), // 9 h 15 à Paris
      advice("2026-10-06T07:45:00Z", "REMOVED"),
      advice("2026-10-06T07:50:00Z", "IGNORED"),
      advice("2026-10-05T22:30:00Z", "ACCEPTED"), // 0 h 30 à Paris, veille en UTC
      advice("2026-10-05T21:59:00Z", "ACCEPTED"), // avant minuit à Paris : hors fenêtre
      advice("2026-10-06T12:45:00Z", "ACCEPTED"), // après maintenant : hors fenêtre
    ];
    const { current } = run(TODAY, TODAY_NOW, { advice: rows });
    expect(current[9]).toMatchObject({ label: "9 h", proposed: 3, accepted: 1 });
    expect(current[9].acceptanceRate).toBeCloseTo(1 / 3, 12);
    expect(current[0]).toMatchObject({ proposed: 1, accepted: 1, acceptanceRate: null });
    expect(current.reduce((sum, bucket) => sum + bucket.proposed, 0)).toBe(4);
  });

  it("aligne la veille par index : même heure, même nombre de tranches", () => {
    const { current, previous } = run(TODAY, TODAY_NOW, {
      previousAdvice: [
        advice("2026-10-05T08:00:00Z", "ACCEPTED"), // 10 h hier
        advice("2026-10-05T12:29:00Z", "ACCEPTED"), // 14 h 29 hier : juste avant la fin de la comparaison
        advice("2026-10-05T12:45:00Z", "ACCEPTED"), // 14 h 45 hier : après la fin de la comparaison, ignoré
      ],
    });
    expect(previous).toHaveLength(current.length);
    expect(previous[10]).toMatchObject({ index: 10, label: "10 h", proposed: 1, accepted: 1 });
    expect(previous[10].startsAt.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(previous[14]).toMatchObject({ label: "14 h", proposed: 1 });
    expect(previous.reduce((sum, bucket) => sum + bucket.proposed, 0)).toBe(2);
  });

  it("compte en vente les conseils distincts vendus à l'heure de la vente, au prix connu seulement", () => {
    const rows = [
      line("2026-10-06T07:10:00Z", { recommendationId: "r-a", totalCents: 1250, unitPriceCents: 1250 }),
      line("2026-10-06T07:20:00Z", { recommendationId: "r-b", totalCents: 800, unitPriceCents: 400, quantity: 2 }),
      line("2026-10-06T07:30:00Z", { recommendationId: "r-c", totalCents: 0, unitPriceCents: 0 }), // sans prix
      line("2026-10-06T07:40:00Z", { recommendationId: "r-a", totalCents: 500, unitPriceCents: 500 }), // même conseil
    ];
    const { current } = run(TODAY, TODAY_NOW, { lines: rows });
    expect(current[9].purchased).toBe(2);
    expect(current[9].revenueTtcCents).toBe(1250 + 800 + 500);
    expect(current.reduce((sum, bucket) => sum + bucket.revenueTtcCents, 0)).toBe(2550);
  });

  it("deux horloges : le conseil est daté de sa proposition, la vente de la vente", () => {
    const { current } = run(TODAY, TODAY_NOW, {
      advice: [advice("2026-10-06T05:00:00Z", "PURCHASED")], // proposé à 7 h
      lines: [line("2026-10-06T10:00:00Z", { totalCents: 4200, unitPriceCents: 4200 })], // vendu à 12 h
    });
    expect(current[7]).toMatchObject({ proposed: 1, accepted: 1, purchased: 0, revenueTtcCents: 0 });
    expect(current[12]).toMatchObject({ proposed: 0, accepted: 0, purchased: 1, revenueTtcCents: 4200 });
  });
});

describe("taux d'acceptation d'une tranche", () => {
  it("reste null sous 3 conseils tranchés, puis vaut acceptés ÷ tranchés", () => {
    const two = run(TODAY, TODAY_NOW, { advice: [advice("2026-10-06T07:00:00Z", "ACCEPTED"), advice("2026-10-06T07:05:00Z", "ACCEPTED")] });
    expect(two.current[9].acceptanceRate).toBeNull();

    const three = run(TODAY, TODAY_NOW, {
      advice: [advice("2026-10-06T07:00:00Z", "ACCEPTED"), advice("2026-10-06T07:05:00Z", "ACCEPTED"), advice("2026-10-06T07:10:00Z", "REMOVED")],
    });
    expect(three.current[9].acceptanceRate).toBeCloseTo(2 / 3, 12);
  });

  it("n'est jamais supérieur à 100 % et vaut 0 quand rien n'est retenu", () => {
    const all = run(TODAY, TODAY_NOW, { advice: ["07:00", "07:05", "07:10"].map((t) => advice(`2026-10-06T${t}:00Z`, "PURCHASED")) });
    expect(all.current[9].acceptanceRate).toBe(1);
    const none = run(TODAY, TODAY_NOW, { advice: ["07:00", "07:05", "07:10"].map((t) => advice(`2026-10-06T${t}:00Z`, "IGNORED")) });
    expect(none.current[9].acceptanceRate).toBe(0);
  });

  it("sort les conseils en attente (moins de 24 h) du dénominateur, à 24 h pile ils sont sans réponse", () => {
    const day = period({
      granularity: "day",
      start: "2026-10-04T22:00:00Z",
      end: "2026-10-06T12:30:00Z",
      previousStart: "2026-10-02T22:00:00Z",
      previousEnd: "2026-10-04T22:00:00Z",
    });
    const rows = [
      advice("2026-10-05T10:00:00Z", "ACCEPTED"),
      advice("2026-10-05T10:05:00Z", "REMOVED"),
      advice("2026-10-05T12:30:00Z", "PROPOSED"), // 24 h pile avant maintenant : sans réponse
      advice("2026-10-05T12:31:00Z", "PROPOSED"), // 23 h 59 : en attente
    ];
    const { current } = run(day, TODAY_NOW, { advice: rows });
    expect(current[0]).toMatchObject({ label: "5 oct.", proposed: 4, accepted: 1 });
    expect(current[0].acceptanceRate).toBeCloseTo(1 / 3, 12);
  });

  it("ne met rien en attente dans la période précédente, entièrement passée", () => {
    // 29 mars 2026 : jour de 23 h. Hier 23 h 30 est à 23 h 15 de maintenant, moins de 24 h.
    const spring = period({
      granularity: "hour",
      start: "2026-03-28T23:00:00Z",
      end: "2026-03-29T21:30:00Z",
      previousStart: "2026-03-27T23:00:00Z",
      previousEnd: "2026-03-28T22:30:00Z",
    });
    const recent = ["22:15", "22:16", "22:17"];
    const { current, previous } = run(spring, "2026-03-29T21:30:00Z", {
      advice: ["00:15", "00:16", "00:17"].map((t) => advice(`2026-03-29T${t}:00Z`, "PROPOSED")),
      previousAdvice: recent.map((t) => advice(`2026-03-28T${t}:00Z`, "PROPOSED")),
    });
    // Aujourd'hui : trois PROPOSED récents sont en attente, aucun n'est tranché.
    expect(current[1]).toMatchObject({ proposed: 3, acceptanceRate: null });
    // Hier : les mêmes sont sans réponse, donc tranchés (taux 0 %, pas « pas assez de données »).
    expect(previous[23]).toMatchObject({ proposed: 3, accepted: 0, acceptanceRate: 0 });
  });
});

describe("passage à l'heure d'été et d'hiver", () => {
  it("dimanche 25 octobre 2026 (jour de 25 h) : 25 tranches, la 2 h répétée se lit « 2 h bis »", () => {
    const fall = period({
      granularity: "hour",
      start: "2026-10-24T22:00:00Z",
      end: "2026-10-25T22:30:00Z",
      previousStart: "2026-10-23T22:00:00Z",
      previousEnd: "2026-10-24T22:30:00Z",
    });
    const { current } = run(fall, "2026-10-25T22:30:00Z", {
      advice: [advice("2026-10-25T00:30:00Z", "ACCEPTED"), advice("2026-10-25T01:30:00Z", "REMOVED")],
    });
    expect(current).toHaveLength(25);
    expect(current.map((bucket) => bucket.label).slice(0, 6)).toEqual(["0 h", "1 h", "2 h", "2 h bis", "3 h", "4 h"]);
    expect(current[24].label).toBe("23 h");
    for (let i = 1; i < current.length; i += 1) {
      expect(current[i].startsAt.getTime() - current[i - 1].startsAt.getTime()).toBe(3_600_000);
    }
    // 2 h 30 à l'heure d'été, puis 2 h 30 à l'heure d'hiver : deux tranches distinctes.
    expect(current[2]).toMatchObject({ label: "2 h", proposed: 1, accepted: 1 });
    expect(current[3]).toMatchObject({ label: "2 h bis", proposed: 1, accepted: 0 });
  });

  it("dimanche 29 mars 2026 (jour de 23 h) : 23 tranches, il n'y a pas de 2 h", () => {
    const spring = period({
      granularity: "hour",
      start: "2026-03-28T23:00:00Z",
      end: "2026-03-29T21:30:00Z",
      previousStart: "2026-03-27T23:00:00Z",
      previousEnd: "2026-03-28T22:30:00Z",
    });
    const { current, previous } = run(spring, "2026-03-29T21:30:00Z", {
      advice: [advice("2026-03-29T01:10:00Z", "ACCEPTED")], // 3 h 10 à Paris
    });
    const labels = current.map((bucket) => bucket.label);
    expect(labels).toHaveLength(23);
    expect(labels.slice(0, 4)).toEqual(["0 h", "1 h", "3 h", "4 h"]);
    expect(labels).not.toContain("2 h");
    expect(labels[22]).toBe("23 h");
    expect(current[2]).toMatchObject({ label: "3 h", proposed: 1, accepted: 1 });
    // La veille, jour ordinaire de 24 h, jusqu'à la même heure : 24 tranches. L'alignement par index est celui des heures écoulées.
    expect(previous).toHaveLength(24);
  });

  it("par jour : le jour du passage à l'heure d'hiver dure 25 h et garde ses événements de 23 h 30 et 0 h 30", () => {
    const week = period({
      granularity: "day",
      start: "2026-10-21T22:00:00Z", // 22 octobre 00:00 à Paris
      end: "2026-10-28T23:00:00Z", // 29 octobre 00:00 à Paris
      previousStart: "2026-10-14T22:00:00Z",
      previousEnd: "2026-10-21T22:00:00Z",
    });
    const { current, previous } = run(week, "2026-11-02T10:00:00Z", {
      advice: [
        advice("2026-10-24T23:30:00Z", "ACCEPTED"), // 25 octobre 01:30 (heure d'été)
        advice("2026-10-25T22:30:00Z", "ACCEPTED"), // 25 octobre 23:30 (heure d'hiver)
        advice("2026-10-25T23:30:00Z", "REMOVED"), // 26 octobre 00:30
      ],
    });
    expect(current.map((bucket) => bucket.label)).toEqual(["22 oct.", "23 oct.", "24 oct.", "25 oct.", "26 oct.", "27 oct.", "28 oct."]);
    expect(current.map((bucket) => bucket.startsAt.toISOString())).toEqual([
      "2026-10-21T22:00:00.000Z",
      "2026-10-22T22:00:00.000Z",
      "2026-10-23T22:00:00.000Z",
      "2026-10-24T22:00:00.000Z",
      "2026-10-25T23:00:00.000Z", // 23 h après : le lendemain commence à l'heure d'hiver
      "2026-10-26T23:00:00.000Z",
      "2026-10-27T23:00:00.000Z",
    ]);
    expect(current[3]).toMatchObject({ label: "25 oct.", proposed: 2, accepted: 2 });
    expect(current[4]).toMatchObject({ label: "26 oct.", proposed: 1, accepted: 0 });
    expect(previous.map((bucket) => bucket.label)).toEqual(["15 oct.", "16 oct.", "17 oct.", "18 oct.", "19 oct.", "20 oct.", "21 oct."]);
  });
});

describe("séries par jour", () => {
  it("ne crée aucune tranche future quand la période finit demain", () => {
    const toTomorrow = period({
      granularity: "day",
      start: "2026-10-04T22:00:00Z", // 5 octobre
      end: "2026-10-07T22:00:00Z", // fin du 7 octobre
      previousStart: "2026-10-01T22:00:00Z",
      previousEnd: "2026-10-04T22:00:00Z",
    });
    const { current, previous } = run(toTomorrow, TODAY_NOW, {
      advice: [advice("2026-10-06T08:00:00Z"), advice("2026-10-06T13:00:00Z") /* futur */],
    });
    expect(current.map((bucket) => bucket.label)).toEqual(["5 oct.", "6 oct."]);
    expect(current[1].proposed).toBe(1);
    expect(previous.map((bucket) => bucket.label)).toEqual(["2 oct.", "3 oct.", "4 oct."]);
  });

  it("date la vente le jour de Paris : une vente à 23 h 30 en UTC le 5 est du 6 à Paris", () => {
    const week = period({
      granularity: "day",
      start: "2026-10-04T22:00:00Z",
      end: "2026-10-06T12:30:00Z",
      previousStart: "2026-10-02T22:00:00Z",
      previousEnd: "2026-10-04T22:00:00Z",
    });
    const { current } = run(week, TODAY_NOW, {
      lines: [
        line("2026-10-05T21:30:00Z", { totalCents: 1000 }), // 23 h 30 le 5 à Paris
        line("2026-10-05T22:30:00Z", { totalCents: 2000 }), // 0 h 30 le 6 à Paris
      ],
    });
    expect(current[0]).toMatchObject({ label: "5 oct.", revenueTtcCents: 1000, purchased: 1 });
    expect(current[1]).toMatchObject({ label: "6 oct.", revenueTtcCents: 2000, purchased: 1 });
  });

  it("le mois du 31 octobre compte 31 tranches, le mois précédent 30 : la précédente est plus courte", () => {
    const month = period({
      granularity: "day",
      start: "2026-09-30T22:00:00Z", // 1er octobre 00:00 (heure d'été)
      end: "2026-10-31T09:00:00Z",
      previousStart: "2026-08-31T22:00:00Z", // 1er septembre
      previousEnd: "2026-09-30T22:00:00Z", // borné à la fin de septembre
    });
    const { current, previous } = run(month, "2026-10-31T09:00:00Z", {
      previousAdvice: [advice("2026-09-30T10:00:00Z", "ACCEPTED")], // 30 septembre
    });
    expect(current).toHaveLength(31);
    expect(previous).toHaveLength(30);
    expect(current[30].label).toBe("31 oct.");
    expect(previous[29]).toMatchObject({ label: "30 sept.", proposed: 1, accepted: 1 });
    // Aligné par index : le jour n de ce mois fait face au jour n du mois d'avant.
    expect(current[0].label).toBe("1 oct.");
    expect(previous[0].label).toBe("1 sept.");
  });
});

describe("séries par semaine", () => {
  const quarter = period({
    granularity: "week",
    start: "2026-06-30T22:00:00Z", // mercredi 1er juillet 00:00
    end: "2026-09-30T22:00:00Z", // fin du 30 septembre
    previousStart: "2026-03-30T22:00:00Z",
    previousEnd: "2026-06-30T22:00:00Z",
  });

  it("démarre chaque tranche un lundi, la première semaine commençant avant la période", () => {
    const { current } = run(quarter, "2026-10-06T10:00:00Z");
    expect(current).toHaveLength(14);
    expect(current[0].label).toBe("sem. du 29 juin");
    expect(current[0].startsAt.toISOString()).toBe("2026-06-28T22:00:00.000Z");
    expect(current[1].label).toBe("sem. du 6 juil.");
    expect(current[13].label).toBe("sem. du 28 sept.");
    for (const bucket of current) {
      const parts = zonedDateParts(bucket.startsAt, TZ);
      expect([parts.weekday, parts.hour]).toEqual([0, 0]); // lundi, minuit à Paris
    }
  });

  it("range par semaine de Paris : dimanche 23 h est dans la semaine qui finit, lundi 0 h 30 dans la suivante", () => {
    const { current } = run(quarter, "2026-10-06T10:00:00Z", {
      advice: [
        advice("2026-06-30T10:00:00Z", "ACCEPTED"), // mardi 30 juin : même semaine, mais avant le début de la période
        advice("2026-07-01T12:00:00Z", "ACCEPTED"), // mercredi 1er juillet
        advice("2026-07-05T21:00:00Z", "ACCEPTED"), // dimanche 5 juillet 23 h à Paris
        advice("2026-07-05T22:30:00Z", "REMOVED"), // lundi 6 juillet 0 h 30 à Paris (dimanche en UTC)
        advice("2026-09-30T20:00:00Z", "ACCEPTED"), // mercredi 30 septembre
      ],
      lines: [line("2026-07-08T10:00:00Z", { totalCents: 3300 })],
    });
    expect(current[0]).toMatchObject({ proposed: 2, accepted: 2 });
    expect(current[1]).toMatchObject({ proposed: 1, accepted: 0, revenueTtcCents: 3300, purchased: 1 });
    expect(current[13]).toMatchObject({ proposed: 1, accepted: 1 });
  });

  it("traverse le changement d'heure : les lundis restent des lundis à minuit de Paris", () => {
    const autumn = period({
      granularity: "week",
      start: "2026-10-18T22:00:00Z", // lundi 19 octobre 00:00 (heure d'été)
      end: "2026-11-08T23:00:00Z",
      previousStart: "2026-09-27T22:00:00Z",
      previousEnd: "2026-10-18T22:00:00Z",
    });
    const { current, previous } = run(autumn, "2026-11-20T10:00:00Z");
    expect(current.map((bucket) => bucket.startsAt.toISOString())).toEqual([
      "2026-10-18T22:00:00.000Z", // lundi 19, +02:00
      "2026-10-25T23:00:00.000Z", // lundi 26, +01:00 : la semaine a duré 169 h
      "2026-11-01T23:00:00.000Z", // lundi 2 novembre
    ]);
    expect(previous.map((bucket) => bucket.label)).toEqual(["sem. du 28 sept.", "sem. du 5 oct.", "sem. du 12 oct."]);
  });
});

describe("avec les vraies périodes du calcul", () => {
  it("7 derniers jours : 7 tranches par jour de Paris, comparées aux 7 d'avant", () => {
    const now = new Date("2026-10-06T12:30:00Z");
    const period7 = resolvePerformancePeriod({ key: "7d", now, timeZone: TZ });
    const { current, previous } = buildSeries({
      period: period7,
      timeZone: TZ,
      now,
      advice: [advice("2026-10-06T08:00:00Z", "ACCEPTED")],
      previousAdvice: [advice("2026-09-30T08:00:00Z", "ACCEPTED")],
      lines: [],
      previousLines: [],
    });
    expect(current.map((bucket) => bucket.label)).toEqual(["30 sept.", "1 oct.", "2 oct.", "3 oct.", "4 oct.", "5 oct.", "6 oct."]);
    expect(previous).toHaveLength(7);
    expect(current[6]).toMatchObject({ proposed: 1, accepted: 1 });
    expect(previous[1].label).toBe("24 sept.");
  });

  it("aujourd'hui : une tranche par heure jusqu'à 14 h, comme hier à la même heure", () => {
    const now = new Date("2026-10-06T12:30:00Z");
    const today = resolvePerformancePeriod({ key: "today", now, timeZone: TZ });
    const { current, previous } = buildSeries({ period: today, timeZone: TZ, now, advice: [], previousAdvice: [], lines: [], previousLines: [] });
    expect(current).toHaveLength(15);
    expect(previous).toHaveLength(15);
    expect(current[14].label).toBe("14 h");
  });

  it("une période sans aucune ligne donne des tranches de zéros, pas une série vide", () => {
    const now = new Date("2026-10-06T12:30:00Z");
    const month = resolvePerformancePeriod({ key: "month", now, timeZone: TZ });
    const { current } = buildSeries({ period: month, timeZone: TZ, now, advice: [], previousAdvice: [], lines: [], previousLines: [] });
    expect(current).toHaveLength(6);
    expect(current.every((bucket) => bucket.proposed === 0 && bucket.revenueTtcCents === 0 && bucket.acceptanceRate === null)).toBe(true);
  });
});
