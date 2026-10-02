import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { C, useF } from "../theme";

/** Le fond clair du site : ink-50, lueur menthe en haut à gauche, crème en haut à droite. */
export function LightStage({ children }: { children?: ReactNode }) {
  const f = useF();
  const dx = Math.sin(f / 80) * 5;
  return (
    <AbsoluteFill style={{ background: C.ink50 }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${20 + dx}% 0%, ${C.brand100}, transparent 70%), radial-gradient(42% 48% at ${90 - dx}% 16%, ${C.accent100}, transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

/** Le temps sombre de la marque : brand-900, jamais du noir. Trame de points et poussière lumineuse. */
export function DarkStage({ children, glow = C.brand800, particles = true }: { children?: ReactNode; glow?: string; particles?: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.brand900 }}>
      <AbsoluteFill style={{ background: `radial-gradient(70% 70% at 50% 45%, ${glow}, transparent 72%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1.4px, transparent 1.6px)",
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
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: C.brand200, opacity: o }} />;
      })}
    </AbsoluteFill>
  );
}

/** Un bloc positionné en coordonnées 1920×1080. */
export function At({ x, y, w, h, children, style }: { x: number; y: number; w?: number; h?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>{children}</div>;
}
