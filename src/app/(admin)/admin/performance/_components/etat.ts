import type { PortfolioHealth } from "@/core/performance/types";

/**
 * Les filtres de la liste, par l'adresse (`?etat=forte-valeur`) : le mot de
 * l'adresse est en français courant, la classe de santé est celle du calcul.
 * L'ordre est celui des pastilles : ce qui demande une action vient d'abord.
 */
export const ETAT_FILTERS = [
  { value: "a-accompagner", health: "needs_support" },
  { value: "forte-valeur", health: "high_value" },
  { value: "en-route", health: "on_track" },
  { value: "demarrage", health: "getting_started" },
  { value: "sans-donnees", health: "no_data" },
] as const satisfies readonly { value: string; health: PortfolioHealth }[];

export type EtatFilter = (typeof ETAT_FILTERS)[number];
export type EtatValue = EtatFilter["value"];

/** Le filtre demandé par l'adresse ; une valeur inconnue montre toutes les officines. */
export function etatFromParam(value: string | null | undefined): EtatFilter | null {
  return ETAT_FILTERS.find((filter) => filter.value === value) ?? null;
}

/** Combien d'officines dans chaque classe. */
export function countByHealth(rows: readonly { health: PortfolioHealth }[]): Record<PortfolioHealth, number> {
  const counts: Record<PortfolioHealth, number> = { high_value: 0, on_track: 0, needs_support: 0, getting_started: 0, no_data: 0 };
  for (const row of rows) counts[row.health] += 1;
  return counts;
}
