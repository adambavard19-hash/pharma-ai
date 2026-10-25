// LE RENDU du film « Rembobinons ».
//
//   node src/rembobine/tools/rendu.mjs brouillon   → 960 × 540 avec le son : out/rembobine/brouillon-540p.mp4
//   node src/rembobine/tools/rendu.mjs final       → 4K (3840 × 2160), son à −16 LUFS : ~/Desktop/PharmaBoost-Rembobinons-4K.mp4
//   node src/rembobine/tools/rendu.mjs son         → refait SEULEMENT le son et le remet sur la 4K du Bureau, image intacte
//                                                    (une phrase redite, un bruitage : pas 40 minutes de rendu 4K)
//
// La 4K se rend PAR MORCEAUX de 300 images (d'un seul tenant, Chrome plante en 4K : film « Le Garnier », 23 oct. 2026),
// chacun avec trois essais, recollés sans réencodage. Le son est rendu à part (WAV), ramené à −16 LUFS intégrés,
// crête vraie −1,5 dBTP (loudnorm en deux passes), AAC 320 kb/s. Disque presque plein : crf 18, pas de master.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { TOTAL_FRAMES } from "../timeline.ts";

const mode = process.argv[2] ?? "brouillon";
const OUT = join("out", "rembobine");
const ENTRY = "src/rembobine/index.ts";
mkdirSync(OUT, { recursive: true });
const remotion = (...a) => spawnSync("npx", ["remotion", "render", ENTRY, "Rembobine", ...a], { stdio: "inherit" }).status;

function loudnormArgs(input) {
  const first = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(first.slice(first.lastIndexOf("{"), first.lastIndexOf("}") + 1));
  return `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}
function report(file) {
  const s = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const sum = s.slice(s.lastIndexOf("Summary:"));
  console.log(`${file} : ${sum.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]} LUFS, crête vraie ${sum.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]} dBFS`);
}

if (mode === "brouillon") {
  const raw = join(OUT, "brouillon-brut.mp4");
  if (remotion(raw, "--codec=h264", "--scale=0.5", "--crf=26", "--audio-codec=aac", "--audio-bitrate=320k") !== 0) process.exit(1);
  const done = join(OUT, "brouillon-540p.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-c:v", "copy", "-af", loudnormArgs(raw), "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", done]);
  rmSync(raw);
  report(done);
} else if (mode === "son") {
  const wav = join(OUT, "son.wav");
  if (remotion(wav, "--codec=wav") !== 0) process.exit(1);
  const desk = join(homedir(), "Desktop", "PharmaBoost-Rembobinons-4K.mp4");
  if (!existsSync(desk)) throw new Error(`${desk} introuvable : lancer « final ».`);
  const done = join(OUT, "PharmaBoost-Rembobinons-4K.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", desk, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", loudnormArgs(wav), "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", done]);
  report(done);
  copyFileSync(done, desk);
  rmSync(done);
  console.log(`→ ${desk} (${(statSync(desk).size / 1e6).toFixed(0)} Mo)`);
} else {
  // 1. Le son, seul.
  const wav = join(OUT, "son.wav");
  if (!existsSync(wav) || process.argv.includes("--son")) if (remotion(wav, "--codec=wav") !== 0) process.exit(1);
  // 2. L'image, par morceaux.
  const DIR = join(OUT, "morceaux-4k");
  mkdirSync(DIR, { recursive: true });
  const CHUNK = 300;
  const parts = [];
  for (let start = 0; start < TOTAL_FRAMES; start += CHUNK) {
    const end = Math.min(TOTAL_FRAMES - 1, start + CHUNK - 1);
    const file = join(DIR, `m-${String(start).padStart(4, "0")}.mp4`);
    parts.push(file);
    if (existsSync(file)) continue;
    for (let attempt = 1; ; attempt++) {
      console.log(`Morceau ${start}-${end}, essai ${attempt}`);
      if (remotion(file, "--codec=h264", "--muted", `--frames=${start}-${end}`, "--scale=2", "--crf=18", "--x264-preset=slow", "--concurrency=2") === 0) break;
      rmSync(file, { force: true });
      if (attempt === 3) throw new Error(`Le morceau ${start}-${end} a échoué trois fois.`);
    }
  }
  const list = join(DIR, "liste.txt");
  writeFileSync(list, parts.map((p) => `file '${resolve(p)}'`).join("\n"));
  const video = join(DIR, "video.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);
  // 3. L'assemblage, son à −16 LUFS.
  const done = join(OUT, "PharmaBoost-Rembobinons-4K.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", loudnormArgs(wav), "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", done]);
  report(done);
  const desk = join(homedir(), "Desktop", "PharmaBoost-Rembobinons-4K.mp4");
  copyFileSync(done, desk);
  rmSync(DIR, { recursive: true, force: true });
  rmSync(done);
  console.log(`→ ${desk} (${(statSync(desk).size / 1e6).toFixed(0)} Mo)`);
}
