// Les mots de la voix en temps du FILM (src/cercle/mots.json), depuis public/cercle/voix/voix.json (mots en temps de la
// phrase) et timeline.ts (VOICE_AT). La ponctuation seule (« ? ») colle au mot d'avant.
//   node src/cercle/tools/mots.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { VOICE_AT } from "../timeline.ts";
import { LINES } from "../script.ts";

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
const m = JSON.parse(readFileSync("public/cercle/voix/voix.json", "utf8"));
const out = {};
for (const l of LINES) {
  const base = VOICE_AT[l.id];
  const words = m.mots[l.id].map((w) => ({ ...w, at: +(base + w.at).toFixed(3), end: +(base + w.end).toFixed(3) }));
  for (let i = words.length - 1; i > 0; i--) if (/^[?!:;…»«]+$/.test(words[i].w)) { words[i - 1].w += ` ${words[i].w}`; words[i - 1].end = words[i].end; words.splice(i, 1); }
  out[l.id] = { at: +base.toFixed(3), end: +(base + m.cuts[l.id].dur).toFixed(3), say: l.say, caption: l.caption, words };
  const n = captionTokens(l.caption).length;
  if (n !== words.length) console.warn(`${l.id} : ${n} mots affichés pour ${words.length} dits — calage linéaire.`);
}
writeFileSync("src/cercle/mots.json", JSON.stringify(out, null, 1));
for (const [id, l] of Object.entries(out)) console.log(`${id.padEnd(4)} ${l.at.toFixed(2)}→${l.end.toFixed(2)}  ${l.words.map((w) => `${w.w}@${w.at.toFixed(2)}`).join(" ")}`);
