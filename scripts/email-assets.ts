/**
 * Les petites images du bilan patient (e-mail) : les messageries n'affichent ni SVG ni polices du web, alors les icônes et la
 * phrase manuscrite partent en PNG (2× pour les écrans fins), servies par le site dans public/email/.
 *
 *   npx tsx scripts/email-assets.ts
 *
 * Icônes : celles du logiciel (Lucide), redessinées en couleur. Le robot animé, lui, vient de `scripts/logo-robot.ts --email`.
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";

type IconNode = [string, Record<string, string>][];

const TEAL = "#0F766E";
const ICONS: { file: string; icon: string; color: string; size?: number }[] = [
  { file: "pourquoi", icon: "target", color: TEAL },
  { file: "utiliser", icon: "settings", color: TEAL },
  { file: "precaution", icon: "triangle-alert", color: "#D64545" },
  { file: "astuce", icon: "lightbulb", color: "#E3A008" },
  { file: "coche", icon: "circle-check", color: "#12A150" },
  { file: "lieu", icon: "map-pin", color: TEAL },
  { file: "appel", icon: "phone", color: "#FFFFFF" },
  { file: "itineraire", icon: "map-pin", color: "#101828" },
  { file: "date", icon: "calendar-check", color: TEAL },
  { file: "soin", icon: "hand-heart", color: TEAL },
  { file: "feuille", icon: "leaf", color: "#12A150" },
  { file: "cadenas", icon: "lock", color: "#667085" },
  { file: "info", icon: "info", color: "#667085" },
  { file: "produits", icon: "shopping-bag", color: TEAL },
];

const attrs = (props: Record<string, string>) =>
  Object.entries(props)
    .filter(([key]) => key !== "key")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${value}"`)
    .join(" ");

async function icon(name: string): Promise<IconNode> {
  const loaded = (await import(`lucide-react/dist/esm/icons/${name}.mjs`)) as { __iconNode: IconNode };
  return loaded.__iconNode;
}

async function main() {
  mkdirSync("public/email", { recursive: true });
  for (const item of ICONS) {
    const nodes = await icon(item.icon);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="${item.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes.map(([tag, props]) => `<${tag} ${attrs(props)}/>`).join("")}</svg>`;
    await sharp(Buffer.from(svg)).resize(48, 48).png({ compressionLevel: 9 }).toFile(`public/email/icone-${item.file}.png`);
  }
  console.log(`✓ ${ICONS.length} icônes`);

  // La croix verte de la pharmacie, quand la pharmacie n'a pas de logo.
  const cross = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3CC37A"/><stop offset="1" stop-color="#0F8A5F"/></linearGradient></defs>
  <path d="M 36 8 h 28 a 6 6 0 0 1 6 6 v 22 h 22 a 6 6 0 0 1 6 6 v 16 a 6 6 0 0 1 -6 6 h -22 v 22 a 6 6 0 0 1 -6 6 h -28 a 6 6 0 0 1 -6 -6 v -22 h -22 a 6 6 0 0 1 -6 -6 v -16 a 6 6 0 0 1 6 -6 h 22 v -22 a 6 6 0 0 1 6 -6 z" fill="url(#g)"/>
</svg>`;
  await sharp(Buffer.from(cross)).resize(112, 112).png({ compressionLevel: 9 }).toFile("public/email/croix-pharmacie.png");

  // « Prenez soin de vous ! », à la main (police manuscrite du système, figée en image).
  const script = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="130" viewBox="0 0 520 130">
  <text x="260" y="78" text-anchor="middle" font-family="Snell Roundhand, Apple Chancery, cursive" font-weight="bold" font-size="60" fill="#0F3F54" transform="rotate(-6 260 70)">Prenez soin de vous !</text>
  <path d="M 140 110 Q 270 100 420 84" fill="none" stroke="#0F3F54" stroke-width="3" stroke-linecap="round"/>
</svg>`;
  await sharp(Buffer.from(script)).png({ compressionLevel: 9 }).toFile("public/email/prenez-soin.png");
  console.log("✓ croix de pharmacie, « Prenez soin de vous ! »");
}

void main();
