import { describe, expect, it } from "vitest";
import { advisorLevel, certificateCode, computeAdvisorStats } from "../advisor-sheet";

describe("fiche Conseiller certifié", () => {
  it("calcule les taux et les domaines", () => {
    const stats = computeAdvisorStats({
      sales: [
        { proposed: 2, sold: 1, notSold: 1 },
        { proposed: 1, sold: 0, notSold: 1 },
        { proposed: 2, sold: 2, notSold: 0 },
        { proposed: 0, sold: 0, notSold: 0 },
      ],
      soldCategories: ["PROBIOTIQUES", "VITAMINES", "MAGNESIUM", "AUTRE"],
      ratings: [5, 4],
      firstSaleDay: "2026-10-01",
    });
    expect(stats.sales).toBe(4);
    expect(stats.withAdvice).toBe(2);
    expect(stats.attachRate).toBe(0.5);
    expect(stats.soldRate).toBe(3 / 5);
    expect(stats.acceptRate).toBe(3 / 5);
    expect(stats.domains[0]).toMatchObject({ label: "Micronutrition", count: 2 });
    expect(stats.reviews).toEqual({ count: 2, average: 4.5 });
  });

  it("donne un niveau selon les conseils vendus et l'acceptation", () => {
    expect(advisorLevel(5, 0.9).key).toBe("debut");
    expect(advisorLevel(12, 0.1).key).toBe("conseiller");
    expect(advisorLevel(60, 0.3).key).toBe("confirme");
    expect(advisorLevel(250, 0.4).key).toBe("expert");
  });

  it("fabrique un code court sans caractère ambigu", () => {
    expect(certificateCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toMatch(/^PB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });
});
