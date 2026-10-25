// Les mots de la voix en temps du FILM (src/rembobine/mots.json) : horodatage ElevenLabs (out/rembobine/voix/<voix>.json),
// découpe des phrases (public/rembobine/voix/voix.json) et départ de chaque phrase (timeline.ts → VOICE_AT).
//   node src/rembobine/tools/mots.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { VOICE_AT } from "../timeline.ts";
import { LINES, fullText } from "../script.ts";

/** Les mots affichés : la ponctuation seule colle au mot voisin (« au suivant, le reste au précédent). Même règle dans kit/captions.tsx. */
export function captionTokens(caption) {
  const raw = caption.split(/\s+/).filter(Boolean);
  const out = [];
  let carry = "";
  for (const r of raw) {
    if (/^[«]+$/.test(r)) { carry += `${r} `; continue; }
    if (/^[?!:;…»]+$/.test(r.replace(/\*/g, "")) && out.length) { out[out.length - 1] += ` ${r}`; continue; }
    out.push(carry + r);
    carry = "";
  }
  return out;
}

const m = JSON.parse(readFileSync("public/rembobine/voix/voix.json", "utf8"));
const raw = {};
const cursors = {};
const out = {};
for (const l of LINES) {
  raw[l.who] ??= JSON.parse(readFileSync(`out/rembobine/voix/${l.who}.json`, "utf8")).alignment;
  const text = fullText(l.who);
  const at = text.indexOf(l.say, cursors[l.who] ?? 0);
  cursors[l.who] = at + l.say.length;
  // Une phrase redite seule (`retake`, voir tools/voix.mjs) a son propre horodatage.
  const a = l.retake ? JSON.parse(readFileSync(`out/rembobine/voix/${l.id}.json`, "utf8")).alignment : raw[l.who];
  const start = l.retake ? 0 : at;
  const end = l.retake ? l.retake.length : at + l.say.length;
  const cut = m.cuts[l.id];
  // Temps du film = départ de la phrase + temps dans la prise depuis la coupe, ralenti ou accéléré par le `tempo` d'une reprise.
  const k = l.retake ? (l.tempo ?? 1) : 1;
  const film = (s) => +(VOICE_AT[l.id] + (s - cut.from) / k).toFixed(3);
  const words = [];
  let w = null;
  for (let i = start; i < end; i++) {
    if (/\s/.test(a.characters[i])) { if (w) words.push(w); w = null; continue; }
    if (!w) w = { w: "", at: film(a.character_start_times_seconds[i]), end: 0 };
    w.w += a.characters[i];
    w.end = film(a.character_end_times_seconds[i]);
  }
  if (w) words.push(w);
  // La ponctuation seule (« ? », « ! », « : ») colle au mot d'avant : un mot affiché = un mot dit.
  for (let i = words.length - 1; i > 0; i--) if (/^[?!:;…»«]+$/.test(words[i].w)) { words[i - 1].w += ` ${words[i].w}`; words[i - 1].end = words[i].end; words.splice(i, 1); }
  out[l.id] = { who: l.who, at: +VOICE_AT[l.id].toFixed(3), end: +(VOICE_AT[l.id] + cut.dur).toFixed(3), say: l.say, caption: l.caption, words };
  const n = captionTokens(l.caption).length;
  if (n !== words.length) console.warn(`${l.id} : ${n} mots affichés pour ${words.length} dits — calage linéaire.`);
}
writeFileSync("src/rembobine/mots.json", JSON.stringify(out, null, 1));
for (const [id, l] of Object.entries(out)) console.log(`${id.padEnd(4)} ${l.at.toFixed(2)}→${l.end.toFixed(2)}  ${l.words.map((w) => `${w.w}@${w.at.toFixed(2)}`).join(" ")}`);
