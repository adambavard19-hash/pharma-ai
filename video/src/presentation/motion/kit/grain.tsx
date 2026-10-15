import { useId } from "react";
import { AbsoluteFill } from "remotion";

/* ==========================================================================
 * GRAIN ET VIGNETTE — posés PAR L'ORCHESTRATEUR au-dessus de toutes les scènes (sous les sous-titres), selon
 * l'acte : grain 5 % et vignette .30 avant le DROP ; grain 3 % et vignette .18 après (voir FILM_LOOK dans time.ts).
 * Une scène n'en ajoute que si elle veut PLUS (ex. arrêt sur image de S3 : <Vignette strength={.45} />).
 *
 *   <Grain t opacity={0.03} />        feTurbulence .9, nouvelle graine toutes les 2 images, fusion overlay
 *   <Vignette strength={0.18} />      transparent jusqu'à 55 %, puis noir à `strength`
 * ======================================================================== */

export function Grain({ t, opacity = 0.03 }: { t: number; opacity?: number }) {
  const id = `grain${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (opacity <= 0) return null;
  const seed = Math.floor(t * 30);
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: Math.min(1, opacity * 6), pointerEvents: "none" }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ display: "block" }}>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  1.6 1.6 1.6 0 -1.95" />
        </filter>
        <rect width="1920" height="1080" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
}

export function Vignette({ strength = 0.18 }: { strength?: number }) {
  if (strength <= 0) return null;
  return <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)` }} />;
}
