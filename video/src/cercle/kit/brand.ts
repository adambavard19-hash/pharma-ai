import type { CSSProperties } from "react";
import { JAKARTA, MONO } from "../../presentation/motion/kit/fonts";

/* ==========================================================================
 * L'IDENTITÉ DU FILM « LE CERCLE » — le style de la vidéo de référence (une rue de nuit en 3D isométrique, une boutique
 * qui brille et l'autre éteinte, un grand texte en haut aux mots surlignés), aux couleurs de PharmaBoost.
 *
 *   N.*    LA NUIT : le quartier (bâtiments en vert-encre très sombre, trois faces : dessus, gauche, droite), la rue,
 *          les lampadaires. La pharmacie d'À CÔTÉ reste dans ces tons froids : vitrine grise, croix éteinte.
 *   PB.*   PHARMABOOST : la pharmacie qui brille (vitrine citron chaud, croix verte néon), les écrans (bannière,
 *          téléphones), les mots surlignés (boîte citron, texte vert profond). Or = challenge seulement.
 *   Polices : Plus Jakarta Sans 800 (le grand texte), JetBrains Mono (chiffres).
 *   iso(x, y, z) → [px, py]   projection isométrique du kit `city` (voir kit/city.tsx)
 * ======================================================================== */

export const N = {
  sky: "#06110E", // le fond de la nuit
  ground: "#0B1B17", // le sol du quartier
  road: "#0E211C",
  roadLine: "#2B4A41",
  top: "#1C3A32", // dessus des bâtiments
  left: "#132C26", // face gauche
  right: "#0E231E", // face droite
  window: "#C99A3E", // fenêtres allumées (chaud, rares)
  windowOff: "#1A332C",
  lamp: "#F6E7A8", // lampadaires
  cold: "#7E9AA3", // la pharmacie d'à côté, froide
  coldDim: "#3A4C52",
  white: "#FFFFFF",
} as const;

export const PB = {
  green: "#0F2F2A",
  green2: "#174238",
  teal: "#247061",
  brand: "#0E8A7B",
  cyan: "#0796B4",
  citron: "#E8FF9C",
  glow: "#F4FFB8", // la lumière de la vitrine PharmaBoost
  mint: "#36E8C8",
  paper: "#F4F8F6",
  paper2: "#E9F1EE",
  ink: "#0A2622",
  inkSoft: "#3F5E57",
  line: "rgba(15,47,42,0.14)",
  cross: "#2BD67B", // la croix verte néon
  gold: "#F2A516",
  date: "#A3241B",
  stock: "#22C88F",
  white: "#FFFFFF",
} as const;

export const BRAND_GRAD = `linear-gradient(90deg, ${PB.brand} 0%, ${PB.cyan} 100%)`;

export { JAKARTA, MONO };

export const punch = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", lineHeight: 0.95 });
export const title = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.03em", lineHeight: 1 });
export const support = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1.12 });
export const body = (size: number, weight: 600 | 700 = 600): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, letterSpacing: "-0.01em", lineHeight: 1.25 });
export const label = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1 });
export const digits = (size: number, weight: 600 | 700 = 700): CSSProperties => ({ fontFamily: MONO, fontWeight: weight, fontSize: size, fontVariantNumeric: "tabular-nums", lineHeight: 1 });

export function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
export const softShadow = (k = 1, color = "#020806") => `0 ${24 * k}px ${60 * k}px ${rgba(color, 0.55)}, 0 ${6 * k}px ${16 * k}px ${rgba(color, 0.35)}`;
export const glow = (color: string = PB.citron, k = 1) => `drop-shadow(0 0 ${14 * k}px ${rgba(color, 0.85)}) drop-shadow(0 0 ${44 * k}px ${rgba(color, 0.4)})`;
