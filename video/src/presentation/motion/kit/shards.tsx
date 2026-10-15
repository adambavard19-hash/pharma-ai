import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { clamp01 } from "./ease";
import { mulberry32, seedOf } from "./random";

/* ==========================================================================
 * ÉCLATS / BRISURES — « le monde gris vole en éclats » (S5), bulle qui éclate, dossier en morceaux…
 *
 *   makeShards({ seed, w = 1920, h = 1080, cols = 10, rows = 6, jitter = .3, split = false })
 *      → Shard[] : { pts: [x, y][], cx, cy, i }   grille cols×rows perturbée de ±jitter (en part de cellule),
 *        triangulée puis appariée en quadrilatères (60 morceaux pour 10×6) ; split = true → 120 triangles
 *   shardPolygon(shard, w, h) → "polygon(…%)"   pour clip-path
 *
 *   <Shatter t at seed? w h center=[960, 540] power=1400 gravity=1600 spin=260 depth=900 life=1.4 crack=.05>…image…</Shatter>
 *      Avant `at` : l'image entière. À `at`, la fêlure (les éclats s'écartent de 6 px pendant `crack` s), puis chaque
 *      éclat (copie de l'image découpée en clip-path) part depuis `center`, tourne en 3D, vient vers la caméra
 *      (depth), tombe et s'efface. Coût : l'image est dessinée UNE fois par éclat (60×) —
 *      lui donner un contenu léger ou figé (ex. une scène de l'acte 1 rendue à un temps fixe).
 *      shardStyle(shard, u, opts) → transform/opacité d'un éclat à u s du bris (pour un rendu maison, SVG par ex.)
 * ======================================================================== */

export type Shard = { pts: [number, number][]; cx: number; cy: number; i: number };

export function makeShards({ seed = "shards", w = 1920, h = 1080, cols = 10, rows = 6, jitter = 0.3, split = false }: { seed?: string | number; w?: number; h?: number; cols?: number; rows?: number; jitter?: number; split?: boolean } = {}): Shard[] {
  const r = mulberry32(seedOf(seed));
  const cw = w / cols;
  const ch = h / rows;
  // Sommets de la grille, perturbés sauf sur les bords.
  const V: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    V.push([]);
    for (let i = 0; i <= cols; i++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      const x = i * cw + (edgeX ? 0 : (r() * 2 - 1) * jitter * cw);
      const y = j * ch + (edgeY ? 0 : (r() * 2 - 1) * jitter * ch);
      V[j].push([x, y]);
    }
  }
  // Chaque cellule : deux triangles par une diagonale tirée au sort ; on apparie les triangles par cellule voisine
  // (un triangle de la cellule et un de la suivante) pour des morceaux irréguliers, ou on garde la cellule.
  const tris: [number, number][][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = V[j][i];
      const b = V[j][i + 1];
      const c = V[j + 1][i + 1];
      const d = V[j + 1][i];
      if (r() < 0.5) tris.push([a, b, c], [a, c, d]);
      else tris.push([a, b, d], [b, c, d]);
    }
  }
  const shards: Shard[] = [];
  const mk = (pts: [number, number][]) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    shards.push({ pts, cx, cy, i: shards.length });
  };
  if (split) tris.forEach(mk);
  else {
    // Appariement : chaque paire de triangles d'une cellule forme un quadrilatère (convexe ou non), sommets réordonnés.
    for (let k = 0; k < tris.length; k += 2) {
      const all = [...tris[k], ...tris[k + 1]];
      const uniq: [number, number][] = [];
      for (const p of all) if (!uniq.some((q) => q[0] === p[0] && q[1] === p[1])) uniq.push(p);
      const cx = uniq.reduce((s, p) => s + p[0], 0) / uniq.length;
      const cy = uniq.reduce((s, p) => s + p[1], 0) / uniq.length;
      uniq.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
      mk(uniq);
    }
  }
  return shards;
}

export const shardPolygon = (s: Shard, w = 1920, h = 1080) => `polygon(${s.pts.map(([x, y]) => `${((x / w) * 100).toFixed(3)}% ${((y / h) * 100).toFixed(3)}%`).join(", ")})`;

export function shardStyle(s: Shard, u0: number, { center = [960, 540], power = 1400, gravity = 1600, spin = 260, depth = 900, life = 1.4, seed = "shards", crack = 0.05 }: { center?: [number, number]; power?: number; gravity?: number; spin?: number; depth?: number; life?: number; seed?: string | number; crack?: number } = {}) {
  const r = mulberry32((seedOf(seed) ^ Math.imul(s.i + 7, 2654435761)) >>> 0);
  const dx = s.cx - center[0];
  const dy = s.cy - center[1];
  const dist = Math.max(1, Math.hypot(dx, dy));
  // La fêlure : pendant `crack` s, les éclats s'écartent à peine (les lignes de cassure se voient), puis s'envolent.
  const gap = 6 * clamp01(u0 / Math.max(1e-3, crack));
  const u = Math.max(0, u0 - crack);
  const v = power * (0.55 + 0.6 * r()) * (0.6 + 0.4 * (1 - Math.min(1, dist / 1100)));
  const vx = (dx / dist) * v;
  const vy = (dy / dist) * v - 200 * r();
  const x = vx * u + (dx / dist) * gap;
  const y = vy * u + 0.5 * gravity * u * u + (dy / dist) * gap;
  const z = depth * (0.3 + r()) * u;
  const rx = (r() - 0.5) * spin * 2 * u;
  const ry = (r() - 0.5) * spin * 2 * u;
  const rz = (r() - 0.5) * spin * u;
  const opacity = 1 - clamp01((u0 - life * 0.55) / (life * 0.45));
  return {
    transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`,
    transformOrigin: `${s.cx}px ${s.cy}px`,
    opacity,
  };
}

export function Shatter({ t, at, seed = "shatter", w = 1920, h = 1080, cols = 10, rows = 6, center = [960, 540], power = 1400, gravity = 1600, spin = 260, depth = 900, life = 1.4, crack = 0.05, children }: { t: number; at: number; seed?: string; w?: number; h?: number; cols?: number; rows?: number; center?: [number, number]; power?: number; gravity?: number; spin?: number; depth?: number; life?: number; crack?: number; children: ReactNode }) {
  const u = t - at;
  if (u < 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  if (u > life) return null;
  const shards = makeShards({ seed, w, h, cols, rows });
  return (
    <AbsoluteFill style={{ perspective: 1400, perspectiveOrigin: `${center[0]}px ${center[1]}px` }}>
      {shards.map((s) => (
        <AbsoluteFill key={s.i} style={{ clipPath: shardPolygon(s, w, h), ...shardStyle(s, u, { center, power, gravity, spin, depth, life, seed, crack }), backfaceVisibility: "visible" }}>
          {children}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
}
