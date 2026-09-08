import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ContractDocument } from "./template";

/**
 * Rendu PDF du contrat : pur JavaScript, sans navigateur — il fonctionne sur
 * un hébergement sans Chromium. A4, marges régulières, coupure de page propre.
 */
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const LINE = 14;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** pdf-lib ne connaît que WinAnsi avec les polices standard : on remplace ce qu'elle ne sait pas dessiner. */
function sanitize(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/—/g, "-").replace(/–/g, "-").replace(/ /g, " ").replace(/ /g, " ").replace(/[^\x00-\xFF]/g, "?");
}

export async function renderContractPdf(doc: ContractDocument, generatedAt = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setSubject(doc.reference);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;
  const green = rgb(15 / 255, 118 / 255, 110 / 255);
  const ink = rgb(17 / 255, 24 / 255, 39 / 255);
  const grey = rgb(107 / 255, 114 / 255, 128 / 255);

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;
  let pageNumber = 1;

  const footer = (p: PDFPage, n: number) => {
    p.drawText(sanitize(`${doc.reference} - page ${n}`), { x: MARGIN, y: 28, size: 8, font: regular, color: grey });
    p.drawText(sanitize(`Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(generatedAt)}`), { x: A4[0] - MARGIN - 160, y: 28, size: 8, font: regular, color: grey });
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      footer(page, pageNumber);
      page = pdf.addPage(A4);
      pageNumber += 1;
      y = A4[1] - MARGIN;
    }
  };
  const text = (value: string, font: PDFFont, size: number, color = ink, gap = LINE) => {
    for (const line of wrap(sanitize(value), font, size, width)) {
      ensure(gap);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= gap;
    }
  };

  // En-tête
  page.drawText("PharmaBoost", { x: MARGIN, y, size: 11, font: bold, color: green });
  y -= 22;
  text(doc.title, bold, 17, ink, 22);
  text(`Référence ${doc.reference}`, regular, 9.5, grey, 18);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1, color: green });
  y -= 18;

  for (const section of doc.sections) {
    ensure(LINE * 3);
    text(section.heading, bold, 11, ink, 16);
    for (const paragraph of section.paragraphs) {
      text(paragraph, regular, 10, ink, LINE);
      y -= 4;
    }
    y -= 6;
  }

  // Signatures
  ensure(120);
  y -= 6;
  text("Signatures", bold, 11, ink, 18);
  const columnWidth = width / 2 - 10;
  const top = y;
  doc.signatures.forEach((signature, index) => {
    const x = MARGIN + index * (columnWidth + 20);
    page.drawRectangle({ x, y: top - 78, width: columnWidth, height: 78, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 0.8 });
    page.drawText(sanitize(signature.label), { x: x + 10, y: top - 16, size: 9, font: bold, color: green });
    page.drawText(sanitize(signature.name), { x: x + 10, y: top - 32, size: 10, font: regular, color: ink });
    page.drawText(sanitize(signature.email), { x: x + 10, y: top - 46, size: 8.5, font: regular, color: grey });
    page.drawText("Signature électronique horodatée", { x: x + 10, y: top - 66, size: 8, font: regular, color: grey });
  });
  y = top - 90;
  footer(page, pageNumber);

  return pdf.save();
}
