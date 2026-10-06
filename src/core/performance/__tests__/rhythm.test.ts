import { describe, expect, it } from "vitest";
import { RHYTHM_MIN_DECIDED_SLOT, RHYTHM_MIN_DECIDED_TOTAL } from "../definitions";
import { buildRhythm } from "../rhythm";
import type { AdviceRow, AdviceStatus } from "../types";

const TZ = "Europe/Paris";
const NOW = new Date("2026-10-06T12:00:00Z");
const HOUR = 3_600_000;

let seq = 0;
function advice(createdAt: Date, status: AdviceStatus = "ACCEPTED"): AdviceRow {
  seq += 1;
  return {
    id: `a${seq}`,
    createdAt,
    origin: "AI",
    status,
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    unitPriceCents: 0,
    prescriptionDeleted: false,
  };
}

/** Lundi 28 septembre 2026 + `weekday` jours, à `hour` h 15 heure de Paris (heure d'été, UTC+2). */
function paris(weekday: number, hour: number): Date {
  return new Date(Date.UTC(2026, 8, 28 + weekday, hour - 2, 15));
}

/** `accepted` conseils retenus et `declined` non retenus (retirés ou sans réponse), tous tranchés, dans un créneau. */
function slot(weekday: number, hour: number, accepted: number, declined: number): AdviceRow[] {
  const rows: AdviceRow[] = [];
  for (let i = 0; i < accepted; i += 1) rows.push(advice(paris(weekday, hour), "ACCEPTED"));
  for (let i = 0; i < declined; i += 1) rows.push(advice(paris(weekday, hour), i % 2 === 0 ? "REMOVED" : "IGNORED"));
  return rows;
}

function rhythm(rows: AdviceRow[]) {
  return buildRhythm({ rhythmAdvice: rows, timeZone: TZ, now: NOW });
}

function cell(stats: ReturnType<typeof rhythm>, weekday: number, hour: number) {
  const found = stats.cells.find((c) => c.weekday === weekday && c.hour === hour);
  if (!found) throw new Error(`cellule ${weekday}/${hour} absente`);
  return found;
}

describe("buildRhythm : cellules", () => {
  it("sans conseil : 7 × 24 cellules à zéro, pas assez de données, aucun meilleur créneau", () => {
    const stats = rhythm([]);
    expect(stats.windowDays).toBe(90);
    expect(stats.cells).toHaveLength(168);
    expect(stats.cells.every((c) => c.proposed === 0 && c.accepted === 0 && c.decided === 0)).toBe(true);
    expect(stats.enoughData).toBe(false);
    expect(stats.bestWeekday).toBeNull();
    expect(stats.bestWindow).toBeNull();
  });

  it("ordonne les cellules par jour (lundi = 0) puis par heure, chacune une seule fois", () => {
    const stats = rhythm([]);
    expect(stats.cells.map((c) => [c.weekday, c.hour]).slice(0, 3)).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(stats.cells[24]).toMatchObject({ weekday: 1, hour: 0 });
    expect(stats.cells[167]).toMatchObject({ weekday: 6, hour: 23 });
    expect(new Set(stats.cells.map((c) => `${c.weekday}/${c.hour}`)).size).toBe(168);
  });

  it("lit le jour et l'heure à Paris, pas en UTC : lundi 0 h 30 à Paris est encore dimanche en UTC", () => {
    const stats = rhythm([
      advice(new Date("2026-10-04T22:30:00Z")), // lundi 5 octobre 00:30 à Paris
      advice(new Date("2026-10-04T21:30:00Z")), // dimanche 4 octobre 23:30 à Paris
      advice(new Date("2026-10-05T07:00:00Z"), "REMOVED"), // lundi 09:00
    ]);
    expect(cell(stats, 0, 0)).toMatchObject({ proposed: 1, accepted: 1, decided: 1 });
    expect(cell(stats, 6, 23)).toMatchObject({ proposed: 1, accepted: 1, decided: 1 });
    expect(cell(stats, 0, 9)).toMatchObject({ proposed: 1, accepted: 0, decided: 1 });
  });

  it("lundi est le jour 0 et dimanche le jour 6", () => {
    const stats = rhythm(Array.from({ length: 7 }, (_, weekday) => advice(paris(weekday, 10))));
    for (let weekday = 0; weekday < 7; weekday += 1) expect(cell(stats, weekday, 10).proposed).toBe(1);
    expect(stats.cells.reduce((sum, c) => sum + c.proposed, 0)).toBe(7);
  });

  it("la nuit du passage à l'heure d'hiver, les deux « 2 h 30 » tombent dans la même cellule", () => {
    const stats = rhythm([
      advice(new Date("2026-10-25T00:30:00Z")), // 2 h 30 à l'heure d'été
      advice(new Date("2026-10-25T01:30:00Z")), // 2 h 30 à l'heure d'hiver
    ]);
    expect(cell(stats, 6, 2)).toMatchObject({ proposed: 2, accepted: 2 });
  });

  it("compte un conseil en attente (PROPOSED, moins de 24 h) comme proposé mais pas comme tranché", () => {
    const stats = rhythm([
      advice(new Date(NOW.getTime() - 23 * HOUR - 59 * 60_000), "PROPOSED"), // 23 h 59 : en attente
      advice(new Date(NOW.getTime() - 24 * HOUR), "PROPOSED"), // 24 h pile : sans réponse, donc tranché
      advice(new Date(NOW.getTime() - 25 * HOUR), "IGNORED"),
    ]);
    const proposed = stats.cells.reduce((sum, c) => sum + c.proposed, 0);
    const decided = stats.cells.reduce((sum, c) => sum + c.decided, 0);
    expect(proposed).toBe(3);
    expect(decided).toBe(2);
  });

  it("retient les six statuts « retenus » comme acceptés", () => {
    const statuses: AdviceStatus[] = ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED", "DECLINED", "REMOVED", "IGNORED"];
    const stats = rhythm(statuses.map((status) => advice(paris(2, 11), status)));
    expect(cell(stats, 2, 11)).toMatchObject({ proposed: 8, accepted: 6, decided: 8 });
  });
});

