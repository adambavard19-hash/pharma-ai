// La vidéo de la lettre (2 nov. 2026 : la présentation ENTIÈRE, sans le film à la suite). Depuis video/ :
//   npx remotion render src/lettre/index.ts Lettre out/lettre/rendu-4k.mp4 --scale=2 --crf=16
//   node src/lettre/tools/assembler.mjs
// Le son ramené à −16 LUFS (deux passes) ; la copie 4K sur le Bureau ; la version du site en 1080p (≈ 3 Mb/s, deux passes)
// et son affiche.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(process.cwd(), "..");
const RAW = "out/lettre/rendu-4k.mp4";
const MASTER = "out/lettre/master-4k.mp4";
const OUT = join(ROOT, "public/video/pharmaboost-lettre.mp4");
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

const first = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", RAW, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const m = JSON.parse(first.slice(first.lastIndexOf("{"), first.lastIndexOf("}") + 1));
const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ff("-i", RAW, "-c:v", "copy", "-af", norm, "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", MASTER);
copyFileSync(MASTER, join(homedir(), "Desktop", "PharmaBoost-Lettre-video-4K.mp4"));

const log = join("out", "lettre", "2passes");
const v = ["-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-b:v", "3M", "-maxrate", "4.5M", "-bufsize", "9M", "-preset", "slow", "-pix_fmt", "yuv420p", "-passlogfile", log];
ff("-i", MASTER, ...v, "-pass", "1", "-an", "-f", "mp4", "/dev/null");
ff("-i", MASTER, ...v, "-pass", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT);
ff("-ss", "3.2", "-i", MASTER, "-frames:v", "1", "-vf", "scale=1920:1080", "-q:v", "3", OUT.replace(/\.mp4$/, ".jpg"));
copyFileSync(OUT, join(homedir(), "Desktop", "PharmaBoost-Lettre-video.mp4"));
for (const f of [`${log}-0.log`, `${log}-0.log.mbtree`]) rmSync(f, { force: true });
console.log(`✓ ${OUT} + affiche + Bureau (4K et 1080p)`);
