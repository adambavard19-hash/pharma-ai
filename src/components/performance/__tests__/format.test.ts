import { describe, expect, it } from "vitest";
import { pctText } from "@/core/performance/narrative";
import type { Metric, RateMetric } from "@/core/performance/types";
import {
  bucketTitle,
  categoryLabel,
  comparisonLabel,
  comparisonNoun,
  countOf,
  customRangeProblem,
  describeMetricDelta,
  describeRateDelta,
  formatAxisCents,
  formatRate,
  isoDateInTimeZone,
  pointsWord,
} from "../format";

/** Les mots et les formats de l'écran : chaque phrase est vérifiée telle qu'elle s'affiche. */

/** Les espaces insécables changent d'une version d'ICU à l'autre : on compare avec des espaces simples. */
const norm = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

const metric = (overrides: Partial<Metric>): Metric => ({ value: 10, previous: 8, deltaPct: 25, trend: "up", ...overrides });
const rate = (overrides: Partial<RateMetric>): RateMetric => ({ value: 0.6, previous: 0.5, deltaPoints: 10, trend: "up", ...overrides });

describe("customRangeProblem", () => {
  const today = "2026-10-12";

  it("accepte une période réelle", () => {
    expect(customRangeProblem("2026-09-01", "2026-09-15", today)).toBeNull();
    expect(customRangeProblem("2026-10-12", "2026-10-12", today)).toBeNull();
  });

  it("refuse les dates de calendrier impossibles que V8 normaliserait en silence", () => {
    expect(customRangeProblem("2026-02-31", "2026-03-05", today)).toBe("Ces dates ne sont pas valides.");
    expect(customRangeProblem("2026-04-31", "2026-05-05", today)).toBe("Ces dates ne sont pas valides.");
    expect(customRangeProblem("2026-02-29", "2026-03-05", today)).toBe("Ces dates ne sont pas valides.");
    expect(customRangeProblem("2026-09-01", "2026-09-31", today)).toBe("Ces dates ne sont pas valides.");
    expect(customRangeProblem("2026-13-01", "2026-09-05", today)).toBe("Ces dates ne sont pas valides.");
  });

  it("accepte le 29 février d'une année bissextile", () => {
    expect(customRangeProblem("2028-02-29", "2028-03-05", "2028-04-01")).toBeNull();
  });

  it("demande les deux dates quand l'une manque", () => {
    expect(customRangeProblem("", "2026-09-15", today)).toBe("Choisissez une date de début et une date de fin.");
    expect(customRangeProblem("2026-09-01", "", today)).toBe("Choisissez une date de début et une date de fin.");
    expect(customRangeProblem("", "", today)).toBe("Choisissez une date de début et une date de fin.");
  });

  it("refuse un texte qui n'est pas une date", () => {
    expect(customRangeProblem("hier", "aujourd'hui", today)).toBe("Ces dates ne sont pas valides.");
  });

  it("refuse un début après la fin, une fin à venir et plus d'un an", () => {
    expect(customRangeProblem("2026-09-15", "2026-09-01", today)).toBe("La date de début doit venir avant la date de fin.");
    expect(customRangeProblem("2026-10-01", "2026-10-13", today)).toBe("Les dates à venir ne peuvent pas encore être mesurées.");
    expect(customRangeProblem("2025-01-01", "2026-10-12", today)).toBe("Choisissez une période d'un an au plus.");
  });

  it("une année avant 2000 est refusée, dite en clair : le 1er janvier de l'an 1 existe, mais pas sa période précédente", () => {
    const message = "Choisissez des dates à partir de 2000.";
    expect(customRangeProblem("0001-01-01", "0001-01-02", today)).toBe(message);
    expect(customRangeProblem("0001-01-01", "0001-01-01", today)).toBe(message);
    expect(customRangeProblem("1999-12-31", "2000-01-02", today)).toBe(message);
    expect(customRangeProblem("1999-12-31", "1999-12-31", today)).toBe(message);
    // la fin aussi : début valide, fin avant 2000 (mais ce serait inversé : la borne d'année passe avant)
    expect(customRangeProblem("2000-01-01", "1999-12-31", today)).toBe(message);
  });

  it("le 1er janvier 2000 est la première date acceptée", () => {
    expect(customRangeProblem("2000-01-01", "2000-01-02", today)).toBeNull();
    expect(customRangeProblem("2000-01-01", "2000-12-31", today)).toBeNull();
  });

  it("une date impossible avant 2000 dit l'année d'abord ; une date impossible depuis 2000 dit « pas valides »", () => {
    expect(customRangeProblem("1999-02-31", "1999-03-05", today)).toBe("Choisissez des dates à partir de 2000.");
    expect(customRangeProblem("2000-02-31", "2000-03-05", today)).toBe("Ces dates ne sont pas valides.");
  });

  it("366 jours passent, 367 non", () => {
    expect(customRangeProblem("2025-10-12", "2026-10-12", today)).toBeNull();
    expect(customRangeProblem("2025-10-11", "2026-10-12", today)).toBe("Choisissez une période d'un an au plus.");
  });
});

