/** Chaque couleur devient « var(--isl-<nom>, <couleur>) » : un parent peut la changer, sinon elle reste la même. */
export function islandTheme<T extends Record<string, string | number>>(colors: T): { [K in keyof T]: T[K] extends string ? string : T[K] } {
  return Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, typeof value === "string" ? `var(--isl-${key}, ${value})` : value])) as never;
}
