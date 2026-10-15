import { Easing, spring } from "remotion";

/* ==========================================================================
 * COURBES ET TEMPS — tout en SECONDES du film (t), jamais en images.
 *
 *   SNAP(x) POP(x) IN_OUT(x) WHIP(x) EXIT(x)      courbes de la direction
 *   F                                            une image = 1/60 s (6*F = 6 images)
 *   prog(t, at, dur, ease = SNAP)                0 → 1 entre at et at + dur (borné)
 *   tween(t, at, dur, from, to, ease = SNAP)     valeur de from à to
 *   keys(t, [[t0, v0], [t1, v1, ease?], …])      images clés (ease de la clé d'ARRIVÉE, SNAP par défaut)
 *   ressort(t, at, cfg?)                         RESSORT (damping 12, stiffness 220, mass .6), 0 → 1 avec dépassement
 *   pulse(t, at, up, hold, down)                 0 → 1 → 0 (halo, flash)
 *   squash(t, at, dur = 5F)                      écrasement d'impact : { sx, sy } (0,78 / 1,18 puis rebond)
 *   flight(v)                                    étirement en vol selon la vitesse normalisée 0..1 : { sx, sy }
 *   anticip(t, at, dur = 5F, amount = .05)       recul d'anticipation avant un départ (0 → -amount → 0)
 *   wobble(t, seed, amp, speed)                  flottement continu au bruit (vie permanente)
 *
 * Exemple : const k = prog(t, time.A("P1", 0), 18 * F);  style={{ transform: `translateY(${(1 - k) * 110}%)` }}
 * ======================================================================== */

export const SNAP = Easing.bezier(0.16, 1, 0.3, 1);
export const POP = Easing.bezier(0.3, 1.45, 0.5, 1);
export const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const WHIP = Easing.bezier(0.7, 0, 0.2, 1);
export const EXIT = Easing.bezier(0.7, 0, 0.84, 0);
export const LINEAR = (x: number) => x;

export const FPS = 60;
/** Une image, en secondes. */
export const F = 1 / FPS;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mix2 = (a: [number, number], b: [number, number], k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** 0 → 1 entre `at` et `at + dur`, borné, avec une courbe. dur ≤ 0 : saut net à `at`. */
export function prog(t: number, at: number, dur: number, ease: (x: number) => number = SNAP) {
  if (dur <= 0) return t >= at ? 1 : 0;
  return ease(clamp01((t - at) / dur));
}

/** De `from` à `to` entre `at` et `at + dur`. */
export function tween(t: number, at: number, dur: number, from: number, to: number, ease: (x: number) => number = SNAP) {
  return lerp(from, to, prog(t, at, dur, ease));
}

/** Images clés : [[t0, v0], [t1, v1, ease?], …] ; la courbe d'un segment est celle de sa clé d'arrivée. Bornée aux extrémités. */
export function keys(t: number, k: ([number, number] | [number, number, (x: number) => number])[]) {
  if (k.length === 0) return 0;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1, e] = k[i];
    const [t0, v0] = k[i - 1];
    if (t < t1) return lerp(v0, v1, (e ?? SNAP)(clamp01((t - t0) / Math.max(1e-6, t1 - t0))));
  }
  return k[k.length - 1][1];
}

/** Le RESSORT de la direction (damping 12, stiffness 220, mass .6) : 0 avant `at`, puis 0 → ~1,1 → 1. */
export function ressort(t: number, at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  if (t < at) return 0;
  return spring({ frame: (t - at) * FPS, fps: FPS, config: { damping: 12, stiffness: 220, mass: 0.6, ...config } });
}

/** 0 → 1 en `up`, tient `hold`, 1 → 0 en `down` (secondes). */
export function pulse(t: number, at: number, up = 0.08, hold = 0, down = 0.3) {
  if (t < at) return 0;
  const a = up <= 0 ? 1 : clamp01((t - at) / up);
  const b = 1 - (down <= 0 ? (t >= at + up + hold ? 1 : 0) : clamp01((t - at - up - hold) / down));
  return Math.min(a, b);
}

/** Écrasement d'impact : 0,78 / 1,18 au contact, rebond amorti en `dur` (5 images par défaut, puis petite oscillation). */
export function squash(t: number, at: number, dur = 5 * F) {
  if (t < at) return { sx: 1, sy: 1 };
  const u = (t - at) / dur;
  if (u > 4) return { sx: 1, sy: 1 };
  const k = Math.exp(-1.6 * u) * Math.cos(Math.PI * 0.5 * u);
  return { sx: 1 + 0.18 * k, sy: 1 - 0.22 * k };
}

/** Étirement en vol : v de 0 (immobile) à 1 (pleine vitesse) → scaleY 1,25 / scaleX 0,85. */
export function flight(v: number) {
  const k = clamp01(Math.abs(v));
  return { sx: 1 - 0.15 * k, sy: 1 + 0.25 * k };
}

/** Anticipation : recul (−amount) pendant `dur` avant `at`, puis retour à 0 au départ. Multiplier une échelle par 1 + anticip(). */
export function anticip(t: number, at: number, dur = 5 * F, amount = 0.05) {
  if (t < at - dur || t > at + 3 * F) return 0;
  if (t < at) return -amount * IN_OUT(clamp01((t - (at - dur)) / dur));
  return -amount * (1 - clamp01((t - at) / (3 * F)));
}

/** Vie permanente : une oscillation douce et non périodique (sinus mêlés à graine), de −amp à +amp. */
export function wobble(t: number, seed = 1, amp = 4, speed = 1) {
  const s = seed * 1.618;
  return amp * 0.5 * (Math.sin(t * speed * 1.7 + s) + Math.sin(t * speed * 1.13 + s * 2.3) * 0.8) / 0.9;
}
