/* ==========================================================================
 * PALETTE — deux mondes séparés par la révélation (DIRECTION-PRESENTATION, §4).
 *
 *   ACT1.*   acte 1 (S1 à S4) : gris sur encre ; seules exceptions : mint (CONSEIL, boîte fantôme) et coral (alerte).
 *            Le corail ne réapparaît JAMAIS après la révélation.
 *   PB.*     actes 2 et 3 (dès le DROP) : encre, sarcelle, menthe, doré (challenge / fête seulement), vert stock.
 *   GOLD_METAL, MINT_GRAD    dégradés CSS prêts à l'emploi
 *   rgba("#36E8C8", .4)      hex → rgba()
 *   glowMint(a = 1)          lueur menthe de la direction (drop-shadow 18 px + halo 60 px à 40 %), pour `filter`
 * ======================================================================== */

export const INK = "#0B0F14";

export const ACT1 = {
  ink: INK,
  g1: "#1A2129",
  g2: "#2A333D",
  g3: "#8A94A3",
  g4: "#C9D1DA",
  white: "#FFFFFF",
  mint: "#36E8C8",
  coral: "#FF6B5B",
} as const;

export const PB = {
  ink: INK,
  teal: "#0F766E",
  teal2: "#1D8174",
  mint: "#36E8C8",
  mint2: "#58F2D8",
  gold: "#F2A516",
  goldHi: "#FFD27A",
  goldLo: "#B86E00",
  stock: "#22C88F",
  white: "#FFFFFF",
  glassDark: "rgba(18,26,34,.88)",
} as const;

export const GOLD_METAL = `linear-gradient(160deg, ${PB.goldHi} 0%, ${PB.gold} 52%, ${PB.goldLo} 100%)`;
export const MINT_GRAD = `linear-gradient(135deg, ${PB.mint2} 0%, ${PB.mint} 100%)`;

export function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export const glowMint = (a = 1) => `drop-shadow(0 0 18px ${rgba(PB.mint, 0.9 * a)}) drop-shadow(0 0 60px ${rgba(PB.mint, 0.4 * a)})`;
export const glowGold = (a = 1) => `drop-shadow(0 0 18px ${rgba(PB.gold, 0.9 * a)}) drop-shadow(0 0 60px ${rgba(PB.gold, 0.4 * a)})`;
