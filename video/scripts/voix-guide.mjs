// La voix des films « Prise en main » (titulaire, pharmacien) — 17 oct. 2026.
//
//   node scripts/voix-guide.mjs titulaire|pharmacien        → seules les phrases nouvelles ou changées sont demandées
//   node scripts/voix-guide.mjs titulaire --refaire T3      → redemande T3
//
// ElevenLabs (voix « Yann ») est appelé AVEC le minutage de chaque caractère (/with-timestamps) : on sait à quel instant chaque
// mot est prononcé. La phrase est coupée à la parole (début du premier caractère, fin du dernier), mise à −18 LUFS (gain constant
// puis limiteur, comme les autres films), en WAV mono 48 kHz : public/voix/guide-<film>/<id>.wav. Les durées et les mots minutés
// (recalés sur la coupe) vont dans src/prise-en-main/voix-<film>.ts, lu par le film (sous-titres et gestes calés sur les mots) et
// par scripts/guide-mix.mjs (la bande-son, posée phrase par phrase à l'échantillon près).
//
// La clé est lue dans ~/.pharmaboost-voix.env, jamais affichée. Plafond : 3 000 caractères envoyés d'un coup (--budget <n>).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SCRIPTS, VOICE, voiceDir } from "../src/prise-en-main/script.ts";

const args = process.argv.slice(2);
const film = args[0];
if (!SCRIPTS[film]) throw new Error("Film : titulaire ou pharmacien");
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const redo = new Set((opt("--refaire", "") || "").split(",").filter(Boolean));
const budget = Number(opt("--budget", "3000"));
const SCRIPT = SCRIPTS[film];
const OUT = join("public", voiceDir(film));
const RAW = join("out", "voix", `guide-${film}`);
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

function apiKey() {
  const env = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8");
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error("ELEVENLABS_API_KEY absente de ~/.pharmaboost-voix.env");
  return m[1];
}

async function balance(key) {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } }).catch(() => null);
  if (!r?.ok) return null;
  const s = await r.json();
  return s.character_limit - s.character_count;
}

async function speak(key, line, i) {
  const body = {
    text: line.say,
    model_id: VOICE.model,
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    ...(SCRIPT[i - 1] ? { previous_text: SCRIPT[i - 1].say } : {}),
    ...(SCRIPT[i + 1] ? { next_text: SCRIPT[i + 1].say } : {}),
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const detail = (await res.text()).slice(0, 300);
    if (attempt === 2 || (res.status !== 429 && res.status < 500)) throw new Error(`${line.id} : ElevenLabs ${res.status} — ${detail}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** Les mots et leurs instants, depuis le minutage des caractères. */
function wordsOf(alignment) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = alignment;
  const words = [];
  let cur = null;
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) {
      if (cur) words.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { w: "", s: st[i], e: en[i] };
    cur.w += ch[i];
    cur.e = en[i];
  }
  if (cur) words.push(cur);
  return words;
}

const VOICE_I = -18;
const LIMIT = "alimiter=limit=0.79:attack=2:release=30:level=0:latency=1";
function loudness(input, filters) {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", `${filters},ebur128=framelog=verbose:peak=sample`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const summary = err.slice(err.lastIndexOf("Summary:"));
  return Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
}

const indexPath = join(RAW, "brut.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
const todo = SCRIPT.filter((l) => redo.has(l.id) || index[l.id] !== l.say || !existsSync(join(RAW, `${l.id}.json`)));
const chars = todo.reduce((s, l) => s + l.say.length, 0);
if (todo.length) {
  if (chars > budget) throw new Error(`${chars} caractères à envoyer, au-delà du plafond de ${budget}. Rien n'a été envoyé.`);
  const key = apiKey();
  const before = await balance(key);
  console.log(`Forfait : ${before ?? "?"} caractères restants · à demander : ${todo.map((l) => l.id).join(", ")} (${chars} caractères).`);
  for (const line of todo) {
    const data = await speak(key, line, SCRIPT.indexOf(line));
    writeFileSync(join(RAW, `${line.id}.mp3`), Buffer.from(data.audio_base64, "base64"));
    writeFileSync(join(RAW, `${line.id}.json`), JSON.stringify(data.alignment));
    index[line.id] = line.say;
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`${line.id} reçue`);
  }
  const after = await balance(key);
  if (before !== null && after !== null) console.log(`Décompté : ${before - after} · restants : ${after}.`);
}

const voices = {};
for (const line of SCRIPT) {
  const raw = join(RAW, `${line.id}.mp3`);
  const words = wordsOf(JSON.parse(readFileSync(join(RAW, `${line.id}.json`), "utf8")));
  const cutIn = Math.max(0, words[0].s - 0.04);
  const cutOut = words[words.length - 1].e + 0.14;
  const trim = `atrim=start=${cutIn.toFixed(3)}:end=${cutOut.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${(cutOut - cutIn - 0.05).toFixed(3)}:d=0.05`;
  let gain = VOICE_I - loudness(raw, trim);
  gain += VOICE_I - loudness(raw, `${trim},volume=${gain.toFixed(2)}dB,${LIMIT}`);
  const out = join(OUT, `${line.id}.wav`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", `${trim},volume=${gain.toFixed(2)}dB,${LIMIT}`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", out]);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).trim());
  voices[line.id] = { dur: Math.round(dur * 1000) / 1000, words: words.map((w) => ({ w: w.w, s: Math.round((w.s - cutIn) * 1000) / 1000, e: Math.round((w.e - cutIn) * 1000) / 1000 })) };
  console.log(`${out}  ${dur.toFixed(2)} s · ${words.length} mots`);
}
const ts = `// Écrit par scripts/voix-guide.mjs ${film} — ne pas modifier à la main. Durées (s) et mots minutés depuis le début du fichier.\nexport type VoiceWord = { w: string; s: number; e: number };\nexport const VOICES: Record<string, { dur: number; words: VoiceWord[] }> = ${JSON.stringify(voices)};\n`;
writeFileSync(join("src", "prise-en-main", `voix-${film}.ts`), ts);
console.log(`src/prise-en-main/voix-${film}.ts écrit.`);
