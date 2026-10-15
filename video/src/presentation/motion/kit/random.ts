/* ==========================================================================
 * HASARD DÉTERMINISTE — jamais Math.random ni Date : chaque rendu est identique.
 *
 *   mulberry32(seed)()        générateur à graine (suite de nombres dans [0, 1))
 *   hash(seed, i)             un nombre dans [0, 1) pour l'élément i (seed nombre ou texte)
 *   rnd(seed, i, min, max)    pareil, entre min et max
 *   pick(seed, i, list)       un élément de la liste
 *   seedOf("confettis-S9")    texte → graine numérique
 *
 * Pour un mouvement continu au hasard : noise2D de @remotion/noise (noise2D("cam", t * .15, 0)).
 * ======================================================================== */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(s: string | number): number {
  if (typeof s === "number") return s >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash(seed: string | number, i: number): number {
  return mulberry32((seedOf(seed) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)();
}

export const rnd = (seed: string | number, i: number, min = 0, max = 1) => min + (max - min) * hash(seed, i);

export const pick = <T,>(seed: string | number, i: number, list: readonly T[]): T => list[Math.floor(hash(seed, i) * list.length) % list.length];
