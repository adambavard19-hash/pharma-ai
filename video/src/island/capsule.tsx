import type { CSSProperties, ReactNode } from "react";
import { Easing } from "remotion";

/* ==========================================================================
 * LA CAPSULE DE L'ÎLE, pour la vidéo (src/components/island/island-shell.tsx, image par image).
 *
 * Un ruban noir (#0B0F14), très arrondi, qui change de taille en RESSORT : largeur, hauteur et arrondi suivent
 * `cubic-bezier(.3,1.45,.5,1)` en 560 ms — la courbe du site, avec son léger dépassement. Le liseré et la lueur
 * (TONE_RING) disent l'état. Le contenu change en fondu court (0,32 s, flou de 4 px, après 60 ms).
 *
 * Remotion ne mesure rien : chaque état de l'île donne sa largeur ET sa hauteur (les cotes des classes Tailwind du
 * site, recalculées), et `keyed()` rejoue les transitions d'un état à l'autre — une transition interrompue repart de
 * là où elle en était, comme une transition CSS.
 * ======================================================================== */

export const ISLAND_BG = "#0B0F14";
export type Tone = "neutral" | "accent" | "warning" | "success";

/** Les liserés et lueurs du site (TONE_RING), en nombres pour les fondre l'un dans l'autre. */
const RING: Record<Tone, { w: number; c: [number, number, number, number]; blur: number; spread: number; g: [number, number, number, number] }> = {
  neutral: { w: 1, c: [255, 255, 255, 0.07], blur: 28, spread: -6, g: [255, 255, 255, 0] },
  accent: { w: 1, c: [54, 232, 200, 0.35], blur: 28, spread: -6, g: [54, 232, 200, 0.45] },
  warning: { w: 1.5, c: [245, 166, 35, 0.75], blur: 32, spread: -6, g: [245, 166, 35, 0.55] },
  success: { w: 1, c: [34, 200, 143, 0.6], blur: 30, spread: -6, g: [34, 200, 143, 0.55] },
};

