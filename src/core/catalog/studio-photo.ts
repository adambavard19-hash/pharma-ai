import { STUDIO_PHOTO_EANS } from "@/config/studio-photos";

/**
 * La photo d'un produit au comptoir : SEULEMENT sa photo studio (la même boîte refaite sur le fond uni de PharmaBoost,
 * public/produits-studio/<code-barres>.jpg — voir scripts/photos-studio.ts). Sans elle, aucune photo : ni carré vide, ni
 * photo d'amateur prise n'importe comment (décision du fondateur, 13 oct. 2026).
 */
export function studioPhotoUrl(ean: string | null | undefined): string | null {
  const code = (ean ?? "").replace(/\D/g, "");
  return code && STUDIO_PHOTO_EANS.has(code) ? `/produits-studio/${code}.jpg` : null;
}
