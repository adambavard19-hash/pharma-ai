/**
 * Les photos des produits du stock, en masse (fondateur, 29 oct. 2026 : « chaque produit conseil, chaque médicament du stock que
 * tu connais : cherche la photo sur Internet, retouche-la sur un fond blanc »).
 *
 *   node --import tsx scripts/photos-auto/run.mts <liste.txt> [--limite N]
 *
 * <liste.txt> : un code-barres par ligne. Pour chacun, sans photo studio déjà faite :
 *   1. la vraie photo de la face avant dans les bases ouvertes (Open Food Facts, Open Beauty Facts, Open Products Facts) ;
 *   2. le produit détouré par le Mac (Vision d'Apple : scripts/photos-auto/detourer.swift, compilé à la volée) ;
 *   3. posé au centre du fond uni de PharmaBoost, comme les photos studio (public/produits-studio/<code>.jpg).
 * Une photo trop petite, sans sujet, ou dont le détourage ne garde presque rien est écartée : rien plutôt qu'une mauvaise photo.
 * Les sources sont notées (scripts/photos-auto/sources.json) : les bases ouvertes demandent qu'on les crédite.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SIZE = 512;
const BACKGROUND = { r: 244, g: 246, b: 245 };
const OUT_DIR = "public/produits-studio";
const WORK = ".live/photos-auto";
const SOURCES_FILE = "scripts/photos-auto/sources.json";
const SITES = ["world.openfoodfacts.org", "world.openbeautyfacts.org", "world.openproductsfacts.org"];
const TOOL = join(WORK, "detourer");

type Source = { ean: string; site: string; url: string; name: string | null; at: string };

function ensureTool() {
  mkdirSync(WORK, { recursive: true });
  if (!existsSync(TOOL)) execFileSync("swiftc", ["-O", "scripts/photos-auto/detourer.swift", "-o", TOOL], { stdio: "inherit" });
}

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "PharmaBoost/1.0 (contact@pharmaboost.app)" }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return null;
}

/** La photo de la face avant dans les bases ouvertes, en grand quand elle existe. */
async function findPhoto(ean: string): Promise<{ site: string; urls: string[]; name: string | null } | null> {
  for (const site of SITES) {
    const data = (await fetchJson(`https://${site}/api/v2/product/${ean}.json?fields=product_name,image_front_url,image_url`)) as { status?: number; product?: { product_name?: string; image_front_url?: string; image_url?: string } } | null;
    const product = data?.status === 1 ? data.product : undefined;
    const url = product?.image_front_url || product?.image_url;
    if (url) return { site, urls: [url.replace(/\.\d+\.jpg$/, ".full.jpg"), url], name: product?.product_name ?? null };
  }
  return null;
}

async function download(urls: string[], target: string): Promise<boolean> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "PharmaBoost/1.0 (contact@pharmaboost.app)" }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;
      writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      return true;
    } catch {
      // l'adresse suivante
    }
  }
  return false;
}

async function makeStudio(ean: string, source: string): Promise<"ok" | string> {
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 240) return "photo trop petite";
  // Vision lit l'image telle qu'elle est enregistrée : on la redresse et on la normalise d'abord.
  const upright = join(WORK, `${ean}.src.png`);
  await sharp(source).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).png().toFile(upright);
  const cut = join(WORK, `${ean}.cut.png`);
  const result = spawnSync(TOOL, [upright, cut], { timeout: 60_000 });
  if (result.status === 2) return "aucun produit reconnu";
  if (result.status !== 0 || !existsSync(cut)) return "détourage impossible";
  const trimmed = await sharp(cut).trim().toBuffer({ resolveWithObject: true });
  const uprightMeta = await sharp(upright).metadata();
  const share = (trimmed.info.width * trimmed.info.height) / ((uprightMeta.width ?? 1) * (uprightMeta.height ?? 1));
  if (share < 0.1) return "détourage trop petit";
  if (Math.min(trimmed.info.width, trimmed.info.height) < 120) return "produit trop petit sur la photo";
  const inner = Math.round(SIZE * 0.84);
  const product = await sharp(trimmed.data).resize(inner, inner, { fit: "inside" }).toBuffer();
  const pm = await sharp(product).metadata();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BACKGROUND } })
    .composite([{ input: product, left: Math.round((SIZE - (pm.width ?? inner)) / 2), top: Math.round((SIZE - (pm.height ?? inner)) / 2) }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(OUT_DIR, `${ean}.jpg`));
  return "ok";
}

function writeList() {
  const eans = readdirSync(OUT_DIR).flatMap((file) => /^(\d{8,14})\.jpg$/.exec(file)?.[1] ?? []).sort();
  writeFileSync(
    "src/config/studio-photos.ts",
    `// Généré par scripts/photos-studio.ts — ne pas modifier à la main.\n/** Les codes-barres des produits qui ont une photo studio (public/produits-studio/<code>.jpg). */\nexport const STUDIO_PHOTO_EANS: ReadonlySet<string> = new Set(${JSON.stringify(eans, null, 2)});\n`,
  );
  return eans.length;
}

async function main() {
  const listFile = process.argv[2];
  if (!listFile) throw new Error("Indiquez le fichier des codes-barres.");
  const limitIndex = process.argv.indexOf("--limite");
  const limit = limitIndex > 0 ? Number(process.argv[limitIndex + 1]) : Number.POSITIVE_INFINITY;
  ensureTool();
  mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set(readdirSync(OUT_DIR).flatMap((file) => /^(\d{8,14})\.jpg$/.exec(file)?.[1] ?? []));
  const sources: Source[] = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, "utf8")) : [];
  const tried = new Set(sources.map((source) => source.ean));
  // Les photos refusées à la relecture (main, dos de boîte, code-barres…) ne sont pas refaites.
  const refused = new Set(existsSync("scripts/photos-auto/refusees.txt") ? readFileSync("scripts/photos-auto/refusees.txt", "utf8").split(/\s+/) : []);
  const eans = [...new Set(readFileSync(listFile, "utf8").split(/\s+/).filter((line) => /^\d{8,14}$/.test(line)))].filter((ean) => !done.has(ean) && !refused.has(ean)).slice(0, limit);
  const report: Record<string, number> = {};
  let made = 0;
  for (const [index, ean] of eans.entries()) {
    const found = await findPhoto(ean);
    const outcome = await (async () => {
      if (!found) return "aucune photo dans les bases ouvertes";
      const raw = join(WORK, `${ean}.jpg`);
      if (!(await download(found.urls, raw))) return "téléchargement impossible";
      const result = await makeStudio(ean, raw).catch(() => "image illisible");
      if (result === "ok" && !tried.has(ean)) sources.push({ ean, site: found.site, url: found.urls[1], name: found.name, at: new Date().toISOString().slice(0, 10) });
      return result;
    })();
    report[outcome] = (report[outcome] ?? 0) + 1;
    if (outcome === "ok") made += 1;
    if ((index + 1) % 25 === 0 || index === eans.length - 1) {
      writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 1)}\n`);
      console.log(`${index + 1}/${eans.length} · ${made} photo(s) faites · ${JSON.stringify(report)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 1)}\n`);
  console.log(`Terminé : ${made} nouvelle(s) photo(s), ${writeList()} au total. ${JSON.stringify(report)}`);
}

main();
