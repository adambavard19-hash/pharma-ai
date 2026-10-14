import { describe, expect, it } from "vitest";
import { buildSalesReport, parisMidnight, percent, reportWindow, type ClosedSale } from "../sales-report";

const TZ = "Europe/Paris";
const NOW = new Date("2026-10-15T16:00:00Z"); // 18 h à Paris
const sale = (over: Partial<ClosedSale> & { at: string }): ClosedSale => ({
  id: over.at,
  closedAt: new Date(over.at),
  who: over.who ?? "Donna BENVENISTE",
  boxes: ["DOLIPRANE 1000 mg"],
  proposed: over.proposed ?? 2,
  sold: over.sold ?? 0,
  notSold: over.notSold ?? 0,
  unanswered: over.unanswered ?? 0,
  soldItems: over.soldItems ?? [],
  emailSent: over.emailSent ?? false,
});

describe("le rapport des ventes terminées", () => {
  it("minuit à Paris, heure d'été comprise", () => {
    expect(parisMidnight(NOW, TZ).toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(reportWindow("week", NOW, TZ).from.toISOString()).toBe("2026-10-08T22:00:00.000Z");
  });

  it("compte les ventes, celles avec un conseil vendu (objectif 10 %), les conseils et le chiffre d'affaires ajouté", () => {
    const sales = [
      sale({ at: "2026-10-15T07:30:00Z", sold: 1, notSold: 1, soldItems: [{ name: "PROBIOTIQUE", priceCents: 1490, marginCents: 600 }], emailSent: true }),
      sale({ at: "2026-10-15T09:00:00Z", sold: 0, notSold: 2 }),
      sale({ at: "2026-10-15T12:10:00Z", sold: 2, soldItems: [{ name: "SPRAY NASAL", priceCents: 590, marginCents: null }, { name: "PROBIOTIQUE", priceCents: 1490, marginCents: 600 }], who: "Comptoir 4" }),
      sale({ at: "2026-10-14T09:00:00Z", sold: 1, soldItems: [{ name: "X", priceCents: 1000, marginCents: 0 }] }), // hier : hors « aujourd'hui »
    ];
    const day = buildSalesReport({ period: "day", sales, now: NOW, timeZone: TZ });
    expect(day.sales).toBe(3);
    expect(day.withAdvice).toBe(2);
    expect(percent(day.attachRate)).toBe("66,7 %");
    expect(day.meetsTarget).toBe(true);
    expect(day.sold).toBe(3);
    expect(day.revenueCents).toBe(3570);
    expect(day.marginCents).toBe(1200);
    expect(day.conversionRate).toBe(3 / 6);
    expect(day.emailsSent).toBe(1);
    expect(day.topProducts[0]).toEqual({ name: "PROBIOTIQUE", sold: 2, revenueCents: 2980 });
    expect(day.buckets.find((bucket) => bucket.key === "9")?.sales).toBe(1); // 7 h 30 UTC = 9 h 30 à Paris
    expect(day.byPerson.map((person) => person.who)).toEqual(["Comptoir 4", "Donna BENVENISTE"]);

    const week = buildSalesReport({ period: "week", sales, now: NOW, timeZone: TZ });
    expect(week.sales).toBe(4);
    expect(week.buckets).toHaveLength(7);
    expect(week.buckets.at(-1)?.label).toBe("15/10");
  });

  it("sans vente : aucune mesure inventée", () => {
    const empty = buildSalesReport({ period: "month", sales: [], now: NOW, timeZone: TZ });
    expect(empty.attachRate).toBeNull();
    expect(empty.meetsTarget).toBeNull();
    expect(empty.buckets).toHaveLength(30);
    expect(percent(empty.attachRate)).toBe("—");
  });
});

describe("le PDF du rapport", () => {
  it("produit un vrai PDF, même sans vente, et accepte les montants en euros", async () => {
    const { renderSalesReportPdf } = await import("../sales-report-pdf");
    const report = buildSalesReport({ period: "month", sales: [sale({ at: "2026-10-15T07:30:00Z", sold: 1, soldItems: [{ name: "Flore Équilibre", priceCents: 1490, marginCents: 600 }] })], now: NOW, timeZone: TZ });
    const bytes = await renderSalesReportPdf({ pharmacyName: "PHARMACIE DU DOCTEUR NICOLAS", report, generatedAt: NOW, timeZone: TZ });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const empty = await renderSalesReportPdf({ pharmacyName: "Officine", report: buildSalesReport({ period: "day", sales: [], now: NOW, timeZone: TZ }), generatedAt: NOW, timeZone: TZ });
    expect(empty.length).toBeGreaterThan(1000);
  });
});