const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const rgbaOf = (c: number[]) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})`;

/** Le liseré et la lueur entre deux tons (p de 0 à 1), plus l'ombre portée de l'île. */
export function ringShadow(from: Tone, to: Tone, p: number, extra = 1): string {
  const a = RING[from];
  const b = RING[to];
  const q = Math.max(0, Math.min(1, p));
  const c = a.c.map((v, i) => mix(v, b.c[i], q));
  const g = a.g.map((v, i) => mix(v, b.g[i], q));
  g[3] *= extra;
  return `0 0 0 ${mix(a.w, b.w, q)}px ${rgbaOf(c)}, 0 0 ${mix(a.blur, b.blur, q) * (0.8 + 0.2 * extra)}px ${mix(a.spread, b.spread, q)}px ${rgbaOf(g)}, 0 18px 40px -14px rgba(0,0,0,0.55)`;
}

/** La courbe du ressort de l'île (island-shell.tsx) et sa durée. */
export const SPRING = Easing.bezier(0.3, 1.45, 0.5, 1);
export const SPRING_S = 0.56;
/** L'entrée du contenu (isl-in) : 0,32 s, cubic-bezier(.2,.8,.2,1), après 60 ms. */
export const CONTENT_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

export type Keyed<S> = { at: number; state: S };

/** L'état en cours à l'instant t (le dernier commencé) et son indice. */
export function current<S>(keys: Keyed<S>[], t: number): { index: number; key: Keyed<S> } {
  let index = 0;
  for (let i = 0; i < keys.length; i++) if (keys[i].at <= t) index = i;
  return { index, key: keys[index] };
}

/**
 * Une valeur qui suit les états en ressort (comme une transition CSS de 560 ms) : chaque changement part de la
 * valeur atteinte à cet instant.
 */
export function keyed<S>(keys: Keyed<S>[], t: number, get: (s: S) => number, dur = SPRING_S, ease: (x: number) => number = SPRING): number {
  const { index } = current(keys, t);
  let from = get(keys[0].state);
  let target = from;
  for (let i = 1; i <= index; i++) {
    const prevTarget = get(keys[i - 1].state);
    const prevFrom = i - 1 === 0 ? prevTarget : from;
    const prevAt = keys[i - 1].at;
    const reached = i - 1 === 0 ? prevTarget : mix(prevFrom, prevTarget, ease(Math.max(0, Math.min(1, (keys[i].at - prevAt) / dur))));
    from = reached;
    target = get(keys[i].state);
  }
  if (index === 0) return target;
  return mix(from, target, ease(Math.max(0, Math.min(1, (t - keys[index].at) / dur))));
}

/** L'arrondi du site : 999 tant que l'île est basse, 28 au-delà de 64 px de haut — transition de 999 à 28 comprise. */
export function islandRadius<S>(keys: Keyed<S>[], t: number, heightOf: (s: S) => number, w: number, h: number): number {
  const r = keyed(keys, t, (s) => (heightOf(s) > 64 ? 28 : 999));
  return Math.max(0, Math.min(r, w / 2, h / 2));
}

/** Le ton : fondu linéaire de 560 ms entre l'ancien et le nouveau (les couleurs ne dépassent pas). */
export function toneAt<S>(keys: Keyed<S>[], t: number, toneOf: (s: S) => Tone): { from: Tone; to: Tone; p: number } {
  const { index, key } = current(keys, t);
  const to = toneOf(key.state);
  if (index === 0) return { from: to, to, p: 1 };
  const from = toneOf(keys[index - 1].state);
  return { from, to, p: Math.max(0, Math.min(1, (t - key.at) / SPRING_S)) };
}

/** L'entrée du contenu (isl-in) : opacité, petite montée, flou de 4 px. `local` en secondes depuis le changement. */
export function contentIn(local: number): CSSProperties {
  const k = CONTENT_EASE(Math.max(0, Math.min(1, (local - 0.06) / 0.32)));
  if (k >= 1) return {};
  return { opacity: k, transform: `translateY(${(1 - k) * 4}px) scale(${0.985 + 0.015 * k})`, filter: k < 1 ? `blur(${(1 - k) * 4}px)` : undefined };
}

/** L'apparition d'une ligne (isl-line) : 0,28 s, de la gauche. */
export function lineIn(local: number, delay = 0): CSSProperties {
  const k = Math.max(0, Math.min(1, (local - delay) / 0.28));
  const e = 1 - Math.pow(1 - k, 2);
  if (k >= 1) return {};
  return { opacity: e, transform: `translateX(${(1 - e) * -6}px)` };
}

/** Le « pop » d'une pastille (isl-pop) : 0,42 s, cubic-bezier(.3,1.5,.5,1), de 0,6 à 1,12 puis 1. */
export function popIn(local: number, delay = 0): CSSProperties {
  const k = Math.max(0, Math.min(1, (local - delay) / 0.42));
  if (k >= 1) return {};
  const s = k < 0.6 ? 0.6 + (1.12 - 0.6) * (k / 0.6) : 1.12 - 0.12 * ((k - 0.6) / 0.4);
  return { opacity: Math.min(1, k / 0.6), transform: `scale(${s})` };
}

/**
 * La capsule elle-même, à l'échelle du site (pixels de l'île) : `zoom` l'agrandit pour l'image, depuis le milieu de
 * son bord haut. Posée au centre `cx`, bord haut `top`.
 */
export function IslandShell({ cx, top, zoom, width, height, radius, shadow, children, style }: { cx: number; top: number; zoom: number; width: number; height: number; radius: number; shadow: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: cx - width / 2, top, width, height, transform: `scale(${zoom})`, transformOrigin: "50% 0", ...style }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, background: ISLAND_BG, boxShadow: shadow, color: "#fff" }}>{children}</div>
    </div>
  );
}
