import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Fusionne des classes Tailwind en résolvant les conflits. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Retire les accents pour la recherche insensible aux diacritiques. */
export function deburr(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Normalise une chaîne pour la comparaison (recherche, tri). */
export function normalizeForSearch(value: string): string {
  return deburr(value.toLowerCase().trim());
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.at(0) ?? ""}${lastName.at(0) ?? ""}`.toUpperCase();
}

/** Génère une référence lisible : `PAT-0007`. */
export function formatReference(prefix: string, sequence: number, pad = 4): string {
  return `${prefix}-${String(sequence).padStart(pad, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Découpe un tableau en lots de taille fixe. */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

export function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((acc, item) => acc + value(item), 0);
}

/** Variation en pourcentage entre deux périodes. `null` si base nulle. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
