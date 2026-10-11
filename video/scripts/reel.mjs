// Le reel Instagram (composition « Reel », vertical 1080 × 1920) : rendu à part des films 16:9, jamais dans ../public/video.
//
//   node scripts/reel.mjs brouillon      → out/reel/pharmaboost-reel-brouillon.mp4 (540 × 960, pour relire le montage et la synchro)
//   node scripts/reel.mjs final          → out/reel/pharmaboost-reel-instagram.mp4 (1080 × 1920, 60 images/s)
//   node scripts/reel.mjs final --30     → la même chose à 30 images/s
//
// Final : H.264 High (niveau 4.2), yuv420p, BT.709, AAC 48 kHz 192 kb/s, son normalisé en deux passes à −14 LUFS (niveau des
// réseaux sociaux, crête −1 dBTP), +faststart. Le master presque sans perte reste dans out/reel/ pour réencoder sans tout recalculer.
// La durée suit la voix (public/voix/reel/L1…L7.mp3) : après un changement de voix (scripts/voix-reel.mjs), relancer ce rendu.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const mode = process.argv[2] ?? "brouillon";
const fps30 = process.argv.includes("--30");
const OUT = "out/reel";
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** Deux passes : la mesure, puis le réglage linéaire à −14 LUFS. */
function loudnorm(input) {
  const target = "I=-14:TP=-1:LRA=11";
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(out.slice(out.lastIndexOf("{"), out.lastIndexOf("}") + 1));
  return `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

function encode(input, output, { crf, audioBitrate, fps }) {
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    ...(fps ? ["-vf", `fps=${fps}`] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-level:v", "4.2", "-maxrate", "16M", "-bufsize", "32M", "-pix_fmt", "yuv420p", ...COLOR,
    "-af", loudnorm(input), "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", audioBitrate,
    // Le réglage du niveau rallonge le son d'une fraction de seconde : il s'arrête avec la dernière image.
    "-shortest", "-movflags", "+faststart", output,
  ]);
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration", "-of", "compact=p=0:nk=1", output], { encoding: "utf8" }).trim().replace(/\n/g, " · ");
  console.log(`✓ ${output}  (${probe})`);
}

mkdirSync(OUT, { recursive: true });
if (mode === "brouillon") {
  const brut = `${OUT}/brut-brouillon.mp4`;
  run("npx", ["remotion", "render", "src/index.ts", "Reel", brut, "--scale=0.5", "--crf=24", "--audio-bitrate=192k", "--log=error"]);
  encode(brut, `${OUT}/pharmaboost-reel-brouillon.mp4`, { crf: 23, audioBitrate: "128k" });
  rmSync(brut);
} else if (mode === "final") {
  const master = `${OUT}/master-1080x1920.mp4`;
  run("npx", ["remotion", "render", "src/index.ts", "Reel", master, "--scale=1", "--jpeg-quality=100", "--crf=12", "--x264-preset=medium", "--audio-bitrate=320k", "--log=error"]);
  encode(master, `${OUT}/pharmaboost-reel-instagram.mp4`, { crf: 17, audioBitrate: "192k", fps: fps30 ? 30 : null });
} else {
  throw new Error(`Mode inconnu : ${mode} (brouillon, final)`);
}
