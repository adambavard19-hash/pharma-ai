import { describe, expect, it } from "vitest";
import { computePerformance } from "../compute";
import type { AdviceRow, AdviceStatus, ConfirmedLineRow, PerformanceInput, PerformancePeriod } from "../types";

/** Les espaces insécables des formats français deviennent des espaces simples. */
const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

// Mardi 6 octobre 2026, 14 h à Paris. Fenêtre de 7 jours glissants, comparée aux 7 d'avant.
const NOW = new Date("2026-10-06T12:00:00Z");
const TZ = "Europe/Paris";

const PERIOD: PerformancePeriod = {
  key: "7d",
  label: "7 derniers jours",
  start: new Date("2026-09-29T12:00:00Z"),
  end: NOW,
  previousStart: new Date("2026-09-22T12:00:00Z"),
  previousEnd: new Date("2026-09-29T12:00:00Z"),
  granularity: "day",
  dayCount: 8,
  inProgress: true,
};

function advice(id: string, status: AdviceStatus, createdAt: string, seed: Partial<AdviceRow> = {}): AdviceRow {
  return {
    id,
    createdAt: new Date(createdAt),
    origin: "AI",
    status,
    productId: `prod-${id}`,
    presentationId: null,
    label: `Produit ${id}`,
    category: "DERMO",
    unitPriceCents: 1_500,
    prescriptionDeleted: false,
    ...seed,
  };
}

function line(id: string, saleId: string, saleCreatedAt: string, seed: Partial<ConfirmedLineRow> = {}): ConfirmedLineRow {
  return {
    saleId,
    saleCreatedAt: new Date(saleCreatedAt),
    lineId: `line-${id}`,
    recommendationId: `rec-${id}`,
    origin: "AI",
    productId: `prod-${id}`,
    presentationId: null,
    label: `Produit ${id}`,
    category: "DERMO",
    quantity: 1,
    unitPriceCents: 1_000,
    totalCents: 1_000,
    vatRate: 20,
    ...seed,
  };
}

/**
 * Une semaine qui contient un cas de chaque sorte (7 conseils comptés) :
 *  a1 accepté, a2 acheté, a3 retiré, a4 ignoré, a5 en attente (1 h), a6 sans réponse (> 24 h), a9 refusé par le patient ;
 *  a7 ajouté à la main et a8 d'une ordonnance supprimée : écartés et comptés à part.
 */
