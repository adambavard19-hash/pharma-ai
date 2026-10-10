/**
 * Écrit l'aperçu de la bannière PharmaBoost (agent/apercu/banniere.html) et l'ouvre dans le navigateur (macOS).
 *   npm run apercu:banniere
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bannerPreviewHtml } from "../agent/src/banner-preview";

const target = resolve(process.cwd(), "agent/apercu/banniere.html");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, bannerPreviewHtml(), "utf8");
console.log(`Aperçu écrit : ${target}`);
if (process.platform === "darwin" && !process.argv.includes("--sans-ouvrir")) execFile("open", [target]);
