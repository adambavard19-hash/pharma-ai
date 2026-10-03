import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Le filigrane du PDF spécimen : « SPÉCIMEN » en diagonale sur chaque page,
 * et une ligne en haut de page. Un spécimen imprimé ou transféré se reconnaît
 * au premier coup d'œil.
 */
export async function markSpecimenPdf(bytes: Uint8Array, mark = "SPÉCIMEN - document sans valeur"): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const red = rgb(0.75, 0.12, 0.12);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = 64;
    const word = "SPÉCIMEN";
    const textWidth = bold.widthOfTextAtSize(word, size);
    // Centré sur la diagonale montante (45°).
    const offset = textWidth / (2 * Math.SQRT2);
    page.drawText(word, { x: width / 2 - offset, y: height / 2 - offset, size, font: bold, color: red, opacity: 0.12, rotate: degrees(45) });
    page.drawText(mark, { x: 56, y: height - 30, size: 8.5, font: regular, color: red });
  }
  return pdf.save();
}