describe("buildRhythm : assez de données", () => {
  const mondayMix = (decided: number) => slot(0, 10, Math.floor(decided / 2), decided - Math.floor(decided / 2));

  it(`reste faux jusqu'à ${RHYTHM_MIN_DECIDED_TOTAL - 1} conseils tranchés, devient vrai à ${RHYTHM_MIN_DECIDED_TOTAL}`, () => {
    expect(rhythm(mondayMix(RHYTHM_MIN_DECIDED_TOTAL - 1)).enoughData).toBe(false);
    expect(rhythm(mondayMix(RHYTHM_MIN_DECIDED_TOTAL)).enoughData).toBe(true);
  });

  it("ne compte pas les conseils en attente dans les 30", () => {
    const pending = Array.from({ length: 5 }, () => advice(new Date(NOW.getTime() - HOUR), "PROPOSED"));
    expect(rhythm([...mondayMix(29), ...pending]).enoughData).toBe(false);
    expect(rhythm([...mondayMix(30), ...pending]).enoughData).toBe(true);
  });

  it("sous le seuil global, aucun meilleur jour ni meilleure fenêtre, même avec 8 conseils tranchés sur un jour", () => {
    const stats = rhythm(slot(1, 14, 8, 0));
    expect(stats.enoughData).toBe(false);
    expect(stats.bestWeekday).toBeNull();
    expect(stats.bestWindow).toBeNull();
  });
});

describe("buildRhythm : meilleur jour", () => {
  it("prend le taux le plus haut, avec libellé français et taux exact", () => {
    const stats = rhythm([...slot(0, 10, 5, 5), ...slot(1, 10, 8, 2), ...slot(2, 10, 6, 4)]);
    expect(stats.enoughData).toBe(true);
    expect(stats.bestWeekday).toEqual({ weekday: 1, label: "mardi", acceptanceRate: 0.8, decided: 10 });
  });

  it("à taux égal, prend le jour qui compte le plus de conseils tranchés", () => {
    const stats = rhythm([...slot(1, 10, 8, 2), ...slot(3, 10, 16, 4), ...slot(5, 10, 1, 9)]);
    expect(stats.bestWeekday).toMatchObject({ weekday: 3, label: "jeudi", decided: 20, acceptanceRate: 0.8 });
  });

  it("à taux et volume égaux, prend le plus tôt dans la semaine", () => {
    const stats = rhythm([...slot(4, 10, 8, 2), ...slot(2, 10, 8, 2), ...slot(6, 10, 8, 2)]);
    expect(stats.bestWeekday).toMatchObject({ weekday: 2, label: "mercredi" });
  });

  it("traite comme égaux deux taux écrits sur des volumes différents (6/9 et 14/21) : le plus fourni gagne", () => {
    const stats = rhythm([
      ...slot(1, 9, 2, 1),
      ...slot(1, 11, 4, 2), // mardi : 9 tranchés, 6 retenus
      ...slot(3, 10, 4, 2),
      ...slot(3, 12, 6, 3),
      ...slot(3, 16, 4, 2), // jeudi : 21 tranchés, 14 retenus
    ]);
    expect(stats.bestWeekday).toMatchObject({ weekday: 3, decided: 21 });
    expect(stats.bestWeekday?.acceptanceRate).toBeCloseTo(2 / 3, 12);
  });

  it(`ignore un jour sous ${RHYTHM_MIN_DECIDED_SLOT} conseils tranchés, même à 100 %`, () => {
    const stats = rhythm([...slot(4, 10, RHYTHM_MIN_DECIDED_SLOT - 1, 0), ...slot(1, 10, 5, 5), ...slot(2, 10, 3, 7), ...slot(5, 10, 4, 6)]);
    expect(stats.bestWeekday).toMatchObject({ weekday: 1, acceptanceRate: 0.5 });
  });

  it(`prend un jour qui atteint exactement ${RHYTHM_MIN_DECIDED_SLOT} conseils tranchés`, () => {
    const stats = rhythm([...slot(4, 10, RHYTHM_MIN_DECIDED_SLOT, 0), ...slot(1, 10, 5, 17)]);
    expect(stats.bestWeekday).toMatchObject({ weekday: 4, acceptanceRate: 1, decided: RHYTHM_MIN_DECIDED_SLOT });
  });

  it("est null quand aucun jour n'atteint le seuil, alors que le total suffit", () => {
    // 35 conseils tranchés, 5 par jour : assez au total, trop peu par jour.
    const rows = Array.from({ length: 7 }, (_, weekday) => slot(weekday, 8 + weekday, 3, 2)).flat();
    const stats = rhythm(rows);
    expect(stats.enoughData).toBe(true);
    expect(stats.bestWeekday).toBeNull();
  });
});