describe("variations : la décimale n'existe que pour les points", () => {
  it("« point » sous 2, « points » à partir de 2", () => {
    expect(pointsWord(0.5)).toBe("point");
    expect(pointsWord(1)).toBe("point");
    expect(pointsWord(1.5)).toBe("point");
    expect(pointsWord(1.9)).toBe("point");
    expect(pointsWord(2)).toBe("points");
    expect(pointsWord(12.5)).toBe("points");
  });

  it("lu à voix haute : « 1 point », « 1,5 point », « 2 points »", () => {
    expect(describeRateDelta(rate({ deltaPoints: 1 })).spoken).toBe("En hausse de 1 point");
    expect(describeRateDelta(rate({ deltaPoints: 1.5 })).spoken).toBe("En hausse de 1,5 point");
    expect(describeRateDelta(rate({ deltaPoints: 2 })).spoken).toBe("En hausse de 2 points");
    expect(describeRateDelta(rate({ deltaPoints: -1, trend: "down" })).spoken).toBe("En baisse de 1 point");
    expect(describeRateDelta(rate({ deltaPoints: -1.5, trend: "down" })).spoken).toBe("En baisse de 1,5 point");
    expect(describeRateDelta(rate({ deltaPoints: -2, trend: "down" })).spoken).toBe("En baisse de 2 points");
  });

  it("affiché : +5 pts, −1,5 pt n'existe pas (l'abréviation reste « pts »)", () => {
    expect(describeRateDelta(rate({ deltaPoints: 5 })).text).toBe("+5 pts");
    expect(describeRateDelta(rate({ deltaPoints: -3.5, trend: "down" })).text).toBe("−3,5 pts");
  });

  it("un taux inconnu d'un côté n'a pas de variation", () => {
    expect(describeRateDelta(rate({ value: null, deltaPoints: null, trend: "none" }))).toMatchObject({ tone: "none", text: "—" });
  });

  it("stable reste stable", () => {
    expect(describeRateDelta(rate({ deltaPoints: 0.2, trend: "flat" }))).toMatchObject({ tone: "flat", text: "Stable" });
    expect(describeMetricDelta(metric({ deltaPct: 0.1, trend: "flat" }))).toMatchObject({ tone: "flat", text: "Stable" });
  });

  it("jamais de pourcentage quand la période précédente vaut 0", () => {
    expect(describeMetricDelta({ value: 12, previous: 0, deltaPct: null, trend: "up" })).toMatchObject({ tone: "new", text: "Nouveau" });
    expect(describeMetricDelta({ value: 0, previous: 0, deltaPct: null, trend: "none" })).toMatchObject({ tone: "none", text: "—" });
  });

  it("une hausse, une baisse et un grand pourcentage", () => {
    expect(norm(describeMetricDelta(metric({ deltaPct: 12.5 })).text)).toBe("+12,5 %");
    expect(describeMetricDelta(metric({ deltaPct: -30, trend: "down" })).tone).toBe("down");
    expect(norm(describeMetricDelta(metric({ deltaPct: -30, trend: "down" })).text)).toBe("−30 %");
    expect(norm(describeMetricDelta(metric({ deltaPct: 1234.4 })).text)).toBe("+1 234 %");
  });

  it("une variation qui s'arrondit à 0 % n'est pas annoncée comme une hausse", () => {
    expect(describeMetricDelta(metric({ deltaPct: 0.04, trend: "up" }))).toMatchObject({ tone: "flat", text: "Stable" });
    expect(describeMetricDelta(metric({ deltaPct: -0.04, trend: "down" }))).toMatchObject({ tone: "flat", text: "Stable" });
  });
});

