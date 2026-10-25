// La voix du film « Le Cercle » : UNE demande ElevenLabs (Yann), avec l'horodatage de chaque caractère, découpée en une
// phrase par fichier (public/cercle/voix/<id>.wav) ; les répliques reprises du film « Rembobinons » sont copiées.
// Puis les mots en temps de la PHRASE (public/cercle/voix/voix.json → mots[id]) : tools/mots.mjs les pose sur le film.
//
//   node src/cercle/tools/voix.mjs              → demande la voix SEULEMENT si le brut manque ou si le texte a changé
//   node src/cercle/tools/voix.mjs --decouper   → refait seulement le découpage
//
// La clé est lue dans ~/.pharmaboost-voix.env et n'est jamais affichée. Une seule demande, jamais de nouvel essai.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { FULL_TEXT, LINES, VOICE, VOICE_DIR } from "../script.ts";

const OUT = join("public", VOICE_DIR);
const RAW = join("out", "cercle", "voix");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
const RAW_MP3 = join(RAW, "brut.mp3");
const RAW_JSON = join(RAW, "brut.json");

function apiKey() {
  const env = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8");
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error("ELEVENLABS_API_KEY introuvable dans ~/.pharmaboost-voix.env");
  return m[1];
}
async function balance(key) {
  const s = await (await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } })).json();
  return s.character_limit - s.character_count;
}

const previous = existsSync(RAW_JSON) ? JSON.parse(readFileSync(RAW_JSON, "utf8")) : null;
if (!process.argv.includes("--decouper") && (previous?.text !== FULL_TEXT || !existsSync(RAW_MP3))) {
  const key = apiKey();
  const left = await balance(key);
  console.log(`Forfait : ${left} caractères restants ; à envoyer : ${FULL_TEXT.length}.`);
  if (FULL_TEXT.length > left) throw new Error("Pas assez de caractères au forfait : rien n'a été envoyé.");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: FULL_TEXT, model_id: VOICE.model, language_code: "fr", voice_settings: VOICE.settings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  writeFileSync(RAW_MP3, Buffer.from(data.audio_base64, "base64"));
  writeFileSync(RAW_JSON, JSON.stringify({ text: FULL_TEXT, alignment: data.alignment }, null, 1));
}

const { alignment: a } = JSON.parse(readFileSync(RAW_JSON, "utf8"));
const t0 = a.character_start_times_seconds;
const t1 = a.character_end_times_seconds;
const own = LINES.filter((l) => !l.reuse);
let cursor = 0;
const spans = own.map((l) => {
  const start = FULL_TEXT.indexOf(l.say, cursor);
  cursor = start + l.say.length;
  return [start, cursor - 1];
});
const SR = 44100;
const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", RAW_MP3, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
const total = x.length / SR;
const WIN = Math.round(0.005 * SR);
const calmest = (lo, hi) => {
  let best = lo, bestE = Infinity;
  for (let s = Math.max(0, Math.round(lo * SR)); s + WIN < Math.min(x.length, Math.round(hi * SR)); s += Math.round(WIN / 2)) {
    let e = 0;
    for (let k = 0; k < WIN; k++) e += x[s + k] * x[s + k];
    if (e < bestE) { bestE = e; best = (s + WIN / 2) / SR; }
  }
  return best;
};
const bounds = spans.slice(1).map(([s], i) => calmest(t1[spans[i][1]] - 0.04, t0[s] + 0.04));
const loud = (() => {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", RAW_MP3, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number(err.slice(err.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
})();
const gain = -18 - loud;
const LIMIT = "alimiter=limit=0.79:attack=2:release=30:level=0:latency=1";
const manifest = { voix: `${VOICE.name} (ElevenLabs, ${VOICE.model})`, cuts: {}, mots: {} };
own.forEach((line, i) => {
  const [s, e] = spans[i];
  const from = Math.max(i === 0 ? 0 : bounds[i - 1], t0[s] - 0.05);
  // Une phrase qui finit sur « … » : ElevenLabs y traîne un « euh » ; on coupe juste après la dernière lettre.
  const to = Math.min(i === own.length - 1 ? total : bounds[i], line.say.endsWith("…") ? t1[e - 1] + 0.08 : t1[e] + 0.25);
  const out = join(OUT, `${line.id}.wav`);
  const len = to - from;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", RAW_MP3, "-af", `atrim=start=${from.toFixed(4)}:end=${to.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=${(len - 0.03).toFixed(4)}:d=0.03,volume=${gain.toFixed(2)}dB,${LIMIT}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }));
  // Les mots, en temps de la PHRASE (0 = début du fichier).
  const words = [];
  let w = null;
  for (let k = s; k <= e; k++) {
    if (/\s/.test(a.characters[k])) { if (w) words.push(w); w = null; continue; }
    if (!w) w = { w: "", at: +(t0[k] - from).toFixed(3), end: 0 };
    w.w += a.characters[k];
    w.end = +(t1[k] - from).toFixed(3);
  }
  if (w) words.push(w);
  manifest.cuts[line.id] = { dur };
  manifest.mots[line.id] = words;
  console.log(`${line.id.padEnd(4)} ${dur.toFixed(2)} s  « ${line.say} »`);
});
// Les répliques reprises du film « Rembobinons » : le fichier tel quel, ses mots rebasés sur le début du fichier.
const R = JSON.parse(readFileSync("src/rembobine/mots.json", "utf8"));
for (const line of LINES.filter((l) => l.reuse)) {
  const out = join(OUT, `${line.id}.wav`);
  copyFileSync(join("public", line.reuse), out);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }));
  const src = R[line.id];
  manifest.cuts[line.id] = { dur, reuse: line.reuse };
  manifest.mots[line.id] = src.words.map((m) => ({ w: m.w, at: +(m.at - src.at).toFixed(3), end: +(m.end - src.at).toFixed(3) }));
  console.log(`${line.id.padEnd(4)} ${dur.toFixed(2)} s  « ${line.say} » (repris)`);
}
writeFileSync(join(OUT, "voix.json"), `${JSON.stringify(manifest, null, 1)}\n`);
