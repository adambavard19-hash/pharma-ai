import type { CSSProperties } from "react";
import { noise2D } from "@remotion/noise";
import { EXIT, SNAP, clamp01, prog } from "./ease";
import { PB } from "./palette";
import { hash, rnd } from "./random";

/* ==========================================================================
 * PARTICULES — sans état : chaque position est une fonction analytique du temps, à graine fixe.
 *
 * Physique :
 *   ballistic(u, { x0, y0, vx, vy, g = 2400, drag = 0 }) → { x, y, vx, vy }   (u = secondes depuis le départ)
 *      x = x0 + vx·u ; y = y0 + vy·u + ½g·u² (drag > 0 : freinage exponentiel analytique)
 *
 * Composants (positions en px du cadre 1920×1080, `at` en secondes du film) :
 *   <Confetti t at x y count=80 seed power=1600 spread=70 angle=-90 gravity=900 colors? life=2.6 />
 *        rectangles et serpentins qui tournent en 3D, étirés selon leur vitesse, freinés par l'air (chute lente ≈ 350 px/s) ; angle −90 = vers le haut,
 *        spread = demi-ouverture en degrés (canon gauche : angle −60 ; canon droit : angle −120)
 *   <Sparks t at x y count=24 seed speed=900 spread=180 angle=-90 color len=26 life=.5 />   étincelles en traits
 *   <Burst t at x y count=16 radius=240 seed colors size=14 life=.5 />                       gerbe ronde (pop)
 *   <Ring t at x y max=520 color width=4 life=.55 echo=true />                               onde de choc
 *   <Dust t count=40 seed area={[x, y, w, h]} color size={[1, 3]} alpha=.25 speed=.06 />    poussière qui dérive (noise2D)
 *   <Converge t at dur=.8 x y count=30 seed radius=420 color />                               étincelles qui convergent vers (x, y)
 *   <Coins t at x y count=12 seed power=1300 />                                               pièces dorées qui sautent et retombent
 * ======================================================================== */

export function ballistic(u: number, { x0, y0, vx, vy, g = 2400, drag = 0 }: { x0: number; y0: number; vx: number; vy: number; g?: number; drag?: number }) {
  if (drag <= 0) return { x: x0 + vx * u, y: y0 + vy * u + 0.5 * g * u * u, vx, vy: vy + g * u };
  // Freinage linéaire : dv/dt = −k·v + g (solution analytique).
  const k = drag;
  const e = Math.exp(-k * u);
  const vt = g / k;
  const x = x0 + (vx / k) * (1 - e);
  const y = y0 + vt * u + ((vy - vt) / k) * (1 - e);
  return { x, y, vx: vx * e, vy: vt + (vy - vt) * e };
}

const DEFAULT_CONFETTI = [PB.mint, PB.mint2, PB.gold, PB.goldHi, "#FFFFFF", PB.stock];

export function Confetti({ t, at, x, y, count = 80, seed = "confetti", power = 1600, spread = 70, angle = -90, gravity = 900, colors = DEFAULT_CONFETTI, life = 2.6, size = 1 }: { t: number; at: number; x: number; y: number; count?: number; seed?: string; power?: number; spread?: number; angle?: number; gravity?: number; colors?: string[]; life?: number; size?: number }) {
  const u = t - at;
  if (u < 0 || u > life) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = ((angle + (hash(seed, i) * 2 - 1) * spread) * Math.PI) / 180;
        const v = power * (0.45 + 0.55 * hash(seed, i + 1000));
        const p = ballistic(u, { x0: x, y0: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, drag: 2.6 });
        const ribbon = hash(seed, i + 2000) < 0.25;
        const w = (ribbon ? 6 : 12 + hash(seed, i + 3000) * 8) * size;
        const h = (ribbon ? 34 : 7 + hash(seed, i + 4000) * 6) * size;
        const spin = (hash(seed, i + 5000) - 0.5) * 1400;
        const flip = 400 + hash(seed, i + 6000) * 900;
        const sway = Math.sin(u * (4 + hash(seed, i + 7000) * 4) + i) * 30 * clamp01(u * 2);
        const speed = Math.hypot(p.vx, p.vy);
        const stretch = 1 + Math.min(1.2, speed / 1800);
        const fade = 1 - clamp01((u - (life - 0.5)) / 0.5);
        const style: CSSProperties = {
          position: "absolute",
          left: p.x + sway - w / 2,
          top: p.y - h / 2,
          width: w,
          height: h * stretch,
          borderRadius: ribbon ? 3 : 2,
          background: colors[i % colors.length],
          opacity: fade,
          transform: `rotate(${spin * u + (Math.atan2(p.vy, p.vx) * 180) / Math.PI * 0.2}deg) rotateX(${flip * u}deg) rotateY(${flip * 0.6 * u}deg)`,
        };
        return <div key={i} style={style} />;
      })}
    </>
  );
}

export function Sparks({ t, at, x, y, count = 24, seed = "sparks", speed = 900, spread = 180, angle = -90, color = PB.mint2, len = 26, life = 0.5, width = 3 }: { t: number; at: number; x: number; y: number; count?: number; seed?: string; speed?: number; spread?: number; angle?: number; color?: string; len?: number; life?: number; width?: number }) {
  const u = t - at;
  if (u < 0 || u > life) return null;
  const k = u / life;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = ((angle + (hash(seed, i) * 2 - 1) * spread) * Math.PI) / 180;
        const v = speed * (0.5 + 0.5 * hash(seed, i + 99));
        const p = ballistic(u, { x0: x, y0: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 3 });
        const dir = Math.atan2(p.vy, p.vx);
        const l = len * (1 - k) * (0.6 + 0.4 * hash(seed, i + 7));
        return <div key={i} style={{ position: "absolute", left: p.x - l, top: p.y - width / 2, width: l, height: width, borderRadius: width, background: `linear-gradient(90deg, transparent, ${color})`, transformOrigin: "100% 50%", transform: `rotate(${(dir * 180) / Math.PI}deg)`, opacity: 1 - k * k, boxShadow: `0 0 8px ${color}` }} />;
      })}
    </>
  );
}