describe("nombres", () => {
  it("un taux s'écrit toujours en pourcentage entier", () => {
    expect(norm(formatRate(0.625))).toBe("63 %");
    expect(norm(formatRate(0.6249))).toBe("62 %");
    expect(norm(formatRate(1))).toBe("100 %");
    expect(norm(formatRate(0))).toBe("0 %");
    expect(norm(formatRate(0.2))).toBe("20 %");
  });

  it("tous les demi-points arrondissent vers le haut, sans dérive des flottants : 23 sur 40 = 57,5 % = « 58 % »", () => {
    // Les cas qui divergeaient entre le titre (Math.round) et les cartes (Intl) : le flottant tombe sous .5.
    const expected: [number, number, string][] = [
      [23, 40, "58 %"],
      [29, 200, "15 %"],
      [57, 200, "29 %"],
      [69, 120, "58 %"],
      [115, 200, "58 %"],
    ];
    for (const [accepted, decided, text] of expected) expect(norm(formatRate(accepted / decided)), `${accepted}/${decided}`).toBe(text);
    // Les 201 demi-points de 0 % à 100 % : n / 200 s'écrit « ceil(n / 2) % ».
    for (let n = 0; n <= 200; n += 1) expect(norm(formatRate(n / 200)), `${n}/200`).toBe(`${Math.ceil(n / 2)} %`);
  });

  it("une seule règle : formatRate est le pctText du cœur (le titre et les insights écrivent le même nombre)", () => {
    for (const rate of [0, 0.004, 0.005, 0.145, 0.2, 0.575, 0.625, 0.6249, 0.994, 0.995, 1]) expect(formatRate(rate)).toBe(pctText(rate));
    expect(formatRate(23 / 40)).toBe(pctText(23 / 40));
  });

  it("un taux absent s'écrit « — », jamais « 0 % »", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
  });

  it("countOf : 0 et 1 au singulier, 2 et plus au pluriel", () => {
    expect(countOf(0, "conseil")).toBe("0 conseil");
    expect(countOf(1, "conseil")).toBe("1 conseil");
    expect(countOf(2, "conseil")).toBe("2 conseils");
    expect(norm(countOf(1234, "conseil"))).toBe("1 234 conseils");
    expect(countOf(3, "cheval", "chevaux")).toBe("3 chevaux");
  });

  it("formatAxisCents : « 100 € » quand c'est rond, les centimes sinon", () => {
    expect(norm(formatAxisCents(0))).toBe("0 €");
    expect(norm(formatAxisCents(10_000))).toBe("100 €");
    expect(norm(formatAxisCents(50))).toBe("0,50 €");
    expect(norm(formatAxisCents(1_250))).toBe("12,50 €");
    expect(norm(formatAxisCents(25_000))).toBe("250 €");
  });

  it("formatAxisCents : en toutes lettres jusqu'à 9 999 €, compact à partir de 10 000 €", () => {
    expect(norm(formatAxisCents(150_000))).toBe("1 500 €");
    expect(norm(formatAxisCents(999_900))).toBe("9 999 €");
    expect(norm(formatAxisCents(1_250_000))).toMatch(/^12,5 k/);
  });
});

describe("libellés", () => {
  it("à quoi se compare la période", () => {
    expect(comparisonLabel("today")).toBe("vs hier");
    expect(comparisonLabel("7d")).toBe("vs les 7 jours d'avant");
    expect(comparisonLabel("month")).toBe("vs le mois dernier");
    expect(comparisonLabel("custom")).toBe("vs la période précédente");
    expect(comparisonNoun("7d")).toBe("les 7 jours d'avant");
  });

  it("les univers : le catalogue, « Médicaments conseil », et un mot de repli", () => {
    expect(categoryLabel("MEDICAMENT")).toBe("Médicaments conseil");
    expect(categoryLabel("CODE_QUI_N_EXISTE_PAS")).toBe("Autres produits de conseil");
  });

  it("le jour civil suit le fuseau de l'officine, pas celui du serveur", () => {
    // 22 h 30 UTC le 11 octobre = 00 h 30 le 12 à Paris (été).
    expect(isoDateInTimeZone(new Date("2026-10-11T22:30:00Z"), "Europe/Paris")).toBe("2026-10-12");
    expect(isoDateInTimeZone(new Date("2026-10-11T22:30:00Z"), "UTC")).toBe("2026-10-11");
  });

  it("le titre daté d'un point : jour, heure, semaine", () => {
    expect(bucketTitle(new Date("2026-10-11T22:00:00Z"), "day", "Europe/Paris")).toBe("Lundi 12 octobre");
    expect(bucketTitle(new Date("2026-10-12T12:00:00Z"), "hour", "Europe/Paris")).toBe("14 h, 12 octobre");
    expect(bucketTitle(new Date("2026-10-05T22:00:00Z"), "week", "Europe/Paris")).toBe("Semaine du 6 octobre");
  });
});
