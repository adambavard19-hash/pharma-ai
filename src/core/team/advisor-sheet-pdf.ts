import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { encodeQr } from "@/lib/qrcode";
import { percentLabel, type AdvisorStats } from "./advisor-sheet";

/**
 * La fiche « Conseiller certifié PharmaBoost » en PDF (19 nov. 2026) : une page A4 au style d'un certificat — cadre, sceau,
 * nom, chiffres clés, domaines, avis des patients, niveau — et un QR code qui mène à la page de vérification. Pur JavaScript
 * (pdf-lib), sans navigateur. Aucun montant, aucun patient.
 */

const A4: [number, number] = [595.28, 841.89];
const GREEN = rgb(14 / 255, 138 / 255, 123 / 255);
const DEEP = rgb(15 / 255, 47 / 255, 42 / 255);
const MINT = rgb(232 / 255, 246 / 255, 241 / 255);
const GOLD = rgb(196 / 255, 151 / 255, 52 / 255);
const GREY = rgb(90 / 255, 110 / 255, 105 / 255);
const LINE = rgb(214 / 255, 228 / 255, 223 / 255);
const WHITE = rgb(1, 1, 1);

function safe(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/★/g, "*")
    .replace(/[^\x00-\xFF€œŒ]/g, "?");
}

export type AdvisorSheetInput = {
  fullName: string;
  roleLabel: string;
  pharmacyName: string;
  pharmacyCity: string | null;
  stats: AdvisorStats;
  code: string;
  verifyUrl: string;
  issuedAt: Date;
  timeZone: string;
};

