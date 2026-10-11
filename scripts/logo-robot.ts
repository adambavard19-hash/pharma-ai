/**
 * Le logo PharmaBoost : le petit robot de la bannière du comptoir, sur le fond bleu-vert de la bannière.
 *
 * Même dessin que la mascotte (`mascotSvg` dans agent/src/banner-preview.ts, `Mascot.Draw` côté Windows), mêmes couleurs
 * (`BANNER.colors`), figé dans son expression souriante. Écrit `public/logo.svg` (la source) puis toutes les déclinaisons PNG
 * déjà utilisées par l'application : `public/logo.png`, `logo-1200.png`, `logo-256.png`, `src/app/icon.png`, `src/app/apple-icon.png`.
 * Et le robot seul, sans fond : `public/logo-robot.svg`, `logo-robot-2048.png`, `logo-robot-1080.png` (réseaux sociaux).
 *
 * PharmaBoost Mobile (application installable) : `public/mobile/icon-192.png`, `icon-512.png` (le carré arrondi),
 * `maskable-512.png` (fond plein, robot dans la zone sûre centrale de 80 % que les lanceurs Android découpent en
 * cercle ou en goutte) et `apple-touch-icon.png` (180 px, fond plein : iOS arrondit lui-même les coins).
 *
 *   npx tsx scripts/logo-robot.ts           tout
 *   npx tsx scripts/logo-robot.ts --pwa     seulement les icônes de l'application mobile
 *   npx tsx scripts/logo-robot.ts --email   les robots du bilan patient : public/email/robot-192.png (fixe, sans fond) et
 *                                           public/email/robot-vivant.gif (animé, sur fond blanc)
 *   npx tsx scripts/logo-robot.ts --ios     l'icône App Store (1024 px, sans transparence : Apple la refuse) et l'écran de
 *                                           lancement de l'application iPhone (application-mobile/ios)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { BANNER } from "../agent/src/banner-design";

const C = BANNER.colors;

function arc(cx: number, cy: number, rx: number, ry: number, start: number, sweep: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)].map((n) => n.toFixed(2)).join(" ");
  };
  return `M ${point(start)} A ${rx} ${ry} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${point(start + sweep)}`;
}

/** Un œil ouvert, avec son reflet : lisible même à 16 pixels. */
const eye = (cx: number, open = 1) =>
  open < 0.25
    ? `<path d="M ${cx - 5} 42 Q ${cx} 44.5 ${cx + 5} 42" fill="none" stroke="${C.eye}" stroke-width="2.6" stroke-linecap="round"/>`
    : `<ellipse cx="${cx}" cy="42" rx="4.8" ry="${+(6.4 * open).toFixed(2)}" fill="${C.eye}"/><circle cx="${cx - 1.5}" cy="${+(42 - 2.6 * open).toFixed(2)}" r="1.7" fill="#fff" fill-opacity=".85"/>`;

/** Le robot dans sa boîte de 100 unités, comme la mascotte de la bannière. `pose` anime le robot de l'e-mail (yeux, lampe, étoile). */
type Pose = { open?: number; lamp?: number; spark?: number };
const robotOf = ({ open = 1, lamp = 0.28, spark = 1 }: Pose = {}) => `
    <line x1="50" y1="17" x2="50" y2="8" stroke="${C.shellEdge}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="6" r="${+(5.2 + 10 * lamp).toFixed(2)}" fill="${C.eye}" fill-opacity="${lamp.toFixed(2).replace(/^0/, "")}"/>
    <circle cx="50" cy="6" r="3.8" fill="${C.eye}"/>
    <path d="${arc(50, 44, 41, 35, 192, 156)}" fill="none" stroke="${C.ear}" stroke-width="5" stroke-linecap="round"/>
    <rect x="3" y="36" width="15" height="28" rx="7" fill="url(#g-ear)"/>
    <rect x="82" y="36" width="15" height="28" rx="7" fill="url(#g-ear)"/>
    <rect x="14" y="16" width="72" height="58" rx="24" fill="url(#g-shell)" stroke="${C.shellEdge}" stroke-width="1.6"/>
    <rect x="22" y="25" width="56" height="40" rx="17" fill="url(#g-screen)"/>
    ${eye(38, open)}${eye(62, open)}
    <path d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill="${C.eye}"/>
    <circle cx="74" cy="69" r="15" fill="#fff" fill-opacity=".95"/>
    <circle cx="74" cy="69" r="13.5" fill="url(#g-badge)"/>
    <rect x="72.2" y="61" width="3.6" height="16" rx="1" fill="#fff"/><rect x="66" y="67.2" width="16" height="3.6" rx="1" fill="#fff"/>
    ${spark === 1 ? "" : `<g transform="translate(80 14) scale(${spark.toFixed(2)}) translate(-80 -14)">`}<path d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A"/>${spark === 1 ? "" : "</g>"}`;
