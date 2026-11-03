// Les voix du film de la lettre, version 3 (3 nov. 2026) : UNE demande ElevenLabs par voix nouvelle (Yann, Clémence), avec
// l'horodatage de chaque caractère, puis une phrase par fichier : public/lettre/voix/<id>.wav, et leurs mots dans
// src/lettre/mots.json ({ id: { dur, words: [{ w, at, end }] } }, temps relatifs au début du fichier). Les répliques
// `reuse` (Rembobinons) sont copiées telles quelles. Ne redemande JAMAIS si le brut existe pour le même texte.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LINES, VOICES, fullText } from "../script.ts";

const OUT = join("public", "lettre", "voix");
const RAW = join("out", "lettre", "v3");
const SR = 44100;
const LIMIT = "alimiter=limit=0.79:attack=2:release=30:level=0:latency=1";
const key = () => {
  const line = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8").split(/\r?\n/).find((l) => /^\s*(export\s+)?ELEVENLABS_API_KEY\s*=/.test(l));
  const k = line?.replace(/^\s*(export\s+)?ELEVENLABS_API_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  if (!k) throw new Error("clé introuvable");
  return k;
};
const loud = (input) => {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "ebur128=peak=sample", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number(err.slice(err.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
};
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

const mots = {};
for (const [who, voice] of Object.entries(VOICES)) {
  const text = fullText(who);
  const mp3 = join(RAW, `${who}.mp3`);
  const json = join(RAW, `${who}.json`);
  const prev = existsSync(json) ? JSON.parse(readFileSync(json, "utf8")) : null;
  if (prev?.text !== text || !existsSync(mp3)) {
    const k = key();
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: voice.model, language_code: "fr", voice_settings: voice.settings }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
    writeFileSync(json, JSON.stringify({ text, alignment: data.alignment }, null, 1));
    console.log(`${voice.name} reçue (${text.length} caractères).`);
  }
  const { alignment } = JSON.parse(readFileSync(json, "utf8"));
  const ch = alignment.characters, t0 = alignment.character_start_times_seconds, t1 = alignment.character_end_times_seconds;
  const full = ch.join("");
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", mp3, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const total = x.length / SR, WIN = Math.round(0.005 * SR);
  const calmest = (a, b) => {
    let best = a, bestE = Infinity;
    for (let s = Math.max(0, Math.round(a * SR)); s + WIN < Math.min(x.length, Math.round(b * SR)); s += Math.round(WIN / 2)) {
      let e = 0;
      for (let q = 0; q < WIN; q++) e += x[s + q] * x[s + q];
      if (e < bestE) { bestE = e; best = (s + WIN / 2) / SR; }
    }
    return best;
  };
  const lines = LINES.filter((l) => l.who === who && !l.reuse);
  let cur = 0;
  const spans = lines.map((l) => { const a = full.indexOf(l.say, cur); if (a < 0) throw new Error(`phrase introuvable ${l.id}`); cur = a + l.say.length; return [a, cur - 1]; });
  const bounds = spans.slice(1).map(([a], i) => calmest(t1[spans[i][1]] - 0.04, t0[a] + 0.04));
  const gain = -18 - loud(mp3);
  lines.forEach((l, i) => {
    const [a, b] = spans[i];
    const from = Math.max(i === 0 ? 0 : bounds[i - 1], t0[a] - 0.05);
    const to = Math.min(i === spans.length - 1 ? total : bounds[i], t1[b] + 0.25);
    const out = join(OUT, `${l.id}.wav`);
    const len = to - from;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-af", `atrim=start=${from.toFixed(4)}:end=${to.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=${(len - 0.03).toFixed(4)}:d=0.03,volume=${gain.toFixed(2)}dB,${LIMIT}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    const words = [];
    let w = null;
    for (let c = a; c <= b; c++) {
      if (/\s/.test(ch[c])) { if (w) words.push(w); w = null; continue; }
      if (!w) w = { w: "", at: +(t0[c] - from).toFixed(3), end: 0 };
      w.w += ch[c];
      w.end = +(t1[c] - from).toFixed(3);
    }
    if (w) words.push(w);
    mots[l.id] = { who, dur: +dur(out).toFixed(3), words };
    console.log(`${l.id.padEnd(4)} ${dur(out).toFixed(2)} s  ${l.say}`);
  });
}
// Les répliques reprises : copiées, leurs mots répartis sur la parole (pas d'horodatage gardé pour elles).
for (const l of LINES.filter((q) => q.reuse)) {
  const out = join(OUT, `${l.id}.wav`);
  copyFileSync(join("public", l.reuse), out);
  const d = dur(out), parts = l.say.split(/\s+/);
  mots[l.id] = { who: l.who, dur: +d.toFixed(3), words: parts.map((p, i) => ({ w: p, at: +((i / parts.length) * (d - 0.15)).toFixed(3), end: +(((i + 1) / parts.length) * (d - 0.15)).toFixed(3) })) };
}
writeFileSync(join("src", "lettre", "mots.json"), JSON.stringify(mots, null, 1));
console.log("mots.json écrit.");
