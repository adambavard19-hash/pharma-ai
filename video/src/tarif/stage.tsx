import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { noise2D } from "@remotion/noise";
import { BANNER } from "../../../agent/src/banner-design";
import { rgba } from "../ui/stage";
import { Captions, MINT, type SceneLine } from "../reel/stage";

/* ==========================================================================
 * LE PLATEAU DU FILM « TARIF » (16:9, 1920 × 1080).
 *
 * Le fond des temps sombres des films : le bleu-vert profond de la bannière
 * (cardTop → cardBottom) et sa lueur menthe, jamais un aplat de vert foncé.
 * Il est posé une fois, sous toutes les scènes, sur l'horloge du film : rien
 * ne saute d'une scène à l'autre.
 *
 * Les bandes de l'image : en haut (34–134) le calcul étape par étape ; au
 * centre (160–800) la scène ; en bas les sous-titres (centre 906) puis la
 * mention de l'estimation (1008).
 * ======================================================================== */

export const W = 1920;
export const H = 1080;
export const CAPTION = { y: 906, size: 70, width: 1700 };

export function TarifStage() {
  const t = useCurrentFrame() / 60;
  const K = BANNER.colors;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${K.cardTop} 0%, ${K.cardBottom} 78%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(52% 60% at ${50 + Math.sin(t / 2.4) * 6}% ${44 + Math.cos(t / 3.1) * 4}%, ${rgba(K.glow, 0.15)}, transparent 72%), radial-gradient(40% 44% at 6% 0%, ${rgba(K.glow, 0.1)}, transparent 70%), radial-gradient(44% 50% at 100% 100%, rgba(7,150,180,.22), transparent 70%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.065) 1.5px, transparent 1.7px)",
          backgroundSize: "42px 42px",
          backgroundPosition: `${-t * 5}px 0`,
          maskImage: "radial-gradient(62% 62% at 50% 48%, black, transparent 86%)",
          WebkitMaskImage: "radial-gradient(62% 62% at 50% 48%, black, transparent 86%)",
        }}
      />
      {Array.from({ length: 46 }, (_, i) => {
        const x = (noise2D("tx", i * 0.41, t * 0.06) * 0.5 + 0.5) * W;
        const y = (noise2D("ty", i * 0.67, t * 0.06) * 0.5 + 0.5) * H;
        const r = 1.5 + ((i * 7) % 5) * 0.7;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: K.muted, opacity: 0.08 + 0.1 * (((i * 3) % 4) / 3) }} />;
      })}
    </AbsoluteFill>
  );
}

/** Les sous-titres du reel, posés en bas de l'image 16:9 (une ligne de 2 à 4 mots, le mot clé en couleur). */
export function Subtitles({ L, accent = MINT }: { L: SceneLine; accent?: string }) {
  return <Captions L={L} y={CAPTION.y} size={CAPTION.size} width={CAPTION.width} accent={accent} style={{ left: (W - CAPTION.width) / 2 }} />;
}

/** Un client : une tête, des épaules. */
export function Person({ size, color, style }: { size: number; color: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 20 24" width={size} height={size * 1.2} style={{ display: "block", overflow: "visible", ...style }}>
      <circle cx={10} cy={6} r={5} fill={color} />
      <path d="M2 23.5 C2 16 5.6 13 10 13 C14.4 13 18 16 18 23.5 Z" fill={color} />
    </svg>
  );
}

/** La croix de pharmacie, au néon. */
export function NeonCross({ size, glow = 1 }: { size: number; glow?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 0 ${16 * glow}px rgba(34,200,143,.85)) drop-shadow(0 0 ${38 * glow}px rgba(34,200,143,.45))` }}>
      <path d="M35 5 H65 V35 H95 V65 H65 V95 H35 V65 H5 V35 H35 Z" fill="#22C88F" stroke="#B8FFE6" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}

/** Une pièce de 7 € (le prix moyen d'un produit conseillé, écrit par l'appelant). */
export function Coin({ size, label }: { size: number; label: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 30%, #FFF4C9 0%, #F2C94C 48%, #D99A12 100%)", border: `${size * 0.05}px solid #C2860B`, boxShadow: `inset 0 0 0 ${size * 0.06}px rgba(255,244,201,.55), 0 ${size * 0.18}px ${size * 0.4}px -${size * 0.12}px rgba(0,0,0,.55)` }}>
      <span style={{ fontWeight: 800, fontSize: size * 0.34, letterSpacing: "-0.03em", color: "#6B4500", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