const robot = robotOf();

/** L'icône : le carré arrondi bleu-vert de la bannière, une lueur derrière la tête, le robot centré. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="1024" height="1024">
  <defs>
    <linearGradient id="g-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cardTop}"/><stop offset="1" stop-color="${C.cardBottom}"/></linearGradient>
    <radialGradient id="g-glow" cx=".5" cy=".46" r=".5"><stop offset="0" stop-color="${C.glow}" stop-opacity=".38"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="g-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.shellTop}"/><stop offset="1" stop-color="${C.shellBottom}"/></linearGradient>
    <linearGradient id="g-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.screenTop}"/><stop offset="1" stop-color="${C.screenBottom}"/></linearGradient>
    <linearGradient id="g-ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ear}"/><stop offset="1" stop-color="#12968C"/></linearGradient>
    <linearGradient id="g-badge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.accentDark}"/></linearGradient>
  </defs>
  <rect width="120" height="120" rx="27" fill="url(#g-bg)"/>
  <circle cx="60" cy="56" r="52" fill="url(#g-glow)"/>
  <g transform="translate(13 15) scale(.94)">${robot}
  </g>
</svg>
`;

/** Le robot seul, sans fond (transparent) : pour les réseaux sociaux, les documents, les fonds de couleur. Carré, robot centré. */
const robotDefs = svg.slice(svg.indexOf("<defs>"), svg.indexOf("</defs>") + "</defs>".length);
const transparentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -15 112 112" width="1024" height="1024">
  ${robotDefs}
  <g>${robot}
  </g>
</svg>
`;

/** Fond plein bord à bord, robot réduit au centre : la version « maskable » et l'icône Apple. */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="1024" height="1024">
  ${robotDefs}
  <rect width="120" height="120" fill="url(#g-bg)"/>
  <circle cx="60" cy="57" r="44" fill="url(#g-glow)"/>
  <g transform="translate(29 28) scale(.62)">${robot}
  </g>
</svg>
`;
const pwaOnly = process.argv.includes("--pwa");

/**
 * Le robot VIVANT des e-mails (bilan patient) : une image animée (GIF), que Gmail, Apple Mail et la plupart des messageries
 * jouent ; Outlook sur ordinateur montre la première image, un robot aux yeux ouverts. Sur fond blanc (un GIF n'a pas de
 * transparence douce) : l'e-mail le pose dans une pastille blanche. Il flotte, cligne des yeux, sa lampe pulse, l'étoile scintille.
 */
async function emailRobotGif() {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(`${tmpdir()}/robot-gif-`);
  const FRAMES = 30; // 3 s à 10 images par seconde
  for (let i = 0; i < FRAMES; i += 1) {
    const t = i / FRAMES;
    const bob = Math.sin(t * Math.PI * 2) * 3.2;
    const open = i === 21 || i === 23 ? 0.15 : i === 22 ? 0 : 1;
    const lamp = 0.14 + 0.24 * (0.5 + 0.5 * Math.sin(t * Math.PI * 4));
    const spark = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 6 + 1));
    const frame = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -14 116 116" width="256" height="256">
  ${robotDefs}
  <rect x="-8" y="-14" width="116" height="116" fill="#ffffff"/>
  <ellipse cx="50" cy="96" rx="${(24 - bob).toFixed(2)}" ry="3.2" fill="#0F3F54" fill-opacity="${(0.12 - bob * 0.01).toFixed(3)}"/>
  <g transform="translate(0 ${(bob - 2).toFixed(2)})">${robotOf({ open, lamp, spark })}</g>
