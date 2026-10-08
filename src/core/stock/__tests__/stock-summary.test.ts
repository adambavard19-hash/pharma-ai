import { describe, expect, it } from "vitest";
import { availabilityOf, summarizeStock } from "../stock-summary";

describe("la disponibilité d'un produit", () => {
  it("une quantité supérieure à zéro, produit actif : disponible", () => {
    expect(availabilityOf({ active: true, quantity: 1 })).toBe("disponible");
    expect(availabilityOf({ active: true, quantity: 250 })).toBe("disponible");
  });

  it("zéro (ou moins) : rupture", () => {
    expect(availabilityOf({ active: true, quantity: 0 })).toBe("rupture");
    expect(availabilityOf({ active: true, quantity: -2 })).toBe("rupture");
  });

  it("un produit désactivé n'est ni disponible ni en rupture, quelle que soit sa quantité", () => {
    expect(availabilityOf({ active: false, quantity: 12 })).toBe("desactive");
    expect(availabilityOf({ active: false, quantity: 0 })).toBe("desactive");
  });
});

describe("les chiffres de l'écran « Mon stock »", () => {
  it("référencés = disponibles + ruptures + désactivés, toujours", () => {
    const lines = [
      { active: true, quantity: 10 },
      { active: true, quantity: 0 },
      { active: false, quantity: 3 },
      { active: true, quantity: 4 },
    ];
    const summary = summarizeStock(lines);
    expect(summary).toEqual({ referenced: 4, available: 2, outOfStock: 1, inactive: 1 });
    expect(summary.available + summary.outOfStock + summary.inactive).toBe(summary.referenced);
  });

  it("un stock « faible » (sous un seuil d'alerte) reste DISPONIBLE : le seuil n'est pas une rupture", () => {
    // 1 571 produits à quantité 1 à 5, 802 au-dessus, 1 933 médicaments, 1 rupture : l'officine de test.
    const lines = [
      ...Array.from({ length: 1571 }, (_, i) => ({ active: true, quantity: 1 + (i % 5) })),
      ...Array.from({ length: 802 }, () => ({ active: true, quantity: 12 })),
      ...Array.from({ length: 1933 }, () => ({ active: true, quantity: 3 })),
      { active: true, quantity: 0 },
    ];
    expect(summarizeStock(lines)).toEqual({ referenced: 4307, available: 4306, outOfStock: 1, inactive: 0 });
  });

  it("un catalogue vide donne des zéros", () => {
    expect(summarizeStock([])).toEqual({ referenced: 0, available: 0, outOfStock: 0, inactive: 0 });
  });
});

import { describeStockAge, parseStockFilter, stockStatus } from "../stock-summary";

describe("l'âge et l'état du stock, dits simplement", () => {
  const NOW = new Date("2026-10-08T12:00:00Z");
  const ago = (days: number, hours = 0) => new Date(NOW.getTime() - (days * 24 + hours) * 3600_000);

  it("dit « Aujourd'hui », « Hier », « Il y a N jours » — ou rien si aucun stock n'a jamais été reçu", () => {
    expect(describeStockAge(ago(0, 2), NOW)).toBe("Aujourd'hui");
    expect(describeStockAge(ago(1, 1), NOW)).toBe("Hier");
    expect(describeStockAge(ago(21), NOW)).toBe("Il y a 21 jours");
    expect(describeStockAge(null, NOW)).toBeNull();
  });

  it("à jour sous trois jours, à actualiser au-delà, aucun stock reçu sinon", () => {
    expect(stockStatus(ago(1), NOW)).toEqual({ tone: "success", label: "À jour" });
    expect(stockStatus(ago(21), NOW)).toEqual({ tone: "warning", label: "À actualiser" });
    expect(stockStatus(null, NOW)).toEqual({ tone: "neutral", label: "Aucun stock reçu" });
  });
});

describe("le filtre de la liste", () => {
  it("reconnaît les filtres, et prend tout le reste pour « tous »", () => {
    expect(parseStockFilter("rupture")).toBe("rupture");
    expect(parseStockFilter("disponible")).toBe("disponible");
    expect(parseStockFilter("desactive")).toBe("desactive");
    expect(parseStockFilter(undefined)).toBe("tous");
    expect(parseStockFilter("n'importe quoi")).toBe("tous");
  });

  it("les adresses de l'ancien écran ouvrent la bonne liste : « stock » = disponibles, « inactif » = désactivés, « faible » = tous", () => {
    expect(parseStockFilter("stock")).toBe("disponible");
    expect(parseStockFilter("inactif")).toBe("desactive");
    expect(parseStockFilter("faible")).toBe("tous");
  });
});
