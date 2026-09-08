/**
 * Géométrie du contrat PDF partagée entre le rendu et le prestataire de
 * signature : le bloc des signatures est ancré à une position FIXE en bas de
 * la dernière page, pour que l'on sache placer les champs de signature
 * électronique sans relire le document.
 *
 * Unités : points PDF (A4 = 595,28 × 841,89). Le PDF compte les ordonnées
 * depuis le bas ; Yousign depuis le haut — `signatureFieldPlacement` fait la
 * conversion.
 */
export const CONTRACT_PAGE = { width: 595.28, height: 841.89 } as const;
export const CONTRACT_MARGIN = 56;

export const SIGNATURE_BLOCK = {
  /** Hauteur d'une case de signature. */
  boxHeight: 110,
  /** Distance entre le bas de la page et le bas des cases. */
  bottom: 72,
  /** Espace entre les deux cases. */
  gap: 20,
  /** Marge intérieure des cases. */
  padding: 10,
  /** Hauteur réservée en haut de la case au libellé, au nom et à l'e-mail. */
  textHeight: 54,
} as const;

export type SignatureBox = { x: number; top: number; bottom: number; width: number; height: number };

/** Les cases dessinées dans le PDF, en coordonnées PDF (origine en bas à gauche). */
export function signatureBoxes(count: number): SignatureBox[] {
  const usable = CONTRACT_PAGE.width - CONTRACT_MARGIN * 2;
  const width = (usable - SIGNATURE_BLOCK.gap * (count - 1)) / Math.max(count, 1);
  const bottom = SIGNATURE_BLOCK.bottom;
  const top = bottom + SIGNATURE_BLOCK.boxHeight;
  return Array.from({ length: count }, (_, index) => ({
    x: CONTRACT_MARGIN + index * (width + SIGNATURE_BLOCK.gap),
    top,
    bottom,
    width,
    height: SIGNATURE_BLOCK.boxHeight,
  }));
}

export type SignatureFieldPlacement = { page: number; x: number; y: number; width: number; height: number };

/**
 * La zone où le prestataire pose la signature du signataire `index`, en
 * coordonnées prestataire (origine en haut à gauche, page numérotée à partir
 * de 1) : l'intérieur de la case, sous les lignes de texte.
 */
export function signatureFieldPlacement(index: number, count: number, pageCount: number): SignatureFieldPlacement {
  const box = signatureBoxes(count)[index];
  if (!box) throw new Error(`Signataire ${index} hors du bloc de ${count} case(s).`);
  const zoneTop = box.top - SIGNATURE_BLOCK.textHeight;
  const zoneBottom = box.bottom + SIGNATURE_BLOCK.padding;
  return {
    page: Math.max(1, pageCount),
    x: Math.round(box.x + SIGNATURE_BLOCK.padding),
    y: Math.round(CONTRACT_PAGE.height - zoneTop),
    width: Math.round(box.width - SIGNATURE_BLOCK.padding * 2),
    height: Math.round(zoneTop - zoneBottom),
  };
}
