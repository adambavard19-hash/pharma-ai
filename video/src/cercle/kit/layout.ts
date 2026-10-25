/* ==========================================================================
 * LE CADRE — 9:16, 1080 × 1920 (Reel Instagram ; rendu 4K à l'échelle 2 : 2160 × 3840).
 *
 *   L.W, L.H, L.cx, L.cy      cadre et centre
 *   L.textTop .. L.textBottom  la bande du GRAND TEXTE du haut (posé par le film) : 250 → 560. Rien d'important dedans.
 *   L.stage                    la scène utile : x 60 → 1020, y 580 → 1480 (Instagram masque le bas : boutons, légende)
 *   L.safe                     marges : { x: 60, top: 230, bottom: 440 }
 * ======================================================================== */
export const L = {
  W: 1080,
  H: 1920,
  cx: 540,
  cy: 960,
  textTop: 250,
  textBottom: 560,
  stage: { x0: 60, x1: 1020, y0: 580, y1: 1480 },
  safe: { x: 60, top: 230, bottom: 440 },
} as const;
export const useLayout = () => L;
