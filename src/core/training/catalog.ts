import { brandKey as normalizeText } from "@/core/catalog/brand";
import { universeLabel } from "@/config/universes";
import { isTrainingStatus, type TrainingStatusCode } from "./progress";

/**
 * Chercher, filtrer et ordonner le catalogue de formation d'une personne.
 *
 * La recherche ignore la casse et les accents (« preparateur » trouve
 * « Préparateur »), et cherche dans le titre, le résumé, le laboratoire, la
 * marque, la gamme et l'univers. Quand on cherche, un titre qui commence par
 * le mot cherché passe devant ; sinon, ce qu'on a commencé d'abord, puis ce
 * qui reste à faire, puis ce qui est terminé — les plus récents en tête.
 */

export type CatalogItem = {
  id: string;
  title: string;
  summary: string | null;
  laboratory: string | null;
  brandKey: string | null;
  rangeName: string | null;
  universe: string | null;
  status: TrainingStatusCode;
  updatedAt: Date;
};

export type CatalogFilters = {
  q?: string | null;
  laboratory?: string | null;
  universe?: string | null;
  status?: string | null;
};

function normalize(value: string | null | undefined): string {
  return value ? normalizeText(value) : "";
}

/** 3 : le titre commence par la recherche ; 2 : le titre la contient ; 1 : un autre champ ; 0 : rien. */
export function searchScore(item: CatalogItem, query: string): number {
  const needle = normalize(query);
  if (!needle) return 1;
  const title = normalize(item.title);
  if (title.startsWith(needle) || title.split(" ").some((word) => word.startsWith(needle))) return 3;
  if (title.includes(needle)) return 2;
  const rest = [item.summary, item.laboratory, item.brandKey, item.rangeName, item.universe ? universeLabel(item.universe) : null].map(normalize);
  return rest.some((field) => field.includes(needle)) ? 1 : 0;
}

const STATUS_ORDER: Record<TrainingStatusCode, number> = { IN_PROGRESS: 0, TODO: 1, DONE: 2 };

export function filterCatalog<T extends CatalogItem>(items: T[], filters: CatalogFilters): T[] {
  const query = filters.q?.trim() ?? "";
  const laboratory = normalize(filters.laboratory);
  const universe = filters.universe?.trim() || null;
  const status = filters.status && isTrainingStatus(filters.status) ? filters.status : null;

  const scored = items
    .map((item) => ({ item, score: query ? searchScore(item, query) : 1 }))
    .filter(({ item, score }) => {
      if (score === 0) return false;
      if (laboratory && normalize(item.laboratory) !== laboratory) return false;
      if (universe && item.universe !== universe) return false;
      if (status && item.status !== status) return false;
      return true;
    });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      STATUS_ORDER[a.item.status] - STATUS_ORDER[b.item.status] ||
      b.item.updatedAt.getTime() - a.item.updatedAt.getTime() ||
      a.item.title.localeCompare(b.item.title, "fr"),
  );
  return scored.map(({ item }) => item);
}

/** Les valeurs proposées dans les filtres : seulement celles qui existent dans le catalogue. */
export function catalogFacets(items: CatalogItem[]): { laboratories: string[]; universes: string[] } {
  const laboratories = new Map<string, string>();
  const universes = new Set<string>();
  for (const item of items) {
    const label = item.laboratory?.trim();
    if (label && !laboratories.has(normalize(label))) laboratories.set(normalize(label), label);
    if (item.universe) universes.add(item.universe);
  }
  return {
    laboratories: [...laboratories.values()].sort((a, b) => a.localeCompare(b, "fr")),
    universes: [...universes].sort((a, b) => universeLabel(a).localeCompare(universeLabel(b), "fr")),
  };
}
