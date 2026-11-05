import { describe, expect, it } from "vitest";
import { buildOwnerAlerts, type OwnerAlertsInput } from "../owner-alerts";

const now = new Date("2026-11-05T10:00:00Z");
const base: OwnerAlertsInput = { lots: [], campaigns: [], gaps: [], now, today: "2026-11-05" };
const campaign = { productName: "Fluide solaire", isActive: true, endedReason: null, endedAt: null, endsOn: null, quantity: 20, targetQuantity: 10 };

describe("les alertes de la Vue d'ensemble", () => {
  it("rien à signaler : aucune alerte", () => {
    expect(buildOwnerAlerts(base)).toEqual([]);
  });

  it("les dates dépassées d'abord, puis les boîtes qui périment cette semaine (compte des boîtes)", () => {
    const alerts = buildOwnerAlerts({ ...base, lots: [{ label: "A", daysLeft: -2, quantity: 1 }, { label: "B", daysLeft: 3, quantity: 2 }, { label: "C", daysLeft: 7, quantity: 1 }, { label: "D", daysLeft: 20, quantity: 5 }] });
    expect(alerts.map((alert) => alert.key)).toEqual(["lots-perimes", "lots-semaine"]);
    expect(alerts[0].text).toBe("1 produit a dépassé sa date : à retirer du rayon.");
    expect(alerts[1].text).toMatch(/^3 boîtes périment cette semaine/);
  });

  it("une campagne Surstock terminée depuis moins de 7 jours ; plus ancienne, plus rien", () => {
    const reached = buildOwnerAlerts({ ...base, campaigns: [{ ...campaign, isActive: false, endedReason: "OBJECTIF", endedAt: new Date("2026-11-03T10:00:00Z"), quantity: 10 }] });
    expect(reached).toHaveLength(1);
    expect(reached[0]).toMatchObject({ tone: "success", text: "Campagne Surstock « Fluide solaire » terminée : objectif de stock atteint." });
    expect(buildOwnerAlerts({ ...base, campaigns: [{ ...campaign, isActive: false, endedReason: "OBJECTIF", endedAt: new Date("2026-10-20T10:00:00Z") }] })).toEqual([]);
  });

  it("une campagne qui finit dans 3 jours sans avoir atteint l'objectif", () => {
    const alerts = buildOwnerAlerts({ ...base, campaigns: [{ ...campaign, endsOn: "2026-11-07" }] });
    expect(alerts[0].text).toBe("La campagne « Fluide solaire » se termine dans 2 jours : encore 10 à écouler pour l'objectif.");
    expect(buildOwnerAlerts({ ...base, campaigns: [{ ...campaign, endsOn: "2026-11-20" }] })).toEqual([]);
  });

  it("un produit manquant demandé au moins 3 fois", () => {
    const alerts = buildOwnerAlerts({ ...base, gaps: [{ title: "Probiotique", count: 4 }, { title: "Spray nasal", count: 2 }] });
    expect(alerts.map((alert) => alert.text)).toEqual(["« Probiotique » demandé 4 fois ce mois-ci sans produit en stock."]);
  });
});
