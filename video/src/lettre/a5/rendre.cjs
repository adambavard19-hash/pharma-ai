// La lettre A5 de « Lettre sous la porte » (31 oct. 2026) : le QR code (vers la page de la lettre, comptée dans la console) posé
// dans lettre.html, puis Chrome sans fenêtre l'imprime en PDF A5 (fonds compris) et en aperçu PNG, sur le Bureau.
//   node video/src/lettre/a5/rendre.cjs   (depuis la racine du projet)
const QRCode = require("qrcode");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const URL_LETTRE = "https://pharmaboost.app/decouvrir/lettre?source=courrier";
(async () => {
  const svg = await QRCode.toString(URL_LETTRE, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0F2B26", light: "#FFFFFF" } });
  const html = fs.readFileSync(path.join(__dirname, "lettre.html"), "utf8").replace("__QR__", svg);
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 560, height: 794 }, deviceScaleFactor: 3 });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  const desk = path.join(os.homedir(), "Desktop");
  await p.pdf({ path: path.join(desk, "PharmaBoost-Lettre-A5.pdf"), width: "148mm", height: "210mm", printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: path.join(desk, "PharmaBoost-Lettre-A5-apercu.png"), fullPage: true });
  await b.close();
  console.log("✓ PDF A5 et aperçu sur le Bureau");
})();
