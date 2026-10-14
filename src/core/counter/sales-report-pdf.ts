import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ATTACH_TARGET, euros, percent, SALES_REPORT_PERIODS, type SalesReport } from "./sales-report";

/**
 * Le rapport PDF de performance du comptoir : la preuve, imprimable et transmissible, de ce que PharmaBoost apporte à une
 * officine sur une période — ventes terminées, part avec un conseil vendu (objectif 10 %), conseils vendus, chiffre d'affaires
 * ajouté, jour par jour, par collaborateur et par produit. Pur JavaScript (pdf-lib), sans navigateur. Aucune donnée de patient.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 44;
const GREEN = rgb(15 / 255, 118 / 255, 110 / 255);
const MINT = rgb(232 / 255, 246 / 255, 241 / 255);
const INK = rgb(17 / 255, 24 / 255, 39 / 255);
const GREY = rgb(107 / 255, 114 / 255, 128 / 255);
const LINE = rgb(226 / 255, 232 / 255, 236 / 255);
const AMBER = rgb(180 / 255, 83 / 255, 9 / 255);

/** pdf-lib (polices standard) ne dessine que WinAnsi : espaces fines, tirets longs et guillemets courbes remplacés. */
function safe(text: string): string {
  return text
    .replace(/\u202f/g, "\u00a0") // espace fine → espace insécable (WinAnsi) : « 10 % » ne se coupe pas
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/[^\x00-\xFF€œŒ]/g, "?");
}

const fmtDate = (date: Date, timeZone: string, style: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone, ...style }).format(date);

