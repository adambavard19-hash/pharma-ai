import QRCode from "qrcode";

/**
 * QR code du lien patient.
 *
 * L'encodeur maison qui vivait ici produisait des symboles qu'aucun lecteur
 * ne décodait — constaté au comptoir (« le QR code ne fonctionne pas »), puis
 * mesuré : ni « HELLO » ni une adresse de fiche n'étaient lisibles par un
 * décodeur indépendant. On s'appuie désormais sur une bibliothèque éprouvée ;
 * le test `qrcode-decode.test.ts` relit chaque symbole avec un lecteur tiers.
 *
 * Le rendu reste un chemin SVG : net à l'écran, net à l'impression, et un
 * seul nœud à dessiner. Correction d'erreur M : un code un peu abîmé — pli
 * du papier, reflet — se lit encore.
 */
export type QrMatrix = { size: number; modules: boolean[][] };

export function encodeQr(text: string): QrMatrix {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = code.modules.size;
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) line.push(code.modules.get(row, col) === 1);
    modules.push(line);
  }
  return { size, modules };
}

/** Convertit une matrice en chemin SVG unique — un seul nœud à rendre. */
export function qrToSvgPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.modules[row][col]) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return parts.join("");
}
