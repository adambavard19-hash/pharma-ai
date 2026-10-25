import type { CSSProperties } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { clamp01, prog, SNAP, EXIT } from "../../presentation/motion/kit/ease";
import { rnd } from "../../presentation/motion/kit/random";
import { PB, rgba } from "./brand";

/* ==========================================================================
 * LUMIÈRE ET MATIÈRE — repris du film « Le Garnier », couleurs PharmaBoost. Tout est fonction du temps du film `t` (s).
 *
 * <LightLeak t at dur color? x? y? size? />     fuite de lumière chaude qui traverse l'image (transition, éclat)
 * <SunFlare t x y size? strength? />            halo de soleil qui respire (coin haut, terrasse)
 * <Steam t x y w? h? count? seed? alpha? />     volutes de vapeur qui montent (plat chaud) — bruit, sans état
 * <Bokeh t count? seed? colors? alpha? area? /> taches de lumière floues qui dérivent (soirée, bar)
 * <Flash t at dur? color? max? />               éclair plein cadre (coup de flash, impact)
 * <WipeBar t at dur color dir? angle? />        bande de couleur qui balaie le cadre (transition graphique)
 * <Sparkle t at x y size? color? />             étincelle en étoile à 4 branches qui pulse (accent)
 * ======================================================================== */

export function LightLeak({ t, at, dur = 1.2, color = PB.citron, x = 0.15, y = 0.2, size = 1.1 }: { t: number; at: number; dur?: number; color?: string; x?: number; y?: number; size?: number }) {
  const k = (t - at) / dur;
  if (k < 0 || k > 1) return null;
  const a = Math.sin(Math.PI * k);
  const cx = (x + k * 0.7) * 100;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: a * 0.85,
        background: `radial-gradient(ellipse ${size * 60}% ${size * 80}% at ${cx}% ${y * 100}%, ${rgba(color, 0.9)} 0%, ${rgba(PB.gold, 0.45)} 35%, transparent 70%)`,
      }}
    />
  );
}

export function SunFlare({ t, x, y, size = 900, strength = 0.55 }: { t: number; x: number; y: number; size?: number; strength?: number }) {
  const breathe = 0.85 + 0.15 * Math.sin(t * 1.3);
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: strength * breathe,
        background: `radial-gradient(circle, ${rgba("#FFF4D6", 0.95)} 0%, ${rgba("#FFD27A", 0.5)} 18%, ${rgba(PB.citron, 0.18)} 42%, transparent 68%)`,
      }}
    />
  );
}

export function Steam({ t, x, y, w = 260, h = 420, count = 6, seed = 1, alpha = 0.35 }: { t: number; x: number; y: number; w?: number; h?: number; count?: number; seed?: number; alpha?: number }) {
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h, width: w, height: h, pointerEvents: "none", filter: "blur(14px)", mixBlendMode: "screen" }}>
      {Array.from({ length: count }, (_, i) => {
        const life = 2.6 + rnd(`steamL${seed}`, i) * 1.4;
        const u = ((t + rnd(`steamP${seed}`, i) * life) % life) / life; // 0 → 1 en boucle
        const drift = noise2D(`steam${seed}`, i * 3.1, t * 0.35) * w * 0.35;
        const px = w / 2 + (rnd(`steamX${seed}`, i) - 0.5) * w * 0.5 + drift * u;
        const py = h * (1 - u);
        const size = 50 + u * 120;
        const a = alpha * Math.sin(Math.PI * u);
        return <div key={i} style={{ position: "absolute", left: px - size / 2, top: py - size / 2, width: size, height: size * 1.4, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,255,255,${a}) 0%, transparent 70%)` }} />;
      })}
    </div>
  );
}

export function Bokeh({ t, count = 22, seed = 3, colors = [PB.citron, PB.gold, "#FFE3B0", PB.mint], alpha = 0.5, area }: { t: number; count?: number; seed?: number; colors?: string[]; alpha?: number; area?: [number, number, number, number] }) {
  const [ax, ay, aw, ah] = area ?? [0, 0, 1920, 1080];
  return (
    <div style={{ position: "absolute", left: ax, top: ay, width: aw, height: ah, pointerEvents: "none", mixBlendMode: "screen", overflow: "hidden" }}>
      {Array.from({ length: count }, (_, i) => {
        const size = 40 + rnd(`bkS${seed}`, i) * 160;
        const px = rnd(`bkX${seed}`, i) * aw + noise2D(`bk${seed}`, i, t * 0.12) * 80;
        const py = rnd(`bkY${seed}`, i) * ah + noise2D(`bk${seed}y`, i, t * 0.1) * 60;
        const tw = 0.6 + 0.4 * Math.sin(t * (0.8 + rnd(`bkT${seed}`, i) * 1.5) + i);
        const c = colors[i % colors.length];
        return <div key={i} style={{ position: "absolute", left: px - size / 2, top: py - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(c, alpha * tw)} 0%, ${rgba(c, alpha * tw * 0.35)} 55%, transparent 72%)`, filter: `blur(${2 + size / 40}px)` }} />;
      })}
    </div>
  );
}

export function Flash({ t, at, dur = 0.35, color = "#FFF6E8", max = 0.9 }: { t: number; at: number; dur?: number; color?: string; max?: number }) {
  const k = (t - at) / dur;
  if (k < 0 || k > 1) return null;
  return <AbsoluteFill style={{ background: color, opacity: max * (1 - k) ** 2, pointerEvents: "none" }} />;
}

export function WipeBar({ t, at, dur = 0.55, color = PB.teal, dir = 1, angle = -12, style }: { t: number; at: number; dur?: number; color?: string; dir?: 1 | -1; angle?: number; style?: CSSProperties }) {
  const k = (t - at) / dur;
  if (k < 0 || k > 1) return null;
  const inK = prog(t, at, dur * 0.5, SNAP);
  const outK = prog(t, at + dur * 0.5, dur * 0.5, EXIT);
  const left = dir === 1 ? -20 + 140 * outK : 120 - 140 * inK;
  const right = dir === 1 ? 120 - 140 * (1 - inK) : -20 + 140 * (1 - outK);
  const l = Math.min(left, right);
  const r = Math.max(left, right);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-30%", height: "160%", left: `${l}%`, width: `${clamp01((r - l) / 100) * 100}%`, background: color, transform: `skewX(${angle}deg)`, ...style }} />
    </AbsoluteFill>
  );
}

export function Sparkle({ t, at, x, y, size = 60, color = "#FFF4D6" }: { t: number; at: number; x: number; y: number; size?: number; color?: string }) {
  const k = (t - at) / 0.7;
  if (k < 0 || k > 1) return null;
  const s = Math.sin(Math.PI * k);
  return (
    <svg style={{ position: "absolute", left: x - size / 2, top: y - size / 2, overflow: "visible", pointerEvents: "none" }} width={size} height={size} viewBox="-50 -50 100 100">
      <g transform={`rotate(${k * 90}) scale(${s})`} style={{ filter: `drop-shadow(0 0 8px ${color})` }}>
        <path d="M0,-50 C6,-8 8,-6 50,0 C8,6 6,8 0,50 C-6,8 -8,6 -50,0 C-8,-6 -6,-8 0,-50Z" fill={color} />
      </g>
    </svg>
  );
}
