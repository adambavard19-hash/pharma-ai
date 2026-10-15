import type { CSSProperties } from "react";
import { AbsoluteFill } from "remotion";

/* ==========================================================================
 * GRILLE DE POINTS PERMANENTE — point de 2 px tous les 48 px, qui dérive en diagonale à 18 px/s.
 * À poser par chaque scène JUSTE AU-DESSUS de son fond (sous la caméra).
 *
 *   <DotGrid t opacity={time.look(t).dots} />         4 % dans l'acte 1, 8 % ensuite
 *   <DotGrid t opacity={.08} drift={9} />             dérive divisée par deux (S11)
 *   <DotGrid t opacity={.08} wave={{ at: drop, x: 960, y: 540 }} />
 *        VAGUE : un anneau de points allumés (menthe) part de (x, y) à `speed` px/s (défaut 1600), largeur `width` px
 *   color, size, spacing, mask (true : s'efface vers les bords)
 * ======================================================================== */

export type DotWave = { at: number; x?: number; y?: number; speed?: number; width?: number; color?: string; strength?: number };

export function DotGrid({
  t,
  opacity = 0.08,
  spacing = 48,
  size = 2,
  drift = 18,
  color = "255,255,255",
  wave,
  mask = false,
}: {
  t: number;
  opacity?: number;
  spacing?: number;
  size?: number;
  /** px/s, en diagonale. */
  drift?: number;
  /** "r,g,b" */
  color?: string;
  wave?: DotWave;
  mask?: boolean;
}) {
  const off = (t * drift) % spacing;
  const dots = (rgb: string, a: number, s: number) => `radial-gradient(circle at ${spacing / 2}px ${spacing / 2}px, rgba(${rgb},${a}) ${s / 2}px, transparent ${s / 2 + 0.8}px)`;
  const base: CSSProperties = {
    backgroundImage: dots(color, 1, size),
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${off}px ${off}px`,
  };
  const fade = mask ? "radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)" : undefined;
  let waveLayer = null;
  if (wave && t >= wave.at) {
    const r = (t - wave.at) * (wave.speed ?? 1600);
    const w = wave.width ?? 220;
    const life = Math.max(0, 1 - (t - wave.at) / 1.6);
    if (life > 0) {
      const ring = `radial-gradient(circle at ${wave.x ?? 960}px ${wave.y ?? 540}px, transparent ${Math.max(0, r - w)}px, black ${r - w * 0.3}px, black ${r}px, transparent ${r + w * 0.25}px)`;
      waveLayer = (
        <AbsoluteFill
          style={{
            backgroundImage: dots(wave.color ?? "88,242,216", 1, size * 2),
            backgroundSize: `${spacing}px ${spacing}px`,
            backgroundPosition: `${off}px ${off}px`,
            opacity: (wave.strength ?? 0.9) * life,
            maskImage: ring,
            WebkitMaskImage: ring,
          }}
        />
      );
    }
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none", maskImage: fade, WebkitMaskImage: fade }}>
      <AbsoluteFill style={{ ...base, opacity }} />
      {waveLayer}
    </AbsoluteFill>
  );
}
