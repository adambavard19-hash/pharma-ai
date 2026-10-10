/**
 * Écrit l'aperçu de la bannière PharmaBoost (agent/apercu/banniere.html) et l'ouvre dans le navigateur (macOS).
 *   npm run apercu:banniere
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bannerPreviewHtml } from "../agent/src/banner-preview";

const html = bannerPreviewHtml();
const target = resolve(process.cwd(), "agent/apercu/banniere.html");
// La même page, intégrée au site public (animation vivante de la page d'accueil, en iframe avec ?integre=1).
const site = resolve(process.cwd(), "public/site/banniere-demo.html");
for (const file of [target, site]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
}
console.log(`Aperçu écrit : ${target}\nCopie pour le site public : ${site}`);
if (process.platform === "darwin" && !process.argv.includes("--sans-ouvrir")) execFile("open", [target]);
