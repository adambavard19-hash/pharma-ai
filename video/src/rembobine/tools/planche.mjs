// PLANCHES D'IMAGES du film « Rembobinons » — pour VOIR une scène sans rendre la vidéo.
//
//   node src/rembobine/tools/planche.mjs S3                    → 8 images réparties sur la fenêtre de S3
//   node src/rembobine/tools/planche.mjs S3 13.1 13.15 13.2    → ces temps du film précis (secondes)
//   node src/rembobine/tools/planche.mjs S3 --film             → la scène DANS le film entier (voisines, transitions)
//   node src/rembobine/tools/planche.mjs --tout                → 24 images sur tout le film
//   node src/rembobine/tools/planche.mjs --demo decor 0 1 2 3   → la démonstration du kit (kit/demo-decor.tsx), à ces temps
//   options : --echelle 0.5 (défaut) · --nom <suffixe> (plusieurs planches de la même scène côte à côte)
//
// Sans --film, une scène est empaquetée SEULE (src/rembobine/entries/<id>.tsx) : une autre scène en chantier ne peut pas
// casser le paquet. Sortie : out/rembobine/planches/<nom>.jpg (grille, temps du film en haut à gauche de chaque image)
// + chaque image dans out/rembobine/planches/<nom>/. Deux planches au plus en même temps sur la machine (verrou).
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCENES, TOTAL, FPS } from "../timeline.ts";
import { prendrePlace } from "./verrou.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const scale = Number(opt("--echelle", "0.5"));
const suffix = opt("--nom", "");
const inFilm = args.includes("--film");
const demo = opt("--demo", null);
const positional = args.filter((a, i) => !a.startsWith("--") && !["--echelle", "--nom", "--demo"].includes(args[i - 1]));

let name;
let times;
let entry = resolve("src/rembobine/index.ts");
if (demo) {
  name = `demo-${demo}` + (suffix ? `-${suffix}` : "");
  mkdirSync("src/rembobine/entries", { recursive: true });
  entry = resolve(`src/rembobine/entries/demo-${demo}.tsx`);
  writeFileSync(entry, `// Écrit par tools/planche.mjs : la démonstration du kit « ${demo} ».\nimport { registerRoot } from "remotion";\nimport * as M from "../kit/demo-${demo}";\nimport { demoRoot } from "../SceneSolo";\nregisterRoot(demoRoot(M));\n`);
  const explicit = positional.map(Number).filter((n) => Number.isFinite(n));
  times = explicit.length ? explicit : [0, 1, 2, 3, 4, 5, 6, 7];
} else if (args.includes("--tout")) {
  name = "film";
  times = Array.from({ length: 24 }, (_, i) => +(0.4 + (i * (TOTAL - 0.8)) / 23).toFixed(2));
} else {
  const id = positional[0];
  const w = SCENES.find((s) => s.id === id);
  if (!w) throw new Error(`Scène inconnue : ${id} (S1 … S13, ou --tout)`);
  name = id.toLowerCase() + (inFilm ? "-film" : "") + (suffix ? `-${suffix}` : "");
  if (!inFilm) {
    mkdirSync("src/rembobine/entries", { recursive: true });
    entry = resolve(`src/rembobine/entries/${id}.tsx`);
    writeFileSync(entry, `// Écrit par tools/planche.mjs : la scène ${id} seule.\nimport { registerRoot } from "remotion";\nimport * as M from "../scenes/${w.file}";\nimport { soloRoot } from "../SceneSolo";\nregisterRoot(soloRoot("${id}", M));\n`);
  }
  const explicit = positional.slice(1).map(Number).filter((n) => Number.isFinite(n));
  times = explicit.length ? explicit : Array.from({ length: 8 }, (_, i) => +(w.start + 0.1 + (i * (w.end - w.start - 0.2)) / 7).toFixed(2));
}

const outDir = join("out", "rembobine", "planches");
const shotDir = join(outDir, name);
rmSync(shotDir, { recursive: true, force: true });
mkdirSync(shotDir, { recursive: true });

const lockRelease = await prendrePlace("planche", 2);
let serveUrl = null;
process.on("exit", () => {
  lockRelease();
  if (serveUrl) rmSync(serveUrl, { recursive: true, force: true });
});

console.log(`Empaquetage… (${times.length} images)`);
// symlinkPublicDir : le paquet pointe vers public/ au lieu d'en faire une copie (le disque est presque plein).
serveUrl = await bundle({ entryPoint: entry, publicDir: resolve("public"), symlinkPublicDir: true });
const inputProps = { debug: true, only: null };
const composition = await selectComposition({ serveUrl, id: "Rembobine", inputProps });
const files = [];
for (const t of times) {
  const file = join(shotDir, `${t.toFixed(2)}.jpg`);
  await renderStill({ serveUrl, composition, inputProps, frame: Math.min(composition.durationInFrames - 1, Math.round(t * FPS)), output: file, imageFormat: "jpeg", jpegQuality: 85, scale });
  files.push(file);
}
const cols = 4;
const rows = Math.ceil(files.length / cols);
const w = Math.round(composition.width * scale);
const h = Math.round(composition.height * scale);
const inputs = files.flatMap((p) => ["-i", p]);
const blanks = rows * cols - files.length;
const filter = [
  ...files.map((_, i) => `[${i}:v]scale=${w}:${h},pad=${w + 8}:${h + 8}:4:4:color=0x222222[v${i}]`),
  ...Array.from({ length: blanks }, (_, j) => `color=c=0x222222:s=${w + 8}x${h + 8}:d=1[b${j}]`),
];
const labels = [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: blanks }, (_, j) => `[b${j}]`)];
if (labels.length === 1) filter.push(`${labels[0]}null[out]`);
else filter.push(`${labels.join("")}xstack=inputs=${labels.length}:layout=${labels.map((_, i) => `${(i % cols) * (w + 8)}_${Math.floor(i / cols) * (h + 8)}`).join("|")}[out]`);
const sheet = join(outDir, `${name}.jpg`);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filter.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", sheet]);
console.log(`${sheet}  (${times.join(", ")})`);
