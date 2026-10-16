import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { euros, percent, type SalesReport } from "./sales-report";

/**
 * Le PDF de la page « Performance » de la console (fondateur, 16 oct. 2026) : sur la période choisie, les chiffres de toutes
 * les pharmacies réunies puis une ligne par pharmacie — ventes terminées, conseils proposés, vendus, taux de vente, chiffre
 * d'affaires ajouté. Pur JavaScript (pdf-lib), sans navigateur. Aucune donnée de patient.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 44;
const GREEN = rgb(15 / 255, 118 / 255, 110 / 255);
const INK = rgb(17 / 255, 24 / 255, 39 / 255);
const GREY = rgb(107 / 255, 114 / 255, 128 / 255);
const LINE = rgb(226 / 255, 232 / 255, 236 / 255);

/** pdf-lib (polices standard) ne dessine que WinAnsi. */
function safe(text: string): string {
  return text.replace(/ /g, " ").replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[—–]/g, "-").replace(/[^\x00-\xFF€œŒ]/g, "?");
}

const fmtDate = (date: Date, timeZone: string, style: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone, ...style }).format(date);

export type PharmacyReportRow = { name: string; city: string | null; report: SalesReport };

export async function renderPharmaciesReportPdf(input: { label: string; from: Date; to: Date; rows: PharmacyReportRow[]; generatedAt: Date; timeZone: string }): Promise<Uint8Array> {
  const { rows, timeZone } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Performance des pharmacies - ${input.label}`));
  pdf.setAuthor("PharmaBoost");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - M * 2;
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;
  const text = (value: string, x: number, at: number, size: number, font: PDFFont = regular, color = INK) => page.drawText(safe(value), { x, y: at, size, font, color });
  const right = (value: string, xRight: number, at: number, size: number, font: PDFFont = regular, color = INK) => {
    const clean = safe(value);
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y: at, size, font, color });
  };

  page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: GREEN });
  text("PharmaBoost", M, A4[1] - 40, 20, bold, rgb(1, 1, 1));
  text("Performance des pharmacies", M, A4[1] - 62, 12, regular, rgb(0.88, 0.97, 0.94));
  right(input.label, A4[0] - M, A4[1] - 40, 12, bold, rgb(1, 1, 1));
  right(`du ${fmtDate(input.from, timeZone, { dateStyle: "long" })} au ${fmtDate(input.to, timeZone, { dateStyle: "long" })}`, A4[0] - M, A4[1] - 62, 9.5, regular, rgb(0.88, 0.97, 0.94));
  y = A4[1] - 122;

  const total = rows.reduce((sum, { report }) => ({ sales: sum.sales + report.sales, proposed: sum.proposed + report.proposed, sold: sum.sold + report.sold, revenue: sum.revenue + report.revenueCents }), { sales: 0, proposed: 0, sold: 0, revenue: 0 });
  const tiles: [string, string][] = [
    ["Conseils proposés", String(total.proposed)],
    ["Conseils vendus", String(total.sold)],
    ["Taux de vente", percent(total.proposed > 0 ? total.sold / total.proposed : null)],
    ["Chiffre d'affaires ajouté", euros(total.revenue)],
  ];
  const tileW = (width - 3 * 10) / 4;
  tiles.forEach(([label, value], index) => {
    const x = M + index * (tileW + 10);
    page.drawRectangle({ x, y: y - 48, width: tileW, height: 50, borderColor: LINE, borderWidth: 0.8 });
    text(label, x + 8, y - 16, 8, regular, GREY);
    text(value, x + 8, y - 36, 13, bold);
  });
  y -= 70;
  text(`${rows.length} pharmacie${rows.length > 1 ? "s" : ""} · ${total.sales} vente${total.sales > 1 ? "s" : ""} terminée${total.sales > 1 ? "s" : ""}`, M, y, 9, regular, GREY);
  y -= 24;

  const cols = { sales: M + 290, proposed: M + 340, sold: M + 385, rate: M + 435, revenue: M + width };
  const header = () => {
    text("Pharmacie", M, y, 8.5, bold, GREY);
    right("Ventes", cols.sales, y, 8.5, bold, GREY);
    right("Proposés", cols.proposed, y, 8.5, bold, GREY);
    right("Vendus", cols.sold, y, 8.5, bold, GREY);
    right("Taux", cols.rate, y, 8.5, bold, GREY);
    right("CA ajouté", cols.revenue, y, 8.5, bold, GREY);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: M + width, y }, thickness: 0.6, color: LINE });
  };
  header();
  for (const { name, city, report } of rows) {
    if (y - 18 < M + 30) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
      header();
    }
    y -= 15;
    const label = city ? `${name} (${city})` : name;
    text(label.length > 52 ? `${label.slice(0, 49)}...` : label, M, y, 9);
    right(String(report.sales), cols.sales, y, 9, regular, GREY);
    right(String(report.proposed), cols.proposed, y, 9);
    right(String(report.sold), cols.sold, y, 9, bold, GREEN);
    right(percent(report.proposed > 0 ? report.sold / report.proposed : null), cols.rate, y, 9);
    right(euros(report.revenueCents), cols.revenue, y, 9, bold);
  }
  if (rows.length === 0) {
    y -= 15;
    text("Aucune pharmacie cliente pour l'instant.", M, y, 9, regular, GREY);
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(safe("Ventes terminées au comptoir : un conseil bipé (ou déclaré vendu) est vendu, au prix de vente TTC de la pharmacie. Pharmacies de démonstration exclues."), { x: M, y: 26, size: 7, font: regular, color: GREY });
    const footer = safe(`Généré le ${fmtDate(input.generatedAt, timeZone, { dateStyle: "long", timeStyle: "short" })} - page ${index + 1}/${pages.length}`);
    p.drawText(footer, { x: A4[0] - M - regular.widthOfTextAtSize(footer, 7), y: 14, size: 7, font: regular, color: GREY });
  });
  return pdf.save();
}
