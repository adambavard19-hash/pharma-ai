/**
 * La plaquette GÉNÉRIQUE de l’ancienne mise en page (six feuilles). Depuis le 16 oct. 2026, public/plaquette/pharmaboost-plaquette.pdf vient de scripts/plaquettes-pdf.mjs (docs/plaquettes/presentation.html) ; ce script écrit ailleurs par défaut pour ne pas l’écraser.
 *
 *   npm run plaquette:pdf
 *
 * Chromium (Playwright, déjà installé pour le PDF du plan patient) ouvre /plaquette/imprimer — la plaquette seule, sans session
 * ni donnée personnelle — et l'imprime en A4, fonds compris, avec les marges de la plaquette (aucune). L'application doit
 * tourner (`npm run live`). Le fichier est ensuite relu : six pages A4, moins de 5 Mo, sinon le script échoue.
 *
 *   PLAQUETTE_URL   adresse de l'application (défaut http://localhost:3000)
 *   PLAQUETTE_OUT   fichier écrit (défaut public/plaquette/pharmaboost-plaquette.pdf)
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const BASE_URL = (process.env.PLAQUETTE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), process.env.PLAQUETTE_OUT ?? ".live/plaquette-ancienne.pdf");
const EXPECTED_PAGES = 6;
const MAX_BYTES = 5 * 1024 * 1024;
/** A4 en points PDF (595,28 × 841,89), à un point près. */
const A4 = { width: 595.28, height: 841.89 };

async function main() {
  const url = `${BASE_URL}/plaquette/imprimer`;
  const reachable = await fetch(url).then((response) => response.ok).catch(() => false);
  if (!reachable) {
    console.error(`✗ ${url} ne répond pas. Démarrez l'application : npm run live`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    // La largeur d'une feuille A4 à 96 ppp : la mise en page est celle de l'impression, pas celle d'un grand écran.
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.emulateMedia({ media: "print" });
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    if (!response?.ok()) throw new Error(`la page a répondu ${response?.status() ?? "sans statut"}`);
    // Les polices et toutes les images chargées avant d'imprimer : sans cela, une vignette pouvait manquer au PDF.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => (image.complete ? null : new Promise((done) => image.addEventListener("load", done, { once: true })))));
    });
    const sheets = await page.locator(".plq-page").count();
    if (sheets !== EXPECTED_PAGES) throw new Error(`${sheets} feuilles trouvées sur la page, ${EXPECTED_PAGES} attendues`);

    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });

    const doc = await PDFDocument.load(pdf);
    const pages = doc.getPages();
    if (pages.length !== EXPECTED_PAGES) throw new Error(`le PDF a ${pages.length} pages, ${EXPECTED_PAGES} attendues (une feuille déborde ?)`);
    for (const [index, sheet] of pages.entries()) {
      const { width, height } = sheet.getSize();
      if (Math.abs(width - A4.width) > 1 || Math.abs(height - A4.height) > 1) throw new Error(`la page ${index + 1} mesure ${width.toFixed(1)} × ${height.toFixed(1)} pt, pas A4`);
    }
    if (pdf.byteLength > MAX_BYTES) throw new Error(`le PDF pèse ${(pdf.byteLength / 1024 / 1024).toFixed(1)} Mo (plus de 5 Mo)`);

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, pdf);
    const size = statSync(OUT).size;
    console.log(`✓ ${relative(process.cwd(), OUT)} · ${pages.length} pages A4 · ${(size / 1024).toFixed(0)} Ko`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`✗ Plaquette non produite : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
