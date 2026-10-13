/**
 * Les photos « studio » des produits : la même boîte, refaite sur le fond uni de PharmaBoost, pour toutes les officines.
 *
 *   node --import tsx scripts/photos-studio.ts <dossier des images refaites>
 *
 * Chaque image du dossier s'appelle <code-barres>.png (ou .jpg) : la photo refaite en studio d'après la vraie photo de la
 * boîte. Le script la recadre sur le produit, la pose au même endroit, à la même taille, sur EXACTEMENT le même fond, puis
 * l'écrit dans public/produits-studio/<code-barres>.jpg et met à jour la liste src/config/studio-photos.ts.
 *
 * Un produit sans photo studio n'en montre aucune (ni carré vide, ni photo d'amateur).
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SIZE = 512;
const BACKGROUND = { r: 244, g: 246, b: 245 };
const OUT_DIR = "public/produits-studio";

async function studio(source: string, target: string) {
  // Le fond de l'image refaite est clair et uni : on recadre sur le produit (et son ombre), puis on le pose au centre.
  const trimmed = await sharp(source).flatten({ background: BACKGROUND }).trim({ background: "#f4f6f5", threshold: 22 }).toBuffer();
  const inner = Math.round(SIZE * 0.84);
  const product = await sharp(trimmed).resize(inner, inner, { fit: "inside" }).toBuffer();
  const meta = await sharp(product).metadata();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BACKGROUND } })
    .composite([{ input: product, left: Math.round((SIZE - (meta.width ?? inner)) / 2), top: Math.round((SIZE - (meta.height ?? inner)) / 2) }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(target);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Indiquez le dossier des images refaites.");
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(dir)) {
    const match = /^(\d{8,14})\.(png|jpe?g)$/i.exec(file);
    if (!match) continue;
    await studio(join(dir, file), join(OUT_DIR, `${match[1]}.jpg`));
    console.log(`${match[1]} ✓`);
  }
  const eans = readdirSync(OUT_DIR).flatMap((file) => /^(\d{8,14})\.jpg$/.exec(file)?.[1] ?? []).sort();
  writeFileSync(
    "src/config/studio-photos.ts",
    `// Généré par scripts/photos-studio.ts — ne pas modifier à la main.\n/** Les codes-barres des produits qui ont une photo studio (public/produits-studio/<code>.jpg). */\nexport const STUDIO_PHOTO_EANS: ReadonlySet<string> = new Set(${JSON.stringify(eans, null, 2)});\n`,
  );
  console.log(`${eans.length} photo(s) studio.`);
}

main();
