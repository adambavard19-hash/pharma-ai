/**
 * Les chiffres de l'écran « Mon stock » : un produit est DISPONIBLE, EN RUPTURE ou DÉSACTIVÉ — rien d'autre.
 *
 * Ce module est la seule source de ces comptes (l'écran principal, la page « Qualité du catalogue »). Il règle
 * une confusion de l'ancien écran : « en stock » excluait les produits dont la quantité est au-dessous de leur seuil
 * d'alerte (« stock faible »). Sur une officine de 4 307 références dont 1 571 sous un seuil par défaut de 5, il
 * affichait donc « 2 735 en stock » à côté d'« une seule rupture », alors que 4 306 produits avaient une quantité
 * supérieure à zéro. Un seuil d'alerte est un réglage de commande, pas une rupture : il n'enlève rien aux produits
 * disponibles.
 *
 * Ne confondons pas non plus le stock avec la qualité du catalogue : un produit « non classé » (que le moteur n'a
 * pas encore compris) ou sans photo n'est PAS en rupture. Il compte ici selon sa seule quantité.
 *
 * Module pur : aucune base, aucune session.
 */
import { stockAgeDays, stockReminderLevel } from "@/core/stock-deposit/rules";

export type StockLineState = { active: boolean; quantity: number };

export type Availability = "disponible" | "rupture" | "desactive";

export function availabilityOf(line: StockLineState): Availability {
  if (!line.active) return "desactive";
  return line.quantity > 0 ? "disponible" : "rupture";
}

export type StockSummary = {
  /** Toutes les références du catalogue de l'officine, désactivées comprises. */
  referenced: number;
  /** Actives, avec une quantité supérieure à zéro. */
  available: number;
  /** Actives, sans quantité. */
  outOfStock: number;
  /** Désactivées : retirées de la vente, ni disponibles ni en rupture. */
  inactive: number;
};

/** `referenced = available + outOfStock + inactive`, toujours. */
export function summarizeStock(lines: readonly StockLineState[]): StockSummary {
  const summary: StockSummary = { referenced: lines.length, available: 0, outOfStock: 0, inactive: 0 };
  for (const line of lines) {
    const state = availabilityOf(line);
    if (state === "disponible") summary.available += 1;
    else if (state === "rupture") summary.outOfStock += 1;
    else summary.inactive += 1;
  }
  return summary;
}

/** « Aujourd'hui », « Hier », « Il y a 21 jours » : l'âge du dernier stock reçu, dit comme on le dirait. `null` : jamais reçu. */
export function describeStockAge(syncedAt: Date | null, now: Date): string | null {
  const days = stockAgeDays(syncedAt, now);
  if (days === null) return null;
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `Il y a ${days} jours`;
}

export type StockStatus = { tone: "success" | "warning" | "neutral"; label: string };

/** Le mot de l'état du stock : à jour (moins de trois jours), à actualiser, ou rien reçu. */
export function stockStatus(syncedAt: Date | null, now: Date): StockStatus {
  if (!syncedAt) return { tone: "neutral", label: "Aucun stock reçu" };
  return stockReminderLevel(syncedAt, now) === "none" ? { tone: "success", label: "À jour" } : { tone: "warning", label: "À actualiser" };
}

export type StockFilter = "tous" | "disponible" | "rupture" | "desactive";

/** Le filtre de l'adresse de la liste. Les adresses de l'ancien écran (« stock », « faible », « inactif ») ouvrent encore la bonne liste. */
export function parseStockFilter(value: string | undefined): StockFilter {
  if (value === "rupture" || value === "disponible" || value === "desactive") return value;
  if (value === "stock") return "disponible";
  if (value === "inactif") return "desactive";
  return "tous";
}