export async function renderSalesReportPdf(input: { pharmacyName: string; report: SalesReport; generatedAt: Date; timeZone: string }): Promise<Uint8Array> {
  const { report, timeZone } = input;
  const pdf = await PDFDocument.create();
  const periodLabel = SALES_REPORT_PERIODS.find((period) => period.key === report.period)?.label ?? "";
  pdf.setTitle(safe(`Performance du comptoir - ${input.pharmacyName} - ${periodLabel}`));
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
  const ensure = (needed: number) => {
    if (y - needed > M + 30) return;
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };

  // En-tête
  page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: GREEN });
  text("PharmaBoost", M, A4[1] - 40, 20, bold, rgb(1, 1, 1));
  text("Rapport de performance du comptoir", M, A4[1] - 62, 12, regular, rgb(0.88, 0.97, 0.94));
  right(input.pharmacyName, A4[0] - M, A4[1] - 40, 12, bold, rgb(1, 1, 1));
  right(`${periodLabel} - du ${fmtDate(report.from, timeZone, { dateStyle: "long" })} au ${fmtDate(report.to, timeZone, { dateStyle: "long" })}`, A4[0] - M, A4[1] - 62, 9.5, regular, rgb(0.88, 0.97, 0.94));
  y = A4[1] - 122;

  // Le verdict : l'objectif des 10 %
  const verdict =
    report.attachRate === null
      ? "Aucune vente terminée sur la période."
      : report.meetsTarget
        ? `Objectif atteint : ${percent(report.attachRate)} des ventes terminées repartent avec au moins un conseil vendu (objectif : ${percent(ATTACH_TARGET)} minimum).`
        : `${percent(report.attachRate)} des ventes terminées repartent avec au moins un conseil vendu (objectif : ${percent(ATTACH_TARGET)} minimum).`;
  // La phrase sur une ou deux lignes, dans le cadre.
  const words = safe(verdict).split(" ");
  const lines: string[] = [""];
  for (const word of words) {
    const candidate = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (bold.widthOfTextAtSize(candidate, 10) <= width - 24) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  const boxH = 16 + lines.length * 14;
  page.drawRectangle({ x: M, y: y - boxH + 6, width, height: boxH, color: MINT, borderColor: GREEN, borderWidth: 0.6 });
  lines.forEach((line, index) => text(line, M + 12, y - 12 - index * 14, 10, bold, report.meetsTarget === false ? AMBER : GREEN));
  y -= boxH + 18;

  // Les chiffres clés
  const tiles: [string, string][] = [
    ["Ventes terminées", String(report.sales)],
    ["Avec un conseil vendu", `${report.withAdvice} (${percent(report.attachRate)})`],
    ["Conseils vendus", `${report.sold} / ${report.proposed} proposés`],
    ["Chiffre d'affaires ajouté", euros(report.revenueCents)],
    ["Marge ajoutée (HT)", report.marginCents > 0 ? euros(report.marginCents) : "-"],
    ["CA ajouté par vente", report.revenuePerSaleCents === null ? "-" : euros(report.revenuePerSaleCents)],
  ];
  const tileW = (width - 2 * 10) / 3;
  tiles.forEach(([label, value], index) => {
    const x = M + (index % 3) * (tileW + 10);
    const top = y - Math.floor(index / 3) * 58;
    page.drawRectangle({ x, y: top - 48, width: tileW, height: 50, borderColor: LINE, borderWidth: 0.8 });
    text(label, x + 10, top - 16, 8.5, regular, GREY);
    text(value, x + 10, top - 36, 13, bold);
  });
  y -= 128;

  // Le graphique : chiffre d'affaires ajouté par jour (ou par heure)
  text(report.period === "day" ? "Par heure" : "Par jour", M, y, 11, bold);
  text("Barres : ventes terminées (gris) et ventes avec un conseil vendu (vert)", M + 70, y, 8, regular, GREY);
  y -= 12;
  const chartH = 110;
  const max = Math.max(1, ...report.buckets.map((bucket) => bucket.sales));
  const slot = width / Math.max(1, report.buckets.length);
  const barW = Math.max(3, Math.min(22, slot * 0.6));
  page.drawLine({ start: { x: M, y: y - chartH }, end: { x: M + width, y: y - chartH }, thickness: 0.6, color: LINE });
  report.buckets.forEach((bucket, index) => {
    const x = M + index * slot + (slot - barW) / 2;
    const hTotal = (bucket.sales / max) * (chartH - 14);
    const hAdvice = (bucket.withAdvice / max) * (chartH - 14);
    if (hTotal > 0) page.drawRectangle({ x, y: y - chartH, width: barW, height: hTotal, color: LINE });
    if (hAdvice > 0) page.drawRectangle({ x, y: y - chartH, width: barW, height: hAdvice, color: GREEN });
    const every = report.buckets.length > 16 ? 3 : 1;
    if (index % every === 0) text(bucket.label, x - 2, y - chartH - 11, 6.5, regular, GREY);
  });
  y -= chartH + 30;

  // Le détail jour par jour
  ensure(40);
  text("Détail", M, y, 11, bold);
  y -= 16;
  const cols = [M, M + 120, M + 230, M + 340, M + width];
  const header = ["", "Ventes terminées", "Avec conseil vendu", "Conseils vendus", "CA ajouté"];
  header.forEach((label, index) => (index === 0 ? text(report.period === "day" ? "Heure" : "Jour", cols[0], y, 8.5, bold, GREY) : right(label, index === 4 ? cols[4] : cols[index] + 90, y, 8.5, bold, GREY)));
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + width, y }, thickness: 0.6, color: LINE });
  for (const bucket of report.buckets.filter((row) => row.sales > 0)) {
    ensure(16);
    y -= 13;
    text(bucket.label, cols[0], y, 9);
    right(String(bucket.sales), cols[1] + 90, y, 9);
    right(`${bucket.withAdvice} (${percent(bucket.sales ? bucket.withAdvice / bucket.sales : null)})`, cols[2] + 90, y, 9);
    right(String(bucket.sold), cols[3] + 90, y, 9);
    right(euros(bucket.revenueCents), cols[4], y, 9, bold);
  }
  if (report.sales === 0) {
    y -= 14;
    text("Aucune vente terminée sur la période.", M, y, 9, regular, GREY);
  }
  y -= 26;

  // Par collaborateur
  if (report.byPerson.length > 0) {
    ensure(40);
    text("Par collaborateur", M, y, 11, bold);
    y -= 16;
    for (const person of report.byPerson) {
      ensure(16);
      text(person.who, M, y, 9);
      right(`${person.sales} ventes - ${person.withAdvice} avec conseil (${percent(person.sales ? person.withAdvice / person.sales : null)}) - ${person.sold} conseils`, M + width - 90, y, 9, regular, GREY);
      right(euros(person.revenueCents), M + width, y, 9, bold);
      y -= 13;
    }
    y -= 14;
  }

  // Les produits conseillés les plus vendus
  if (report.topProducts.length > 0) {
    ensure(40);
    text("Conseils les plus vendus", M, y, 11, bold);
    y -= 16;
    for (const product of report.topProducts) {
      ensure(16);
      text(product.name.length > 70 ? `${product.name.slice(0, 67)}...` : product.name, M, y, 9);
      right(`${product.sold} vendu${product.sold > 1 ? "s" : ""}`, M + width - 90, y, 9, regular, GREY);
      right(euros(product.revenueCents), M + width, y, 9, bold);
      y -= 13;
    }
  }

  // Pied de page sur chaque page
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(safe("Chiffres déclarés au comptoir (« Vendu » à chaque vente terminée), prix de vente TTC de l'officine. Source : PharmaBoost."), { x: M, y: 26, size: 7, font: regular, color: GREY });
    const footer = safe(`Généré le ${fmtDate(input.generatedAt, timeZone, { dateStyle: "long", timeStyle: "short" })} - page ${index + 1}/${pages.length}`);
    p.drawText(footer, { x: A4[0] - M - regular.widthOfTextAtSize(footer, 7), y: 14, size: 7, font: regular, color: GREY });
  });
  return pdf.save();
}
