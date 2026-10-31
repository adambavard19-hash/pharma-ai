// La vidéo complète de la lettre : la partie d'excuse (out/lettre/excuse.mp4, rendue par Remotion, UN onglet) puis, en fondu de
// 0,6 s, le film de présentation du site — son niveau ramené à −16 LUFS ; puis l'encodage web (≈ 3 Mb/s, deux passes), l'affiche,
// et la copie sur le Bureau.   node src/lettre/tools/assembler.mjs   (depuis video/)
import { execFileSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(process.cwd(), "..");
const FILM = join(ROOT, "public/video/pharmaboost-presentation.mp4");
const OUT = join(ROOT, "public/video/pharmaboost-lettre.mp4");
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "out/lettre/excuse.mp4"]).toString());
const offset = (dur - 0.6).toFixed(3);

ff("-i", "out/lettre/excuse.mp4", "-i", FILM, "-filter_complex",
  `[0:v]fps=60,format=yuv420p,setsar=1[v0];[1:v]fps=60,format=yuv420p,setsar=1[v1];[v0][v1]xfade=transition=fade:duration=0.6:offset=${offset}[v];[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a0];[1:a]aresample=48000[a1];[a0][a1]acrossfade=d=0.6[a]`,
  "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-c:a", "aac", "-b:a", "320k", "out/lettre/master.mp4");
const log = join("out", "lettre", "2passes");
const v = ["-c:v", "libx264", "-b:v", "3M", "-maxrate", "4.5M", "-bufsize", "9M", "-preset", "slow", "-passlogfile", log];
ff("-i", "out/lettre/master.mp4", ...v, "-pass", "1", "-an", "-f", "mp4", "/dev/null");
ff("-i", "out/lettre/master.mp4", ...v, "-pass", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT);
ff("-ss", "2.6", "-i", "out/lettre/master.mp4", "-frames:v", "1", "-q:v", "3", OUT.replace(/\.mp4$/, ".jpg"));
copyFileSync(OUT, join(homedir(), "Desktop", "PharmaBoost-Lettre-video.mp4"));
for (const f of [`${log}-0.log`, `${log}-0.log.mbtree`]) rmSync(f, { force: true });
console.log(`✓ ${OUT} (${(dur + 69 - 0.6).toFixed(0)} s environ) + affiche + copie sur le Bureau`);
