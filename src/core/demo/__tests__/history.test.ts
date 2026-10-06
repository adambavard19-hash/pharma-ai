import { describe, expect, it } from "vitest";
import { DEMO_DRUGS, DEMO_SHELF } from "../catalog";
import { planHistory, seededRandom, summarizeHistory } from "../history";

const shelf = new Map(DEMO_SHELF.map((product) => [product.slug, { name: product.name, category: product.category, salePriceCents: product.salePriceCents, purchasePriceCents: product.purchasePriceCents }]));
const drugPrices = new Map(DEMO_DRUGS.filter((entry) => entry.priceCents).map((entry) => [entry.key, entry.priceCents as number]));
const NOW = new Date("2026-10-06T11:00:00Z");
const plan = (now = NOW) => planHistory({ now, days: 65, seed: 20261006, shelf, drugPrices });

describe("l'historique de démonstration", () => {
  it("est déterministe : mêmes entrées, mêmes passages", () => {
    expect(plan().map((visit) => [visit.at.toISOString(), visit.member, visit.advice.length])).toEqual(plan().map((visit) => [visit.at.toISOString(), visit.member, visit.advice.length]));
    const first = seededRandom(7);
    const second = seededRandom(7);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("couvre soixante-cinq jours, sans rien dans le futur, dans l'ordre", () => {
    const visits = plan();
    const times = visits.map((visit) => visit.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(Math.max(...times)).toBeLessThan(NOW.getTime());
    expect(NOW.getTime() - Math.min(...times)).toBeGreaterThan(60 * 86_400_000);
  });

  it("raconte une histoire crédible : de l'ordre de deux conseils sur trois acceptés, du chiffre d'affaires, jamais un taux parfait", () => {
    const summary = summarizeHistory(plan());
    expect(summary.visits).toBeGreaterThan(600);
    expect(summary.acceptanceRate).toBeGreaterThan(0.55);
    expect(summary.acceptanceRate).toBeLessThan(0.78);
    expect(summary.attributedCents).toBeGreaterThan(300_000);
    expect(summary.offered).toBeLessThan(summary.proposed);
  });

  it("donne quelque chose à montrer pour le jour, la semaine et le mois, quel que soit le jour de la semaine", () => {
    for (const day of ["2026-10-04T08:00:00Z", "2026-10-05T08:00:00Z", "2026-10-06T08:00:00Z", "2026-10-10T08:00:00Z", "2026-10-11T08:00:00Z"]) {
      const now = new Date(day);
      const visits = plan(now);
      const sinceMidnight = visits.filter((visit) => visit.at.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3_600_000);
      expect(sinceMidnight.length, day).toBeGreaterThan(0);
      expect(visits.filter((visit) => now.getTime() - visit.at.getTime() < 7 * 86_400_000).length).toBeGreaterThan(30);
    }
  });

  it("n'a de vente que pour un conseil acheté ; la quantité et le prix sont positifs", () => {
    for (const visit of plan()) {
      for (const advice of visit.advice) {
        expect(advice.unitPriceCents).toBeGreaterThan(0);
        expect(advice.quantity).toBeGreaterThanOrEqual(1);
        expect(["PURCHASED", "ACCEPTED", "DECLINED", "REMOVED", "IGNORED"]).toContain(advice.status);
      }
    }
  });

  it("chaque boîte scannée existe dans le stock de démonstration", () => {
    const keys = new Set(DEMO_DRUGS.map((entry) => entry.key));
    for (const visit of plan()) for (const scan of visit.scans) expect(keys.has(scan), scan).toBe(true);
  });

  it("l'équipe se distingue : un pharmacien adjoint qui conseille mieux qu'un stagiaire", () => {
    const rate = (member: string) => {
      const mine = plan().filter((visit) => visit.member === member).flatMap((visit) => visit.advice).filter((advice) => !advice.manual && advice.status !== "IGNORED" && advice.status !== "REMOVED");
      return mine.filter((advice) => advice.status === "PURCHASED" || advice.status === "ACCEPTED").length / Math.max(1, mine.length);
    };
    expect(rate("pharmacist")).toBeGreaterThan(rate("student"));
  });
});
