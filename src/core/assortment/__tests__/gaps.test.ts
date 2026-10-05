import { describe, expect, it } from "vitest";
import { GAP_PERIODS, resolveGapPeriod, summarizeGaps, universesForCategory, type OpportunityRow } from "../gaps";

const row = (over: Partial<OpportunityRow> = {}): OpportunityRow => ({ title: "Tolérance digestive pendant l'antibiothérapie", category: "PROBIOTIQUES", ruleKey: "digestive-tolerance-antibiotics", needKey: null, coverage: "COVERED", answer: null, ...over });

describe("les besoins que l'assortiment ne couvre pas", () => {
  it("compte les besoins réels, les couverts et les non couverts", () => {
    const summary = summarizeGaps([row(), row(), row({ coverage: "NOT_REFERENCED" }), row({ coverage: "OUT_OF_STOCK" })]);
    expect(summary).toMatchObject({ detected: 4, covered: 2, unmet: 2, coveredRate: 50 });
  });

  it("regroupe par situation, la plus fréquente d'abord, avec la cause de chaque manque", () => {
    const summary = summarizeGaps([
      row({ coverage: "NOT_REFERENCED" }),
      row({ coverage: "NOT_REFERENCED" }),
      row({ coverage: "OUT_OF_STOCK" }),
      row({ title: "Confort intime pendant l'antibiothérapie", ruleKey: "antibiotic-intimate-care", category: "HYGIENE", coverage: "NO_SUITABLE" }),
    ]);
    expect(summary.groups.map((g) => [g.title, g.count])).toEqual([["Tolérance digestive pendant l'antibiothérapie", 3], ["Confort intime pendant l'antibiothérapie", 1]]);
    expect(summary.groups[0].causes).toEqual({ NOT_REFERENCED: 2, OUT_OF_STOCK: 1, NO_SUITABLE: 0 });
    expect(summary.groups[1].causes.NO_SUITABLE).toBe(1);
  });

  it("n'est pas un manque : un besoin que le patient n'a pas, ou une analyse sans information de couverture", () => {
    const summary = summarizeGaps([row({ coverage: "NOT_REFERENCED", answer: false }), row({ coverage: null }), row({ coverage: "NOT_REFERENCED", answer: true })]);
    expect(summary).toMatchObject({ detected: 1, unmet: 1 });
  });

  it("rien de détecté : pas de pourcentage inventé", () => {
    expect(summarizeGaps([])).toEqual({ detected: 0, covered: 0, unmet: 0, coveredRate: null, groups: [] });
  });

  it("les univers qui répondent à une catégorie de conseil", () => {
    expect(universesForCategory("PROBIOTIQUES")).toEqual(["COMPLEMENTS_ALIMENTAIRES"]);
    expect(universesForCategory("DERMOCOSMETIQUE")).toEqual(["DERMOCOSMETIQUE"]);
    expect(universesForCategory("INCONNUE")).toEqual([]);
  });

  it("la période : 30 jours par défaut", () => {
    expect(resolveGapPeriod(undefined).days).toBe(30);
    expect(resolveGapPeriod("7j").days).toBe(7);
    expect(resolveGapPeriod("90j").days).toBe(90);
    expect(resolveGapPeriod("n'importe quoi").days).toBe(30);
    expect(GAP_PERIODS).toHaveLength(3);
  });
});
