import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { BANNER } from "../../../agent/src/banner-design";
import { C, useF } from "../theme";

/** Le fond clair de l'application : #f9fbfb, une lueur menthe en haut à gauche, une lueur ciel en haut à droite. */
export function LightStage({ children }: { children?: ReactNode }) {
  const f = useF();
  const dx = Math.sin(f / 80) * 5;
  return (
    <AbsoluteFill style={{ background: C.app }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${20 + dx}% 0%, ${C.brand100}, transparent 70%), radial-gradient(42% 48% at ${90 - dx}% 12%, rgba(7,150,180,.08), transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

/** « #36E8C8 » + opacité → « rgba(54,232,200,0.2) ». */
export function rgba(hex: string, alpha: number) {
  const v = hex.replace("#", "");
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${alpha})`;
}

/**
 * Le temps sombre : le bleu-vert profond de la bannière du comptoir
 * (BANNER.colors cardTop → cardBottom) et sa lueur menthe, jamais un aplat de
 * vert foncé. Trame de points et poussière lumineuse. `glow` colore la lueur.
 */
export function DarkStage({ children, glow = BANNER.colors.glow, particles = true }: { children?: ReactNode; glow?: string; particles?: boolean }) {
  const K = BANNER.colors;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${K.cardTop} 0%, ${K.cardBottom} 78%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 62% at 50% 44%, ${rgba(glow, 0.16)}, transparent 72%), radial-gradient(40% 40% at 8% 0%, ${rgba(K.glow, 0.1)}, transparent 70%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.06) 1.4px, transparent 1.6px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(60% 60% at 50% 50%, black, transparent 85%)",
          WebkitMaskImage: "radial-gradient(60% 60% at 50% 50%, black, transparent 85%)",
        }}
      />
      {particles && <Dust />}
      {children}
    </AbsoluteFill>
  );
}

function Dust() {
  const f = useF();
  const t = f / 30;
  return (
    <AbsoluteFill>
      {Array.from({ length: 46 }, (_, i) => {
        const x = (noise2D("x", i * 0.41, t * 0.05) * 0.5 + 0.5) * 1920;
        const y = (noise2D("y", i * 0.67, t * 0.05) * 0.5 + 0.5) * 1080;
        const r = 1.5 + ((i * 7) % 5) * 0.7;
        const o = 0.08 + 0.1 * (((i * 3) % 4) / 3);
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: BANNER.colors.muted, opacity: o }} />;
      })}
    </AbsoluteFill>
  );
}

/** Un bloc positionné en coordonnées 1920×1080. */
export function At({ x, y, w, h, children, style }: { x: number; y: number; w?: number; h?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>{children}</div>;
}
