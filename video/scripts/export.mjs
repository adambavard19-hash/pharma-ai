// Rendu des films.
//   node scripts/export.mjs brouillon [Film…]  → out/brouillons/<film>-540p.mp4 (rapide, pour relire le montage)
//   node scripts/export.mjs final [Film…]      → master 4K, puis out/<film>-4k.mp4 et out/<film>-1080p.mp4
//   node scripts/export.mjs exports [Film…]    → seulement les fichiers finaux, depuis les masters existants
// Sans nom de film : tous les films. Les noms sont les identifiants de src/Root.tsx.
//
// Netteté : le final est calculé en 4K (échelle 2, images JPEG qualité 100) puis
// réduit en 1080p au filtre Lanczos — le texte des écrans est suréchantillonné.
// Son : normalisé en deux passes à −16 LUFS, crête −1,5 dBTP (niveau web).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const mode = process.argv[2] ?? "final";
const FILES = {
  Lancement: "pharmaboost-lancement",
  CommentCaMarche: "pharmaboost-comment-ca-marche",
  Pourquoi: "pharmaboost-pourquoi",
  Avantages: "pharmaboost-avantages",
  SansOrdonnance: "pharmaboost-sans-ordonnance",
};
const films = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(FILES);
for (const film of films) if (!FILES[film]) throw new Error(`Film inconnu : ${film} (${Object.keys(FILES).join(", ")})`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

function loudnorm(input) {
  // Première passe : mesure.
  // ffmpeg écrit la mesure sur la sortie d'erreur.
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(out.slice(out.lastIndexOf("{"), out.lastIndexOf("}") + 1));
  return `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

function encode(input, output, { scale, crf, audioBitrate }) {
  const vf = scale ? ["-vf", `scale=${scale}:flags=lanczos`] : [];
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    ...vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", ...COLOR,
    "-af", loudnorm(input), "-ar", "48000", "-c:a", "aac", "-b:a", audioBitrate,
    "-movflags", "+faststart", output,
  ]);
  console.log(`✓ ${output}`);
}

mkdirSync("out/brouillons", { recursive: true });
mkdirSync("out/masters", { recursive: true });
for (const film of films) {
  const name = FILES[film];
  if (mode === "brouillon") {
    run("npx", ["remotion", "render", "src/index.ts", film, "out/brut.mp4", "--scale=0.5", "--crf=24", "--audio-bitrate=256k", "--log=error"]);
    encode("out/brut.mp4", `out/brouillons/${name}-540p.mp4`, { crf: 22, audioBitrate: "128k" });
    rmSync("out/brut.mp4");
  } else {
    const master = `out/masters/${name}-4k.mp4`;
    if (mode !== "exports") run("npx", ["remotion", "render", "src/index.ts", film, master, "--scale=2", "--jpeg-quality=100", "--crf=10", "--x264-preset=medium", "--audio-bitrate=320k", "--log=error"]);
    encode(master, `out/${name}-4k.mp4`, { crf: 16, audioBitrate: "256k" });
    encode(master, `out/${name}-1080p.mp4`, { scale: "1920:1080", crf: 16, audioBitrate: "192k" });
  }
}