describe("buildRhythm : meilleure fenêtre de 2 h", () => {
  it("prend la fenêtre de 2 heures, tous jours confondus", () => {
    const stats = rhythm([
      ...slot(0, 9, 5, 5),
      ...slot(2, 10, 5, 5),
      ...slot(0, 14, 9, 1), // lundi 14 h
      ...slot(2, 15, 9, 1), // mercredi 15 h
    ]);
    expect(stats.bestWindow).toEqual({ fromHour: 14, toHour: 16, acceptanceRate: 0.9, decided: 20 });
  });

  it("à taux égal, prend la fenêtre qui compte le plus de conseils tranchés, pas celle d'une seule heure", () => {
    const stats = rhythm([...slot(1, 14, 9, 1), ...slot(1, 15, 9, 1), ...slot(1, 9, 5, 5), ...slot(1, 10, 5, 5)]);
    // [13, 15) et [15, 17) valent aussi 90 % mais sur 10 conseils seulement.
    expect(stats.bestWindow).toMatchObject({ fromHour: 14, toHour: 16, decided: 20 });
  });

  it("à taux et volume égaux, prend la plus tôt dans la journée", () => {
    const stats = rhythm([...slot(0, 17, 5, 5), ...slot(0, 18, 5, 5), ...slot(0, 8, 5, 5), ...slot(0, 9, 5, 5)]);
    expect(stats.bestWindow).toMatchObject({ fromHour: 8, toHour: 10, acceptanceRate: 0.5, decided: 20 });
  });

  it(`ignore une fenêtre sous ${RHYTHM_MIN_DECIDED_SLOT} conseils tranchés, même à 100 %`, () => {
    const stats = rhythm([...slot(0, 20, RHYTHM_MIN_DECIDED_SLOT - 1, 0), ...slot(0, 9, 5, 5), ...slot(1, 9, 5, 5), ...slot(2, 9, 5, 5)]);
    expect(stats.bestWindow).toMatchObject({ acceptanceRate: 0.5 });
    expect(stats.bestWindow?.fromHour).toBeLessThanOrEqual(9);
    expect(stats.bestWindow?.toHour).toBeGreaterThanOrEqual(9);
  });

  it(`prend une fenêtre qui atteint exactement ${RHYTHM_MIN_DECIDED_SLOT} conseils tranchés`, () => {
    const stats = rhythm([...slot(2, 16, RHYTHM_MIN_DECIDED_SLOT, 0), ...slot(0, 9, 5, 17)]);
    expect(stats.bestWindow).toMatchObject({ fromHour: 15, toHour: 17, acceptanceRate: 1, decided: RHYTHM_MIN_DECIDED_SLOT });
  });

  it("peut commencer à minuit : la première fenêtre est 0 h – 2 h", () => {
    const stats = rhythm([...slot(0, 0, 10, 0), ...slot(1, 12, 5, 15)]);
    expect(stats.bestWindow).toEqual({ fromHour: 0, toHour: 2, acceptanceRate: 1, decided: 10 });
  });

  it("ne franchit pas minuit : la dernière fenêtre est 22 h – 24 h", () => {
    const stats = rhythm([...slot(0, 23, 10, 0), ...slot(1, 12, 5, 15)]);
    expect(stats.bestWindow).toEqual({ fromHour: 22, toHour: 24, acceptanceRate: 1, decided: 10 });
  });

  it("est null quand aucune fenêtre n'atteint le seuil, alors que le total suffit", () => {
    // 32 conseils tranchés, 4 par heure sur 8 heures espacées de 3 h : jamais plus de 4 dans 2 h consécutives.
    const rows = [0, 3, 6, 9, 12, 15, 18, 21].flatMap((hour, i) => slot(i % 7, hour, 2, 2));
    const stats = rhythm(rows);
    expect(stats.enoughData).toBe(true);
    expect(stats.bestWindow).toBeNull();
  });
});
