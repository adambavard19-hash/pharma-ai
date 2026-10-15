import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";

/* ==========================================================================
 * CAMÉRA VIRTUELLE — un seul plan 1920×1080 qu'on déplace, zoome, tourne et secoue.
 *
 *   <Camera t x y zoom rot origin drift shakes depth blur>…monde…</Camera>
 *     x, y      déplacement du MONDE en px (x = −200 : le monde glisse à gauche = la caméra va à droite)
 *     zoom      1 = cadre normal ; le pivot est `origin` (défaut [960, 540]) — ce point reste fixe à l'écran
 *     rot       rotation en degrés autour de `origin`
 *     drift     dérive au bruit (noise2D « cam », t·0,15) : 1 = ±6 px et ±0,4° (défaut), 0 = immobile
 *     shakes    secousses amorties : [{ at, amp = 10, frames = 12 }] → amp·e^(−4u)·sin(2π·6u) sur x et y déphasés
 *     depth     parallaxe : 1 = caméra pleine ; 0,3 = couche lointaine (déplacements ×0,3, zoom 1 + (zoom−1)·0,3) ; 1,6 = avant-plan
 *     blur      flou de profondeur en px (couche lointaine 6, milieu 2, avant 3)
 *
 *   Un même objet caméra pour toutes les couches :
 *     const cam = { x: 0, y: 0, zoom: tween(t, a, .9, 1, 1.03), shakes: [{ at: boom, amp: 12 }] };
 *     <Camera t={t} {...cam} depth={0.3} blur={6}>{arrière}</Camera>
 *     <Camera t={t} {...cam}>{monde}</Camera>
 *     <Camera t={t} {...cam} depth={0.3}>{HUD}</Camera>      // HUD hors caméra avec 0,3 de parallaxe
 *
 *   shake(t, at, amp, frames) → { x, y }   la secousse seule, pour l'appliquer à un objet
 *   cameraTransform(t, props) → string      la transformation CSS seule (pour un <g> SVG ou un style)
 * ======================================================================== */

export type Shake = { at: number; amp?: number; frames?: number };

export type CameraProps = {
  t: number;
  x?: number;
  y?: number;
  zoom?: number;
  rot?: number;
  origin?: [number, number];
  drift?: number;
  shakes?: Shake[];
  depth?: number;
  blur?: number;
  style?: CSSProperties;
  children?: ReactNode;
};

export function shake(t: number, at: number, amp = 10, frames = 12) {
  const dur = frames / 60;
  const u = (t - at) / dur;
  if (u < 0 || u > 1.6) return { x: 0, y: 0 };
  const e = amp * Math.exp(-4 * u);
  return { x: e * Math.sin(2 * Math.PI * 6 * u), y: e * Math.sin(2 * Math.PI * 6 * u + 1.9) * 0.8 };
}

export function cameraTransform(t: number, { x = 0, y = 0, zoom = 1, rot = 0, origin = [960, 540], drift = 1, shakes = [], depth = 1 }: Omit<CameraProps, "t" | "children" | "style" | "blur">) {
  let sx = 0;
  let sy = 0;
  for (const s of shakes) {
    const o = shake(t, s.at, s.amp, s.frames);
    sx += o.x;
    sy += o.y;
  }
  const dx = drift * 6 * noise2D("cam", t * 0.15, 0);
  const dy = drift * 6 * noise2D("cam", 0, t * 0.15 + 7.3);
  const dr = drift * 0.4 * noise2D("cam-rot", t * 0.15, 3.1);
  const X = (x + dx + sx) * depth;
  const Y = (y + dy + sy) * depth;
  const Z = 1 + (zoom - 1) * depth;
  const R = (rot + dr) * depth;
  const [ox, oy] = origin;
  return `translate(${X.toFixed(2)}px, ${Y.toFixed(2)}px) translate(${ox}px, ${oy}px) rotate(${R.toFixed(3)}deg) scale(${Z.toFixed(4)}) translate(${-ox}px, ${-oy}px)`;
}

export function Camera({ t, blur = 0, style, children, ...rest }: CameraProps) {
  return (
    <AbsoluteFill style={{ transformOrigin: "0 0", transform: cameraTransform(t, rest), filter: blur > 0 ? `blur(${blur}px)` : undefined, ...style }}>
      {children}
    </AbsoluteFill>
  );
}
