/* ==========================================================================
 * LE CADRE — 16:9, 1920 × 1080 (rendu 4K à l'échelle 2). Une seule forme : le film est fait pour le site.
 *
 *   L.W, L.H, L.cx, L.cy     cadre et centre
 *   L.safe                   marges sûres { x: 110, top: 80 }
 *   L.capY = 930             les sous-titres commencent ici : RIEN d'important en dessous
 * ======================================================================== */
export const L = { W: 1920, H: 1080, cx: 960, cy: 540, safe: { x: 110, top: 80 }, capY: 930 } as const;
export const useLayout = () => L;
