// Les deux montages du film isotrétinoïne (4 nov. 2026), depuis video/ :
//   npx remotion render src/iso/index.ts Presentation out/iso/presentation-4k.mp4 --scale=2 --crf=16
//   npx remotion render src/iso/index.ts Lettre out/iso/lettre-4k.mp4 --scale=2 --crf=16
//   node src/iso/tools/assembler.mjs presentation|lettre
// Le son ramené à −16 LUFS (deux passes) ; la copie 4K et la 1080p sur le Bureau ; la version du site en 1080p et son affiche.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const which = process.argv[2];
const CFG = {
  presentation: { site: "pharmaboost-presentation", desk: "PharmaBoost-Presentation-video", poster: 54 },
  lettre: { site: "pharmaboost-lettre", desk: "PharmaBoost-Lettre-video", poster: 3.2 },
}[which];
if (!CFG) throw new Error("presentation ou lettre");
const ROOT = join(process.cwd(), "..");
const RAW = `out/iso/${which}-4k.mov`;
const MASTER = `out/iso/${which}-master-4k.mp4`;
const OUT = join(ROOT, `public/video/${CFG.site}.mp4`);
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

const first = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", RAW, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const m = JSON.parse(first.slice(first.lastIndexOf("{"), first.lastIndexOf("}") + 1));
const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ff("-i", RAW, "-c:v", "copy", "-af", norm, "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", MASTER);
// Rendu en 1080p (disque plein, 4 nov. 2026) : pas de copie « 4K » sur le Bureau, qui serait trompeuse.
if (process.env.QUALITE !== "1080") copyFileSync(MASTER, join(homedir(), "Desktop", `${CFG.desk}-4K.mp4`));

const log = join("out", "iso", `${which}-2passes`);
const v = ["-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264", "-b:v", "3M", "-maxrate", "4.5M", "-bufsize", "9M", "-preset", "slow", "-pix_fmt", "yuv420p", "-passlogfile", log];
ff("-i", MASTER, ...v, "-pass", "1", "-an", "-f", "mp4", "/dev/null");
ff("-i", MASTER, ...v, "-pass", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT);
ff("-ss", String(CFG.poster), "-i", MASTER, "-frames:v", "1", "-vf", "scale=1920:1080", "-q:v", "3", OUT.replace(/\.mp4$/, ".jpg"));
copyFileSync(OUT, join(homedir(), "Desktop", `${CFG.desk}.mp4`));
for (const f of [`${log}-0.log`, `${log}-0.log.mbtree`]) rmSync(f, { force: true });
console.log(`✓ ${OUT} + affiche + Bureau (4K et 1080p)`);