export function Burst({ t, at, x, y, count = 16, radius = 240, seed = "burst", colors = [PB.mint, PB.gold, "#FFFFFF"], size = 14, life = 0.5 }: { t: number; at: number; x: number; y: number; count?: number; radius?: number; seed?: string; colors?: string[]; size?: number; life?: number }) {
  const u = t - at;
  if (u < 0 || u > life) return null;
  const p = SNAP(u / life);
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const ang = (k / count) * Math.PI * 2 + hash(seed, k) * 0.4;
        const r = radius * (0.6 + 0.4 * hash(seed, k + 50)) * p;
        const s = size * (1 - 0.7 * p) * (0.7 + 0.5 * hash(seed, k + 90));
        return <div key={k} style={{ position: "absolute", left: x + Math.cos(ang) * r - s / 2, top: y + Math.sin(ang) * r - s / 2 + 40 * p * p, width: s, height: s, borderRadius: k % 4 === 0 ? 3 : "50%", background: colors[k % colors.length], opacity: 1 - p * p }} />;
      })}
    </>
  );
}

export function Ring({ t, at, x, y, max = 520, color = PB.mint, width = 4, life = 0.55, echo = true }: { t: number; at: number; x: number; y: number; max?: number; color?: string; width?: number; life?: number; echo?: boolean }) {
  const u = t - at;
  if (u < 0 || u > life + 0.1) return null;
  return (
    <>
      {(echo ? [0, 0.1] : [0]).map((d) => {
        const p = prog(t, at + d, life, SNAP);
        if (p <= 0 || p >= 1) return null;
        const s = max * p;
        return <div key={d} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", border: `${width * (1 - p * 0.6)}px solid ${color}`, opacity: (1 - p) * 0.9 }} />;
      })}
    </>
  );
}

export function Dust({ t, count = 40, seed = "dust", area = [0, 0, 1920, 1080], color = "#FFFFFF", size = [1, 3], alpha = 0.25, speed = 0.06 }: { t: number; count?: number; seed?: string; area?: [number, number, number, number]; color?: string; size?: [number, number]; alpha?: number; speed?: number }) {
  const [ax, ay, aw, ah] = area;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = ax + (noise2D(`${seed}x`, i * 0.37, t * speed) * 0.5 + 0.5) * aw;
        const y = ay + (noise2D(`${seed}y`, i * 0.61, t * speed) * 0.5 + 0.5) * ah;
        const s = rnd(seed, i, size[0], size[1]);
        const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash(seed, i + 9) * 2) + i);
        return <div key={i} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", background: color, opacity: alpha * tw }} />;
      })}
    </>
  );
}

export function Converge({ t, at, dur = 0.8, x, y, count = 30, seed = "conv", radius = 420, color = PB.mint2, size = 4 }: { t: number; at: number; dur?: number; x: number; y: number; count?: number; seed?: string; radius?: number; color?: string; size?: number }) {
  if (t < at || t > at + dur + 0.05) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const delay = hash(seed, i) * dur * 0.35;
        const k = prog(t, at + delay, dur - delay, EXIT);
        if (k >= 1) return null;
        const a = hash(seed, i + 40) * Math.PI * 2;
        const r = radius * (0.5 + 0.5 * hash(seed, i + 80)) * (1 - k);
        const swirl = a + k * 1.2;
        const px = x + Math.cos(swirl) * r;
        const py = y + Math.sin(swirl) * r;
        const l = size * (1 + 6 * k);
        return <div key={i} style={{ position: "absolute", left: px - l / 2, top: py - size / 2, width: l, height: size, borderRadius: size, background: color, boxShadow: `0 0 10px ${color}`, transform: `rotate(${(swirl * 180) / Math.PI + 90}deg)`, opacity: clamp01((t - at - delay) / 0.08) }} />;
      })}
    </>
  );
}

export function Coins({ t, at, x, y, count = 12, seed = "coins", power = 1300, size = 44 }: { t: number; at: number; x: number; y: number; count?: number; seed?: string; power?: number; size?: number }) {
  const u = t - at;
  if (u < 0 || u > 1.6) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = ((-90 + (hash(seed, i) * 2 - 1) * 55) * Math.PI) / 180;
        const v = power * (0.55 + 0.45 * hash(seed, i + 10));
        const p = ballistic(u, { x0: x, y0: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 3200 });
        const flip = Math.cos(u * (14 + hash(seed, i + 20) * 10));
        const fade = 1 - clamp01((u - 1.2) / 0.4);
        return (
          <div key={i} style={{ position: "absolute", left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #FFF6D6, ${PB.goldHi} 35%, ${PB.gold} 65%, ${PB.goldLo})`, border: `2px solid ${PB.goldLo}`, transform: `scaleX(${Math.max(0.12, Math.abs(flip))})`, opacity: fade, boxShadow: "0 6px 14px rgba(0,0,0,.35)" }} />
        );
      })}
    </>
  );
}