</svg>`;
    await sharp(Buffer.from(frame), { density: 144 }).resize(128, 128).flatten({ background: "#ffffff" }).png().toFile(`${dir}/f${String(i).padStart(2, "0")}.png`);
  }
  mkdirSync("public/email", { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "10", "-i", `${dir}/f%02d.png`, "-vf", "split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none", "-loop", "0", "public/email/robot-vivant.gif"]);
  rmSync(dir, { recursive: true, force: true });
  console.log("✓ public/email/robot-vivant.gif (128 px, 3 s en boucle)");
}
const iosOnly = process.argv.includes("--ios");
const emailOnly = process.argv.includes("--email");

/** Le robot du bilan envoyé au patient : petit (192 px pour un affichage à 52 px), sans fond, posé sur la couleur de la pharmacie. */
async function emailRobot() {
  await emailRobotGif();
  mkdirSync("public/email", { recursive: true });
  await sharp(Buffer.from(transparentSvg), { density: 72 }).resize(192, 192).png({ compressionLevel: 9, palette: true }).toFile("public/email/robot-192.png");
  console.log("✓ public/email/robot-192.png (192 px, sans fond)");
}

/** L'écran de lancement : fond clair de l'application, robot au centre (2732 px, carré : iOS le recadre au centre). */
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="2732" height="2732">
  ${robotDefs}
  <rect width="1000" height="1000" fill="#f6fafa"/>
  <g transform="translate(410 400) scale(1.8)">${robot}
  </g>
</svg>
`;

async function iosAssets() {
  const assets = "application-mobile/ios/App/App/Assets.xcassets";
  await sharp(Buffer.from(fullBleedSvg), { density: 144 }).resize(1024, 1024).flatten({ background: C.cardBottom }).removeAlpha().png().toFile(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`);
  console.log("✓ icône App Store (1024 px, sans transparence)");
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await sharp(Buffer.from(splashSvg), { density: 72 }).resize(2732, 2732).flatten({ background: "#f6fafa" }).png().toFile(`${assets}/Splash.imageset/${name}`);
  }
  console.log("✓ écran de lancement");
}

if (!pwaOnly) writeFileSync("public/logo.svg", svg);
if (!pwaOnly) writeFileSync("public/logo-robot.svg", transparentSvg);
const outputs: [string, number][] = [
  ["public/logo.png", 1254],
  ["public/logo-1200.png", 1200],
  ["public/logo-256.png", 256],
  ["src/app/icon.png", 512],
  ["src/app/apple-icon.png", 180],
];
async function render(source: string, file: string, size: number) {
  await sharp(Buffer.from(source), { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png().toFile(file);
  console.log(`✓ ${file} (${size} px)`);
}

async function pwaIcons() {
  mkdirSync("public/mobile", { recursive: true });
  await render(svg, "public/mobile/icon-192.png", 192);
  await render(svg, "public/mobile/icon-512.png", 512);
  await render(fullBleedSvg, "public/mobile/maskable-512.png", 512);
  await render(fullBleedSvg, "public/mobile/apple-touch-icon.png", 180);
}

async function main() {
  if (pwaOnly) return pwaIcons();
  if (iosOnly) return iosAssets();
  if (emailOnly) return emailRobot();
  await pwaIcons();
  await emailRobot();
  for (const [file, size] of outputs) {
    await sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png().toFile(file);
    console.log(`✓ ${file} (${size} px)`);
  }
  for (const [file, size] of [["public/logo-robot-2048.png", 2048], ["public/logo-robot-1080.png", 1080]] as const) {
    await sharp(Buffer.from(transparentSvg), { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png().toFile(file);
    console.log(`✓ ${file} (${size} px, sans fond)`);
  }
}

void main();
