// La bande-son des films « Prise en main » (17 oct. 2026), faite HORS du rendu : chaque phrase posée à l'échantillon près à son
// instant du calage (src/prise-en-main/timeline.ts), la musique continue en dessous, baissée sous la voix (compression
// déclenchée par la voix), puis l'ensemble à −16 LUFS (gain constant + limiteur, comme les autres films).
//   node scripts/guide-mix.mjs titulaire|pharmacien   → out/guide-<film>.wav
import { execFileSync, spawnSync } from "node:child_process";
import { timeline } from "../src/prise-en-main/timeline.ts";
import { voiceDir } from "../src/prise-en-main/script.ts";

const film = process.argv[2];
const { lines, total } = timeline(film);
const SR = 48000;
const inputs = lines.flatMap((l) => ["-i", `public/${voiceDir(film)}/${l.id}.wav`]);
const voiceChains = lines.map((l, i) => `[${i}:a]aresample=${SR},adelay=delays=${Math.round(l.start * SR)}S:all=1,apad=whole_dur=${total.toFixed(3)}[v${i}]`);
const mi = lines.length;
const filter = [
  ...voiceChains,
  `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:duration=longest,atrim=0:${total.toFixed(3)}[voix]`,
  `[voix]asplit=2[voix1][voix2]`,
  `[${mi}:a]aresample=${SR},aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},volume=-15dB,afade=t=in:d=1.5,afade=t=out:st=${(total - 3.2).toFixed(3)}:d=3.2[mus]`,
  `[mus][voix1]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[musb]`,
  `[voix2]aformat=channel_layouts=stereo[voixs]`,
  `[voixs][musb]amix=inputs=2:normalize=0:duration=first[mix]`,
].join(";");
const raw = `out/guide-${film}-brut.wav`;
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-i", "public/music/guide.mp3", "-filter_complex", filter, "-map", "[mix]", "-ar", String(SR), "-c:a", "pcm_s16le", raw]);
const measure = (af) => Number(spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", raw, "-af", `${af},ebur128`, "-f", "null", "-"], { encoding: "utf8" }).stderr.split("Summary:").pop().match(/I:\s+(-?[\d.]+) LUFS/)[1]);
const LIM = "alimiter=limit=0.79:attack=1:release=60:level=0:latency=1";
let gain = -16 - measure("anull");
gain += -16 - measure(`volume=${gain.toFixed(2)}dB,${LIM}`);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", `volume=${gain.toFixed(2)}dB,${LIM}`, "-ar", String(SR), "-c:a", "pcm_s16le", `out/guide-${film}.wav`]);
console.log(`out/guide-${film}.wav · ${total.toFixed(2)} s · ${lines.length} phrases · gain ${gain.toFixed(1)} dB`);
