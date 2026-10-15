import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { INK, PB, rgba } from "./palette";

/* ==========================================================================
 * FONDS DE SCÈNE.
 *
 *   <Backdrop t kind="act1" />      encre #0B0F14 unie (acte 1)
 *   <Backdrop t kind="brand" />     encre + deux halos qui dérivent au bruit : sarcelle #0F766E à 35 % en haut à
 *                                   gauche, #1D8174 à 25 % en bas à droite (actes 2 et 3)
 *   <Halos t intensity={.6} />      les deux halos seuls (S11 : halos à 60 %)
 *   <Spot x y r color alpha />      une lueur radiale ponctuelle (derrière un objet héros)
 * ======================================================================== */

export function Halos({ t, intensity = 1, seed = "halos" }: { t: number; intensity?: number; seed?: string }) {
  const ax = 22 + 8 * noise2D(seed, t * 0.12, 0);
  const ay = 20 + 8 * noise2D(seed, 0, t * 0.12 + 4);
  const bx = 80 + 8 * noise2D(seed, t * 0.1 + 9, 2);
  const by = 82 + 8 * noise2D(seed, 3, t * 0.1 + 11);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(60% 70% at ${ax}% ${ay}%, ${rgba(PB.teal, 0.35 * intensity)}, transparent 70%), radial-gradient(55% 65% at ${bx}% ${by}%, ${rgba(PB.teal2, 0.25 * intensity)}, transparent 70%)`,
      }}
    />
  );
}

export function Backdrop({ t, kind = "brand", halo = 1 }: { t: number; kind?: "act1" | "brand"; halo?: number }) {
  return (
    <AbsoluteFill style={{ background: INK }}>
      {kind === "brand" && <Halos t={t} intensity={halo} />}
    </AbsoluteFill>
  );
}

export function Spot({ x, y, r = 420, color = PB.mint, alpha = 0.25 }: { x: number; y: number; r?: number; color?: string; alpha?: number }) {
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, transparent 70%)`, pointerEvents: "none" }} />;
}