function week(): PerformanceInput {
  return {
    period: PERIOD,
    now: NOW,
    timeZone: TZ,
    advice: [
      advice("a1", "ACCEPTED", "2026-10-05T09:00:00Z"),
      advice("a2", "PURCHASED", "2026-10-05T10:00:00Z"),
      advice("a3", "REMOVED", "2026-10-04T09:00:00Z", { origin: "RULE" }),
      advice("a4", "IGNORED", "2026-10-03T09:00:00Z"),
      advice("a5", "PROPOSED", "2026-10-06T11:00:00Z"),
      advice("a6", "PROPOSED", "2026-10-02T09:00:00Z"),
      advice("a7", "ACCEPTED", "2026-10-05T09:30:00Z", { origin: "MANUAL" }),
      advice("a8", "ACCEPTED", "2026-10-05T09:45:00Z", { prescriptionDeleted: true }),
      advice("a9", "DECLINED", "2026-10-01T09:00:00Z"),
    ],
    previousAdvice: [
      advice("p1", "ACCEPTED", "2026-09-25T09:00:00Z"),
      advice("p2", "REMOVED", "2026-09-26T09:00:00Z"),
      advice("p3", "IGNORED", "2026-09-27T09:00:00Z", { origin: "RULE" }),
      advice("p4", "PURCHASED", "2026-09-28T09:00:00Z"),
    ],
    lines: [
      // Un ticket de deux lignes = une vente ; le conseil de L2 date d'avant la période (deux horloges).
      line("a2", "S1", "2026-10-05T10:30:00Z", { quantity: 2, unitPriceCents: 1_500, totalCents: 3_000 }),
      line("old1", "S1", "2026-10-05T10:30:00Z", { quantity: 1, unitPriceCents: 990, totalCents: 990 }),
      // Sans prix : une vente confirmée, jamais du chiffre d'affaires.
      line("old2", "S2", "2026-10-06T08:00:00Z", { unitPriceCents: 0, totalCents: 0 }),
      // Ajout manuel : n'est pas un conseil PharmaBoost.
      line("man", "S3", "2026-10-04T08:00:00Z", { origin: "MANUAL", unitPriceCents: 500, totalCents: 500 }),
    ],
    previousLines: [line("p4", "S0", "2026-09-28T10:00:00Z", { unitPriceCents: 2_000, totalCents: 2_000 })],
    rhythmAdvice: [],
  };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("computePerformance : l'assemblage", () => {
  const report = computePerformance(week());

  it("l'entonnoir compte 7 conseils et respecte l'identité proposés = acceptés + retirés + sans réponse + en attente", () => {
    const f = report.funnel;
    expect(f.proposed.value).toBe(7);
    expect(f.accepted.value).toBe(3);
    expect(f.removedByTeam).toBe(1);
    expect(f.unanswered).toBe(2);
    expect(f.pending).toBe(1);
    expect(f.accepted.value + f.removedByTeam + f.unanswered + f.pending).toBe(f.proposed.value);
    expect(f.purchased.value).toBe(1);
    expect(f.declinedByPatient).toBe(1);
    expect(f.acceptedNotConfirmed).toBe(1);
    expect(f.acceptanceRate.value).toBeCloseTo(3 / 6, 10);
  });

  it("la période précédente passe par la même logique", () => {
    expect(report.funnel.proposed.previous).toBe(4);
    expect(report.funnel.accepted.previous).toBe(2);
    expect(report.funnel.acceptanceRate.previous).toBeCloseTo(2 / 4, 10);
  });

  it("le chiffre d'affaires ne compte ni la ligne sans prix ni l'ajout manuel", () => {
    expect(report.revenue.confirmedTtcCents.value).toBe(3_990);
    expect(report.revenue.confirmedTtcCents.previous).toBe(2_000);
    expect(report.revenue.confirmedSales.value).toBe(1);
    expect(report.revenue.pricedLines).toBe(2);
    expect(report.revenue.unpricedLines).toBe(1);
    expect(report.revenue.averageBasketCents).toBe(3_990);
  });

  it("la qualité reprend ce qui est écarté ou en attente, sans rien inventer", () => {
    expect(report.quality).toEqual({
      manualExcluded: 1,
      unpricedConfirmedLines: 1,
      deletedPrescriptionAdvice: 1,
      pendingAdvice: 1,
    });
    expect(report.quality.pendingAdvice).toBe(report.funnel.pending);
    expect(report.quality.unpricedConfirmedLines).toBe(report.revenue.unpricedLines);
  });

  it("les séries ne reçoivent que des données filtrées : leurs totaux retombent sur ceux de l'entonnoir et du chiffre d'affaires", () => {
    const { current, previous } = report.series;
    expect(sum(current.map((b) => b.proposed))).toBe(7);
    expect(sum(current.map((b) => b.accepted))).toBe(3);
    expect(sum(current.map((b) => b.revenueTtcCents))).toBe(3_990);
    expect(sum(previous.map((b) => b.proposed))).toBe(4);
    expect(sum(previous.map((b) => b.revenueTtcCents))).toBe(2_000);
  });

  it("les produits et univers ne citent ni l'ajout manuel ni l'ordonnance supprimée", () => {
    const keys = report.products.map((p) => p.key);
    expect(keys).not.toContain("p:prod-a7");
    expect(keys).not.toContain("p:prod-a8");
    expect(keys).not.toContain("p:prod-man");
    expect(sum(report.products.map((p) => p.revenueTtcCents))).toBe(3_990);
    expect(sum(report.universes.map((u) => u.revenueTtcCents))).toBe(3_990);
    expect(sum(report.universes.map((u) => u.proposed))).toBe(7);
  });

  it("la narration est celle des chiffres du rapport", () => {
    expect(report.narrative.headline).toBe(
      "Sur les 7 derniers jours, PharmaBoost a proposé 7 conseils à votre équipe : 3 ont été acceptés (50 % des 6 conseils tranchés, 1 encore en attente).",
    );
    expect(plain(report.narrative.revenueLine)).toBe("Les ventes confirmées issues de conseils PharmaBoost représentent 39,90 € TTC sur la période.");
    const kinds = report.narrative.insights.map((i) => i.kind);
    expect(kinds).toContain("revenue");
    expect(kinds).toContain("data");
    expect(report.narrative.insights.find((i) => i.kind === "data")?.text).toBe("1 ligne de vente sans prix n'est pas comptée dans le chiffre d'affaires.");
    expect(kinds.length).toBeLessThanOrEqual(4);
  });

  it("reprend la période et l'instant de calcul tels quels", () => {
    expect(report.period).toBe(PERIOD);
    expect(report.generatedAt).toEqual(NOW);
    expect(report.empty).toBe(false);
  });
});

describe("computePerformance : l'horloge et les filtres", () => {
  it("un conseil proposé il y a moins de 24 h est en attente, au-delà il est sans réponse", () => {
    const later = computePerformance({ ...week(), now: new Date("2026-10-07T12:00:00Z") });
    expect(later.funnel.pending).toBe(0);
    expect(later.funnel.unanswered).toBe(3);
    expect(later.quality.pendingAdvice).toBe(0);
    expect(later.funnel.acceptanceRate.value).toBeCloseTo(3 / 7, 10);
  });

  it("le rythme n'utilise que des conseils PharmaBoost conservés : 29 comptés + des ajouts manuels ne suffisent pas, 30 comptés oui", () => {
    const rows = (count: number): AdviceRow[] =>
      Array.from({ length: count }, (_, i) => advice(`r${i}`, "ACCEPTED", "2026-09-14T08:00:00Z"));
    const noise: AdviceRow[] = [
      ...Array.from({ length: 6 }, (_, i) => advice(`m${i}`, "ACCEPTED", "2026-09-14T08:00:00Z", { origin: "MANUAL" })),
      ...Array.from({ length: 6 }, (_, i) => advice(`d${i}`, "ACCEPTED", "2026-09-14T08:00:00Z", { prescriptionDeleted: true })),
    ];
    const short = computePerformance({ ...week(), rhythmAdvice: [...rows(29), ...noise] });
    expect(short.rhythm.enoughData).toBe(false);
    expect(short.rhythm.bestWeekday).toBeNull();

    const enough = computePerformance({ ...week(), rhythmAdvice: [...rows(30), ...noise] });
    expect(enough.rhythm.enoughData).toBe(true);
    // Lundi 14 septembre 2026, 10 h à Paris : tous les conseils tombent dans la même case.
    expect(enough.rhythm.bestWeekday?.weekday).toBe(0);
    expect(enough.rhythm.bestWeekday?.decided).toBe(30);
    expect(enough.rhythm.cells.find((c) => c.weekday === 0 && c.hour === 10)?.proposed).toBe(30);
    expect(enough.narrative.insights.some((i) => i.kind === "weekday")).toBe(true);
  });

  it("le rythme ne dépend pas de la période choisie", () => {
    const rhythmAdvice = Array.from({ length: 30 }, (_, i) => advice(`r${i}`, "ACCEPTED", "2026-08-20T08:00:00Z"));
    const a = computePerformance({ ...week(), rhythmAdvice });
    const b = computePerformance({ ...week(), period: { ...PERIOD, key: "month", label: "Ce mois-ci" }, rhythmAdvice });
    expect(a.rhythm).toEqual(b.rhythm);
  });
});

describe("computePerformance : rapport vide", () => {
  const nothing: PerformanceInput = { ...week(), advice: [], previousAdvice: [], lines: [], previousLines: [], rhythmAdvice: [] };

  it("aucun conseil et aucune ligne : vide, honnête, sans chiffre inventé", () => {
    const report = computePerformance(nothing);
    expect(report.empty).toBe(true);
    expect(report.funnel.proposed.value).toBe(0);
    expect(report.funnel.acceptanceRate.value).toBeNull();
    expect(report.revenue.confirmedTtcCents.value).toBe(0);
    expect(report.revenue.averageBasketCents).toBeNull();
    expect(report.products).toEqual([]);
    expect(report.universes).toEqual([]);
    expect(report.rhythm.enoughData).toBe(false);
    expect(report.narrative.headline).toBe("PharmaBoost n'a encore rien proposé à votre équipe sur cette période.");
    expect(report.narrative.revenueLine).toBeNull();
    expect(report.narrative.insights).toEqual([]);
    expect(report.quality).toEqual({ manualExcluded: 0, unpricedConfirmedLines: 0, deletedPrescriptionAdvice: 0, pendingAdvice: 0 });
    // Les séries existent (axe), mais sans une seule donnée.
    expect(sum(report.series.current.map((b) => b.proposed + b.accepted + b.purchased + b.revenueTtcCents))).toBe(0);
  });

  it("seulement des ajouts manuels et des ordonnances supprimées : toujours vide, et on le dit dans la qualité", () => {
    const report = computePerformance({
      ...nothing,
      advice: [
        advice("m1", "ACCEPTED", "2026-10-05T09:00:00Z", { origin: "MANUAL" }),
        advice("d1", "ACCEPTED", "2026-10-05T09:00:00Z", { prescriptionDeleted: true }),
      ],
      lines: [line("m1", "S1", "2026-10-05T10:00:00Z", { origin: "MANUAL" })],
    });
    expect(report.empty).toBe(true);
    expect(report.funnel.proposed.value).toBe(0);
    expect(report.revenue.confirmedTtcCents.value).toBe(0);
    expect(report.quality.manualExcluded).toBe(1);
    expect(report.quality.deletedPrescriptionAdvice).toBe(1);
  });

  it("une vente confirmée sans conseil proposé sur la période : le rapport n'est pas vide, la narration ne la cache pas", () => {
    const report = computePerformance({ ...nothing, lines: [line("old", "S1", "2026-10-05T10:00:00Z", { totalCents: 4_500, unitPriceCents: 4_500 })] });
    expect(report.empty).toBe(false);
    expect(report.revenue.confirmedTtcCents.value).toBe(4_500);
    expect(plain(report.narrative.revenueLine)).toBe("Des ventes confirmées issues de conseils proposés avant cette période représentent 45,00 € TTC.");
  });

  it("une ligne de vente sans prix seulement : pas vide non plus, et aucun chiffre d'affaires", () => {
    const report = computePerformance({ ...nothing, lines: [line("old", "S1", "2026-10-05T10:00:00Z", { unitPriceCents: 0, totalCents: 0 })] });
    expect(report.empty).toBe(false);
    expect(report.revenue.confirmedTtcCents.value).toBe(0);
    expect(report.quality.unpricedConfirmedLines).toBe(1);
    expect(report.narrative.revenueLine).toBe("1 ligne de vente n'a pas de prix saisi : aucun chiffre d'affaires n'est compté.");
  });
});

describe("computePerformance : un mot, une unité", () => {
  const nothing: PerformanceInput = { ...week(), advice: [], previousAdvice: [], lines: [], previousLines: [], rhythmAdvice: [] };

  it("3 lignes sans prix dans UN seul ticket : 0 vente confirmée (un ticket compte quand une ligne a un prix), 3 lignes de vente sans prix, dites ainsi", () => {
    const lines = ["x1", "x2", "x3"].map((id) => line(id, "S1", "2026-10-05T10:00:00Z", { unitPriceCents: 0, totalCents: 0 }));
    const report = computePerformance({ ...nothing, lines });
    expect(report.revenue.confirmedSales.value).toBe(0);
    expect(report.revenue.unpricedLines).toBe(3);
    expect(report.revenue.pricedLines).toBe(0);
    expect(report.quality.unpricedConfirmedLines).toBe(3);
    expect(report.narrative.revenueLine).toBe("3 lignes de vente n'ont pas de prix saisi : aucun chiffre d'affaires n'est compté.");
    expect(report.narrative.revenueLine).not.toMatch(/ventes? confirmée/);
  });

  it("2 tickets (3 lignes au prix) = 2 ventes confirmées, 3 lignes ; le chiffre d'affaires les additionne, le panier moyen divise par les tickets", () => {
    const lines = [
      line("y1", "S1", "2026-10-05T10:00:00Z", { unitPriceCents: 1_000, totalCents: 1_000 }),
      line("y2", "S1", "2026-10-05T10:00:00Z", { unitPriceCents: 2_000, totalCents: 2_000 }),
      line("y3", "S2", "2026-10-05T11:00:00Z", { unitPriceCents: 3_000, totalCents: 3_000 }),
      line("y4", "S2", "2026-10-05T11:00:00Z", { unitPriceCents: 0, totalCents: 0 }),
    ];
    const { revenue, quality } = computePerformance({ ...nothing, lines });
    expect(revenue.confirmedSales.value).toBe(2);
    expect(revenue.pricedLines).toBe(3);
    expect(revenue.unpricedLines).toBe(1);
    expect(revenue.confirmedTtcCents.value).toBe(6_000);
    expect(revenue.averageBasketCents).toBe(3_000);
    expect(quality.unpricedConfirmedLines).toBe(1);
  });

  it("la tendance du taux ne s'écrit pas sur 1 seul conseil tranché : 3 conseils dont 2 en attente, 1 accepté, contre 5 acceptés sur 10 avant", () => {
    const report = computePerformance({
      ...nothing,
      advice: [
        advice("t1", "ACCEPTED", "2026-10-06T10:00:00Z"),
        advice("t2", "PROPOSED", "2026-10-06T10:30:00Z"),
        advice("t3", "PROPOSED", "2026-10-06T11:00:00Z"),
      ],
      previousAdvice: [
        ...[1, 2, 3, 4, 5].map((n) => advice(`pa${n}`, "ACCEPTED", "2026-09-25T09:00:00Z")),
        ...[1, 2, 3, 4, 5].map((n) => advice(`pr${n}`, "REMOVED", "2026-09-26T09:00:00Z")),
      ],
    });
    expect(report.funnel.proposed.value).toBe(3);
    expect(report.funnel.pending).toBe(2);
    expect(report.funnel.acceptanceRate.value).toBe(1);
    expect(report.funnel.acceptanceRate.previous).toBe(0.5);
    // Le taux de 100 % existe, mais la phrase de tendance, elle, ne l'écrit pas.
    expect(report.narrative.insights.some((i) => i.kind === "acceptance")).toBe(false);
    expect(report.narrative.headline).toContain("100 % sur 1 conseil tranché");
  });
});

describe("computePerformance : pureté", () => {
  it("ne modifie pas ses entrées (tout est gelé) et donne le même résultat à chaque appel", () => {
    const input = week();
    const freeze = (rows: object[]) => rows.forEach((row) => Object.freeze(row));
    freeze(input.advice);
    freeze(input.previousAdvice);
    freeze(input.lines);
    freeze(input.previousLines);
    Object.freeze(input.advice);
    Object.freeze(input.previousAdvice);
    Object.freeze(input.lines);
    Object.freeze(input.previousLines);
    Object.freeze(input.rhythmAdvice);
    const first = computePerformance(input);
    const second = computePerformance(input);
    expect(second).toEqual(first);
  });
});
