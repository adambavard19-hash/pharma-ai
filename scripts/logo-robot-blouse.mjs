/**
 * Le logo PharmaBoost = le robot en blouse, tablette en main (fondateur, 31 oct. 2026 : « je ne veux plus voir l'ancien robot au
 * casque »). Part d'une capture transparente en 2048 px du vrai composant (`/robot-apercu/icone`, photographiée au navigateur)
 * et réécrit toutes les images de marque : site, e-mails, application mobile, films.
 *
 *   node scripts/logo-robot-blouse.mjs <robot-2048-transparent.png>
 */
import sharp from "sharp";
import { writeFileSync, existsSync } from "node:fs";

const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) throw new Error("Indiquez la capture transparente du robot (2048 px).");
const robot = await sharp(SRC).trim().toBuffer();
const T = { r: 0, g: 0, b: 0, alpha: 0 };

/** Le robot seul, sans fond, centré dans un carré (marge en part de la taille). */
const alone = (size, margin = 0.06) => {
  const inner = Math.round(size * (1 - 2 * margin));
  return sharp(robot).resize(inner, inner, { fit: "contain", background: T }).extend({ top: Math.round((size - inner) / 2), bottom: size - inner - Math.round((size - inner) / 2), left: Math.round((size - inner) / 2), right: size - inner - Math.round((size - inner) / 2), background: T });
};
/** Le robot sur un carré clair aux couleurs de la marque (blanc vers menthe), coins arrondis ou plein bord. */
async function onTile(size, { round = true, scale = 0.78, bg = ["#FFFFFF", "#E4F4EC"] } = {}) {
  const r = round ? Math.round(size * 0.22) : 0;
  const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/></svg>`);
  const inner = Math.round(size * scale);
  const pic = await sharp(robot).resize(inner, inner, { fit: "contain", background: T }).toBuffer();
  return sharp(tile).composite([{ input: pic, gravity: "centre" }]);
}
const out = async (img, file) => { await img.png({ compressionLevel: 9 }).toFile(file); console.log("✓", file); };

// Le site : robot seul (réseaux, documents) et logo carré.
await out(alone(2048), "public/logo-robot-2048.png");
await out(alone(1080), "public/logo-robot-1080.png");
const r1024 = await alone(1024).png().toBuffer();
const svgWrap = (b64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><image href="data:image/png;base64,${b64}" width="1024" height="1024"/></svg>\n`;
writeFileSync("public/logo-robot.svg", svgWrap(r1024.toString("base64")));
console.log("✓ public/logo-robot.svg");
const tile1024 = await (await onTile(1024)).png().toBuffer();
writeFileSync("public/logo.svg", svgWrap(tile1024.toString("base64")));
console.log("✓ public/logo.svg");
await out(await onTile(1254), "public/logo.png");
await out(await onTile(1200), "public/logo-1200.png");
await out(await onTile(256), "public/logo-256.png");
// Les e-mails : le robot du bilan (fixe, sans fond) et ses deux « GIF » (une seule image, sur le fond attendu).
await out(alone(192, 0.04), "public/email/robot-192.png");
await (await onTile(128, { round: false, scale: 0.9, bg: ["#FFFFFF", "#FFFFFF"] })).gif().toFile("public/email/robot-vivant.gif");
await (await onTile(300, { round: false, scale: 0.86, bg: ["#EAF5F0", "#EAF5F0"] })).gif().toFile("public/email/robot-bilan.gif");
console.log("✓ public/email/robot-vivant.gif, robot-bilan.gif");
// L'application mobile (PWA) : icônes pleines, sans transparence pour Apple.
await out(await onTile(192, { round: false }), "public/mobile/icon-192.png");
await out(await onTile(512, { round: false }), "public/mobile/icon-512.png");
await out(await onTile(512, { round: false, scale: 0.62 }), "public/mobile/maskable-512.png");
await out(await onTile(180, { round: false }), "public/mobile/apple-touch-icon.png");
// Les films (Remotion) : mêmes fichiers, servis par video/public.
for (const dir of ["video/public/rembobine/images", "video/public/prise-en-main"]) {
  if (existsSync(dir)) {
    writeFileSync(`${dir}/logo-robot.svg`, svgWrap(r1024.toString("base64")));
    if (existsSync(`${dir}/logo-robot-1080.png`)) await out(alone(1080), `${dir}/logo-robot-1080.png`);
    if (existsSync(`${dir}/logo.svg`)) writeFileSync(`${dir}/logo.svg`, svgWrap(tile1024.toString("base64")));
    console.log("✓", dir);
  }
}
