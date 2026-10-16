/**
 * Les deux plaquettes en PDF (16 oct. 2026) : docs/plaquettes/presentation.html (prospects) et guide-commercial.html
 * (commerciaux), imprimées en A4 par Chromium (Playwright). Les PDF sont écrits sur le Bureau, et la présentation aussi dans
 * public/plaquette/ (lien « Version générique » de l'extranet).
 *
 *   node scripts/plaquettes-pdf.mjs            les deux
 *   node scripts/plaquettes-pdf.mjs --apercu   aussi une image PNG de chaque page dans .live/plaquettes-apercu/
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

const DOCS = resolve("docs/plaquettes");
const DESKTOP = join(homedir(), "Desktop");
const PREVIEW = process.argv.includes("--apercu");
const JOBS = [
  { src: "presentation.html", out: "PharmaBoost-Plaquette-presentation.pdf", publicCopy: "public/plaquette/pharmaboost-plaquette.pdf" },
  ...(process.argv.includes("--presentation") ? [] : [{ src: "guide-commercial.html", out: "PharmaBoost-Guide-commercial.pdf", publicCopy: "public/plaquette/pharmaboost-guide-commercial.pdf" }]),
];

const browser = await chromium.launch({ headless: true });
try {
  for (const job of JOBS) {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(join(DOCS, job.src)).href, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((ok) => img.addEventListener("load", ok, { once: true })))));
    });
    const family = await page.evaluate(() => document.fonts.check('700 16px "Plus Jakarta Sans"'));
    if (!family) throw new Error("police Plus Jakarta Sans non chargée");
    // Une feuille qui déborde se voit ici : le contenu dépasse la hauteur de la page.
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll(".page")).map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean));
    if (overflow.length) console.warn(`⚠ ${job.src} : page(s) qui débordent : ${overflow.join(", ")}`);
    if (PREVIEW) {
      mkdirSync(".live/plaquettes-apercu", { recursive: true });
      const pages = await page.locator(".page").all();
      for (const [i, p] of pages.entries()) await p.screenshot({ path: `.live/plaquettes-apercu/${job.src.replace(".html", "")}-${i + 1}.png` });
    }
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    const target = join(DESKTOP, job.out);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(target, pdf);
    if (job.publicCopy) copyFileSync(target, job.publicCopy);
    const count = (await PDFDocument.load(readFileSync(target))).getPageCount();
    console.log(`✓ ${job.out} · ${count} pages · ${(pdf.byteLength / 1024).toFixed(0)} Ko`);
    await page.close();
  }
} finally {
  await browser.close();
}
