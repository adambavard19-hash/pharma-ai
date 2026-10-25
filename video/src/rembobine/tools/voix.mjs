// Les voix du film « Rembobinons » : UNE demande ElevenLabs par voix (Yann, Clémence, Eric), avec l'horodatage de chaque
// caractère, puis le découpage en une phrase par fichier : public/rembobine/voix/<id>.wav + voix.json.
//
//   node src/rembobine/tools/voix.mjs              → demande une voix SEULEMENT si son brut manque ou si son texte a changé
//   node src/rembobine/tools/voix.mjs --decouper   → refait seulement le découpage et le niveau depuis les bruts
//
// La clé est lue dans ~/.pharmaboost-voix.env et n'est jamais affichée. Le script refuse d'envoyer plus de caractères
// qu'il n'en reste au forfait, et ne retente jamais (une seconde demande coûterait une seconde fois).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LINES, VOICES, VOICE_DIR, fullText } from "../script.ts";

const OUT = join("public", VOICE_DIR);
const RAW = join("out", "rembobine", "voix");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

function apiKey() {
  const line = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8").split(/\r?\n/).find((l) => /^\s*(export\s+)?ELEVENLABS_API_KEY\s*=/.test(l));
  const key = line?.replace(/^\s*(export\s+)?ELEVENLABS_API_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("ELEVENLABS_API_KEY introuvable dans ~/.pharmaboost-voix.env");
  return key;
}

async function balance(key) {
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  const s = await res.json();
  return s.character_limit - s.character_count;
}

const SR = 44100;
const VOICE_I = -18;
const LIMIT = "alimiter=limit=0.79:attack=2:release=30:level=0:latency=1";
function loudness(input, pre = "") {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", `${pre}ebur128=peak=sample`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const s = err.slice(err.lastIndexOf("Summary:"));
  return Number(s.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
}

const manifest = { voix: {}, lignes: {}, cuts: {} };
for (const [who, voice] of Object.entries(VOICES)) {
  const text = fullText(who);
  const rawMp3 = join(RAW, `${who}.mp3`);
  const rawJson = join(RAW, `${who}.json`);
  const previous = existsSync(rawJson) ? JSON.parse(readFileSync(rawJson, "utf8")) : null;
  if (!process.argv.includes("--decouper") && (previous?.text !== text || !existsSync(rawMp3))) {
    const key = apiKey();
    const left = await balance(key);
    console.log(`${voice.name} — forfait : ${left} caractères restants ; à envoyer : ${text.length}.`);
    if (text.length > left) throw new Error("Pas assez de caractères au forfait : rien n'a été envoyé.");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: voice.model, language_code: "fr", voice_settings: voice.settings }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    writeFileSync(rawMp3, Buffer.from(data.audio_base64, "base64"));
    writeFileSync(rawJson, JSON.stringify({ text, alignment: data.alignment }, null, 1));
  }
  manifest.voix[who] = `${voice.name} (ElevenLabs, ${voice.model})`;

  const { alignment } = JSON.parse(readFileSync(rawJson, "utf8"));
  const t0 = alignment.character_start_times_seconds;
  const t1 = alignment.character_end_times_seconds;
  if (alignment.characters.join("") !== text) console.warn(`${voice.name} : l'alignement ne reprend pas le texte à l'identique.`);
  const lines = LINES.filter((l) => l.who === who);
  let cursor = 0;
  const spans = lines.map((l) => {
    const start = text.indexOf(l.say, cursor);
    cursor = start + l.say.length;
    return [start, cursor - 1];
  });

  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", rawMp3, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const total = x.length / SR;
  const WIN = Math.round(0.005 * SR);
  // La coupure entre deux phrases : le point le PLUS CALME entre la fin de l'une et le début de l'autre.
  const calmest = (a, b) => {
    let best = a, bestE = Infinity;
    for (let s = Math.max(0, Math.round(a * SR)); s + WIN < Math.min(x.length, Math.round(b * SR)); s += Math.round(WIN / 2)) {
      let e = 0;
      for (let k = 0; k < WIN; k++) e += x[s + k] * x[s + k];
      if (e < bestE) { bestE = e; best = (s + WIN / 2) / SR; }
    }
    return best;
  };
  const bounds = spans.slice(1).map(([a], i) => calmest(t1[spans[i][1]] - 0.04, t0[a] + 0.04));
  // Chaque phrase : de la coupure (ou 50 ms avant la parole) jusqu'à la coupure suivante (ou 250 ms après la parole).
  const cuts = spans.map(([a, b], i) => ({
    from: Math.max(i === 0 ? 0 : bounds[i - 1], t0[a] - 0.05),
    to: Math.min(i === spans.length - 1 ? total : bounds[i], t1[b] + 0.25),
    speechFrom: t0[a],
    speechTo: t1[b],
  }));
  // Un seul gain par voix (mesuré sur la voix entière) : les phrases gardent leurs nuances entre elles.
  const gain = VOICE_I - loudness(rawMp3);
  // Les REPRISES (`retake`) : la phrase est redite SEULE, ses voisines passées en contexte pour garder le ton, puis remise
  // au niveau de la phrase d'origine. Le reste de la voix ne bouge pas.
  const takes = {};
  for (const [i, line] of lines.entries()) {
    if (!line.retake) continue;
    const mp3 = join(RAW, `${line.id}.mp3`);
    const json = join(RAW, `${line.id}.json`);
    const before = existsSync(json) ? JSON.parse(readFileSync(json, "utf8")) : null;
    if (!process.argv.includes("--decouper") && (before?.text !== line.retake || !existsSync(mp3))) {
      const key = apiKey();
      const left = await balance(key);
      console.log(`${voice.name} — reprise ${line.id} : ${left} caractères restants ; à envoyer : ${line.retake.length}.`);
      if (line.retake.length > left) throw new Error("Pas assez de caractères au forfait : rien n'a été envoyé.");
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.retake, model_id: voice.model, language_code: "fr", voice_settings: voice.settings, previous_text: lines[i - 1]?.say, next_text: lines[i + 1]?.say }),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
      writeFileSync(json, JSON.stringify({ text: line.retake, alignment: data.alignment }, null, 1));
    }
    const { alignment: a } = JSON.parse(readFileSync(json, "utf8"));
    const s0 = a.character_start_times_seconds;
    const s1 = a.character_end_times_seconds;
    const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], { encoding: "utf8" }));
    const c = { from: Math.max(0, s0[0] - 0.05), to: Math.min(len, s1[s1.length - 1] + 0.25), speechFrom: s0[0], speechTo: s1[s1.length - 1] };
    const seg = (file, x, y) => loudness(file, `atrim=start=${x.toFixed(4)}:end=${y.toFixed(4)},`);
    takes[line.id] = { src: mp3, cut: c, gain: gain + seg(rawMp3, cuts[i].speechFrom, cuts[i].speechTo) - seg(mp3, c.speechFrom, c.speechTo) };
  }
  lines.forEach((line, i) => {
    const take = takes[line.id];
    const c = take?.cut ?? cuts[i];
    const out = join(OUT, `${line.id}.wav`);
    const k = take ? (line.tempo ?? 1) : 1;
    const len = (c.to - c.from) / k;
    const fades = `afade=t=in:d=0.006,afade=t=out:st=${(len - 0.03).toFixed(4)}:d=0.03`;
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", take?.src ?? rawMp3, "-af", `atrim=start=${c.from.toFixed(4)}:end=${c.to.toFixed(4)},asetpts=PTS-STARTPTS,${k !== 1 ? `atempo=${k},` : ""}${fades},volume=${(take?.gain ?? gain).toFixed(2)}dB,${LIMIT}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }));
    manifest.lignes[line.id] = line.say;
    // lead : le silence au début du fichier avant la voix, pour caler les mots à l'image.
    manifest.cuts[line.id] = { who, ...(take ? { retake: true, tempo: k } : {}), ...c, dur: d, lead: Math.max(0, c.speechFrom - c.from) / k, speech: (c.speechTo - c.speechFrom) / k };
    console.log(`${line.id.padEnd(4)} ${voice.name.padEnd(9)} ${d.toFixed(2)} s  « ${take ? line.retake : line.say} »${take ? "  (reprise)" : ""}`);
  });
}
writeFileSync(join(OUT, "voix.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${join(OUT, "voix.json")} écrit.`);