export async function renderAdvisorSheetPdf(input: AdvisorSheetInput): Promise<Uint8Array> {
  const { stats } = input;
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Conseiller certifié PharmaBoost - ${input.fullName}`));
  pdf.setAuthor("PharmaBoost");
  pdf.setSubject(safe(`Fiche n° ${input.code}`));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const page: PDFPage = pdf.addPage(A4);
  const [W, H] = A4;

  const text = (value: string, x: number, y: number, size: number, font: PDFFont = regular, color = DEEP) => page.drawText(safe(value), { x, y, size, font, color });
  const center = (value: string, y: number, size: number, font: PDFFont = regular, color = DEEP, cx = W / 2) => {
    const clean = safe(value);
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y, size, font, color });
  };
  const day = (date: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: input.timeZone, dateStyle: "long" }).format(date);

  // Cadre de certificat : double filet, vert puis or.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(250 / 255, 252 / 255, 251 / 255) });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: GREEN, borderWidth: 2.2 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: GOLD, borderWidth: 0.8 });

  // En-tête
  page.drawRectangle({ x: 30, y: H - 128, width: W - 60, height: 98, color: GREEN });
  text("PharmaBoost", 56, H - 72, 24, bold, WHITE);
  text("Le copilote du conseil en officine", 56, H - 92, 10.5, regular, rgb(0.86, 0.97, 0.93));
  // Sceau
  const sx = W - 104;
  const sy = H - 132;
  page.drawCircle({ x: sx, y: sy, size: 50, color: GOLD });
  page.drawCircle({ x: sx, y: sy, size: 44, borderColor: WHITE, borderWidth: 1.2 });
  center("CERTIFIÉ", sy + 10, 11, bold, WHITE, sx);
  center("PHARMABOOST", sy - 4, 8.5, bold, WHITE, sx);
  center(String(input.issuedAt.getFullYear()), sy - 18, 9, regular, WHITE, sx);

  // Titre et identité
  let y = H - 190;
  center("FICHE CONSEILLER", y, 11, bold, GREEN);
  y -= 40;
  center(input.fullName, y, 30, bold, DEEP);
  y -= 22;
  center(input.roleLabel, y, 13, regular, GREY);
  y -= 18;
  center(`${input.pharmacyName}${input.pharmacyCity ? ` - ${input.pharmacyCity}` : ""}`, y, 11, regular, GREY);
  y -= 34;
  // Niveau
  const levelText = safe(stats.level.label.toUpperCase());
  const lw = bold.widthOfTextAtSize(levelText, 12) + 36;
  page.drawRectangle({ x: W / 2 - lw / 2, y: y - 9, width: lw, height: 28, color: MINT, borderColor: GREEN, borderWidth: 1 });
  center(levelText, y, 12, bold, GREEN);
  y -= 36;
  center(
    stats.since ? `Conseille avec PharmaBoost depuis le ${day(new Date(`${stats.since}T12:00:00Z`))}` : "Premiers pas avec PharmaBoost",
    y,
    10.5,
    serif,
    GREY,
  );

  // Chiffres clés : 3 x 2 cartes
  y -= 34;
  const cards: [string, string][] = [
    [String(stats.sales), "ventes au comptoir"],
    [String(stats.proposed), "conseils proposés"],
    [String(stats.sold), "conseils vendus"],
    [percentLabel(stats.acceptRate), "d'acceptation par les patients"],
    [percentLabel(stats.soldRate), "des conseils proposés vendus"],
    [percentLabel(stats.attachRate), "des ventes avec un conseil"],
  ];
  const cw = (W - 112 - 2 * 14) / 3;
  const ch = 70;
  cards.forEach(([value, label], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 56 + col * (cw + 14);
    const top = y - row * (ch + 12);
    page.drawRectangle({ x, y: top - ch, width: cw, height: ch, color: WHITE, borderColor: LINE, borderWidth: 1 });
    center(value, top - 34, 24, bold, GREEN, x + cw / 2);
    center(label, top - 54, 8.8, regular, GREY, x + cw / 2);
  });
  y -= 2 * ch + 12 + 34;

  // Domaines
  text("DOMAINES DE CONSEIL", 56, y, 10, bold, GREEN);
  y -= 18;
  if (stats.domains.length === 0) {
    text("Les domaines apparaîtront avec les premiers conseils vendus.", 56, y, 10, serif, GREY);
    y -= 16;
  } else {
    for (const domain of stats.domains) {
      text(domain.label, 56, y, 10.5, bold, DEEP);
      const barX = 250;
      const barW = W - 56 - barX - 40;
      page.drawRectangle({ x: barX, y: y - 1, width: barW, height: 8, color: MINT });
      page.drawRectangle({ x: barX, y: y - 1, width: Math.max(4, barW * domain.share), height: 8, color: GREEN });
      text(percentLabel(domain.share), W - 56 - 32, y, 9.5, regular, GREY);
      y -= 20;
    }
  }

  // Avis des patients
  y -= 10;
  text("AVIS DES PATIENTS", 56, y, 10, bold, GREEN);
  y -= 20;
  if (stats.reviews.count === 0 || stats.reviews.average === null) {
    text("Aucun avis pour l'instant, laissés par les patients dans l'appli PharmaBoost.", 56, y, 10, serif, GREY);
  } else {
    const full = Math.round(stats.reviews.average);
    for (let i = 0; i < 5; i += 1) drawStar(page, 62 + i * 18, y + 4, 7, i < full ? GOLD : LINE);
    text(`${String(stats.reviews.average).replace(".", ",")} / 5 - ${stats.reviews.count} avis de patients`, 160, y, 11, bold, DEEP);
  }

  // Pied : vérification
  const qr = encodeQr(input.verifyUrl);
  const qs = 78;
  const cell = qs / qr.size;
  const qx = W - 56 - qs;
  const qy = 60;
  page.drawRectangle({ x: qx - 6, y: qy - 6, width: qs + 12, height: qs + 12, color: WHITE, borderColor: LINE, borderWidth: 1 });
  qr.modules.forEach((line, r) =>
    line.forEach((on, c) => {
      if (on) page.drawRectangle({ x: qx + c * cell, y: qy + qs - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: DEEP });
    }),
  );
  page.drawLine({ start: { x: 56, y: 156 }, end: { x: W - 56, y: 156 }, thickness: 0.6, color: LINE });
  text(`Fiche n° ${input.code}`, 56, 132, 11, bold, DEEP);
  text(`Émise le ${day(input.issuedAt)}`, 56, 116, 10, regular, GREY);
  text("Vérifiez son authenticité :", 56, 96, 9.5, regular, GREY);
  text(input.verifyUrl.replace(/^https?:\/\//, ""), 56, 82, 9.5, bold, GREEN);
  text("Chiffres mesurés par PharmaBoost au comptoir, sur les ventes terminées.", 56, 62, 8, regular, GREY);
  text("Aucun montant ni aucune donnée de patient ne figure sur cette fiche.", 56, 51, 8, regular, GREY);

  // Filigrane discret
  page.drawText("PharmaBoost", { x: 95, y: 250, size: 78, font: bold, color: GREEN, opacity: 0.035, rotate: degrees(30) });

  return pdf.save();
}

function drawStar(page: PDFPage, cx: number, cy: number, r: number, color: ReturnType<typeof rgb>) {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    points.push(`${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`);
  }
  page.drawSvgPath(`M ${points.join(" L ")} Z`, { x: cx, y: cy, color });
}
