import type { CSSProperties } from "react";
import { Easing } from "remotion";

/* Les mouvements de l'interface du site, en fonction du temps (secondes du film) : le ressort de l'île
 * (560 ms, cubic-bezier(.3,1.45,.5,1), island-shell.tsx), l'entrée du contenu (.32 s, flou de 4 px), les lignes
 * qui glissent, les pastilles qui sautent (ISLAND_CSS). */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Le ressort de l'île : un léger dépassement puis le retour. */
export const ISLAND_SPRING = Easing.bezier(0.3, 1.45, 0.5, 1);
export const ISLAND_MS = 0.56;
const IN_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const POP_EASE = Easing.bezier(0.3, 1.5, 0.5, 1);
export const SITE_EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 → 1 entre `at` et `at + dur`, avec une courbe. */
export function ramp(t: number, at: number, dur: number, ease: (x: number) => number = IN_OUT) {
  return ease(clamp01((t - at) / dur));
}

/**
 * Une valeur qui change par étapes et rejoint chaque nouvelle cible en ressort (la largeur, la hauteur de l'île) ;
 * une cible qui arrive pendant un mouvement part de la valeur du moment, comme une transition CSS.
 */
export function animate(t: number, keys: { t: number; v: number }[], dur = ISLAND_MS, ease: (x: number) => number = ISLAND_SPRING): number {
  if (keys.length === 0) return 0;
  let from = keys[0].v;
  let to = keys[0].v;
  let start = keys[0].t;
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i].t) break;
    const k = keys[i];
    // La valeur au moment où la nouvelle cible arrive.
    const p = clamp01((k.t - start) / dur);
    from = from + (to - from) * ease(p);
    to = k.v;
    start = k.t;
  }
  if (t < keys[0].t) return keys[0].v;
  return from + (to - from) * ease(clamp01((t - start) / dur));
}

/** L'étape en cours dans une liste d'étapes datées (la dernière commencée), et son début. */
export function current<T extends { t: number }>(t: number, list: T[]): T {
  let found = list[0];
  for (const item of list) if (item.t <= t) found = item;
  return found;
}

/** L'entrée du contenu de l'île (`isl-in`) : fondu, 4 px de montée, léger zoom, flou de 4 px, après 60 ms. */
export function islIn(t: number, at: number): CSSProperties {
  const p = IN_EASE(clamp01((t - at - 0.06) / 0.32));
  if (p >= 1) return {};
  return { opacity: p, transform: `translateY(${(1 - p) * 4}px) scale(${0.985 + 0.015 * p})`, filter: `blur(${(1 - p) * 4}px)` };
}

/** Une ligne qui arrive (`isl-line`) : 6 px de glissement, 0,28 s. */
export function islLine(t: number, at: number): CSSProperties {
  const p = clamp01((t - at) / 0.28);
  const e = 1 - Math.pow(1 - p, 2);
  if (p >= 1) return {};
  return { opacity: e, transform: `translateX(${(1 - e) * -6}px)` };
}

/** Une pastille qui saute (`isl-pop`) : 0,42 s, 0,6 → 1,12 → 1. */
export function islPop(t: number, at: number): CSSProperties {
  const p = clamp01((t - at) / 0.42);
  if (p >= 1) return {};
  const scale = p < 0.6 ? 0.6 + (1.12 - 0.6) * POP_EASE(p / 0.6) : 1.12 - 0.12 * ((p - 0.6) / 0.4);
  return { opacity: Math.min(1, p / 0.6), transform: `scale(${scale})` };
}

/** Un halo doux quand la voix nomme un élément : monte en 0,15 s, tient, s'efface en 0,5 s. */
export function halo(t: number, at: number, hold = 0.75) {
  if (t < at) return 0;
  const up = clamp01((t - at) / 0.15);
  const down = 1 - clamp01((t - at - 0.15 - hold) / 0.5);
  return Math.min(up, down);
}

/** Un clic : le bouton s'enfonce un instant. */
export function press(t: number, at: number) {
  const d = t - at;
  if (d < -0.06 || d > 0.18) return 0;
  return d < 0 ? (d + 0.06) / 0.06 : 1 - d / 0.18;
}
