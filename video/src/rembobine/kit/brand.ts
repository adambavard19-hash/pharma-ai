import type { CSSProperties } from "react";
import { JAKARTA, MONO } from "../../presentation/motion/kit/fonts";

/* ==========================================================================
 * L'IDENTITÉ DU FILM « REMBOBINONS » — deux mondes, séparés par la bande qui rembobine (DROP, 20 s).
 *
 *   A1.*   ACTE 1 (S1 → S4) : la pharmacie de tous les jours, lumière de néon froide, désaturée. Le rouge `A1.alarm`
 *          n'existe QUE dans l'acte 1 (le choc : « rien »). La croix verte de pharmacie y est terne, elle grésille.
 *   PB.*   PHARMABOOST (dès le DROP) : les couleurs du site et de la bannière du comptoir — vert profond #0F2F2A,
 *          citron #E8FF9C (l'accent de la bannière), sarcelle de la marque, papier clair de l'hélice d'ADN, menthe,
 *          or (challenge seulement), rouge brique (date courte seulement, comme sur la bannière).
 *
 *   Polices : Plus Jakarta Sans (le site, la bannière) — JAKARTA 600/700/800 ; JetBrains Mono — MONO (chiffres vivants).
 *   punch(size) title(size) support(size) label(size) digits(size) body(size)   styles prêts à étaler
 *   rgba(hex, a)
 * ======================================================================== */

export const A1 = {
  ink: "#101518", // la nuit derrière le néon
  wall: "#2A3236", // mur de pharmacie éteint
  shelf: "#3A4449",
  grey: "#8B979C",
  pale: "#C9D3D6",
  neon: "#E6EEF0", // néon froid
  cross: "#4F8F6E", // la croix verte, terne
  alarm: "#FF3B30", // LE rouge du choc (acte 1 seulement)
  white: "#FFFFFF",
} as const;

export const PB = {
  green: "#0F2F2A", // le vert profond de la bannière (fond)
  green2: "#174238",
  teal: "#247061", // le vert « choisi » de la bannière
  brand: "#0E8A7B", // sarcelle du site (brand-600)
  cyan: "#0796B4", // la fin du dégradé du titre du site
  citron: "#E8FF9C", // l'accent de la bannière
  mint: "#36E8C8",
  paper: "#F4F8F6", // le papier clair de la bannière
  paper2: "#E9F1EE",
  ink: "#0A2622", // le texte sur papier
  inkSoft: "#3F5E57",
  line: "rgba(15,47,42,0.14)",
  gold: "#F2A516", // le challenge (seulement)
  goldHi: "#FFD27A",
  date: "#A3241B", // la date courte (seulement), comme sur la bannière
  stock: "#22C88F",
  white: "#FFFFFF",
} as const;

/** Le dégradé du titre du site (« de votre pharmacie. ») : sarcelle → cyan. */
export const BRAND_GRAD = `linear-gradient(90deg, ${PB.brand} 0%, ${PB.cyan} 100%)`;

export { JAKARTA, MONO };

/** Le mot qui claque : Jakarta 800, serré. */
export const punch = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.045em", lineHeight: 0.92 });
export const title = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.03em", lineHeight: 1 });
export const support = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1.12 });
export const body = (size: number, weight: 600 | 700 = 600): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, letterSpacing: "-0.01em", lineHeight: 1.25 });
/** Petite étiquette en capitales espacées. */
export const label = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1 });
/** Chiffres vivants (compteurs, prix, heure) : chiffres tabulaires. */
export const digits = (size: number, weight: 600 | 700 = 700): CSSProperties => ({ fontFamily: MONO, fontWeight: weight, fontSize: size, fontVariantNumeric: "tabular-nums", lineHeight: 1 });

export function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export const softShadow = (k = 1, color = "#06110F") => `0 ${24 * k}px ${60 * k}px ${rgba(color, 0.4)}, 0 ${6 * k}px ${16 * k}px ${rgba(color, 0.25)}`;
export const glow = (color: string = PB.citron, k = 1) => `drop-shadow(0 0 ${14 * k}px ${rgba(color, 0.85)}) drop-shadow(0 0 ${44 * k}px ${rgba(color, 0.4)})`;
