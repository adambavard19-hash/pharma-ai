// La voix de la vidéo « Lettre sous la porte » (fondateur, 31 oct. 2026) : UNE demande ElevenLabs (Yann, le narrateur des films
// PharmaBoost) avec l'horodatage de chaque caractère → public/lettre/voix.mp3 + out/lettre/voix.json (bruts) + src/lettre/mots.json.
// Ne redemande JAMAIS si le brut existe déjà pour le même texte (une seconde demande coûterait une seconde fois).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const TEXT =
  "Bonjour. Pardon pour cette lettre glissée sous votre porte : nous avons préféré ça plutôt qu'un commercial qui vous dérange en pleine journée. Nous avons créé PharmaBoost, un logiciel qui fonctionne à côté de votre LGO. À chaque boîte scannée, il vous montre le conseil et la routine idéals à proposer, pris dans votre stock, selon votre marge, vos challenges, vos dates courtes et vos laboratoires préférés. Regardez la vidéo qui suit : en une minute, vous saurez tout. Et si cela vous parle, organisons une courte visioconférence. Vous ne le regretterez pas, pour la croissance de votre pharmacie et de votre patientèle.";
const VOICE = { id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } };
const RAW_MP3 = join("out", "lettre", "voix-brut.mp3");
const RAW_JSON = join("out", "lettre", "voix.json");

function apiKey() {
  const line = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8").split(/\r?\n/).find((l) => /^\s*(export\s+)?ELEVENLABS_API_KEY\s*=/.test(l));
  const key = line?.replace(/^\s*(export\s+)?ELEVENLABS_API_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("ELEVENLABS_API_KEY introuvable");
  return key;
}

const previous = existsSync(RAW_JSON) ? JSON.parse(readFileSync(RAW_JSON, "utf8")) : null;
if (previous?.text === TEXT && existsSync(RAW_MP3)) {
  console.log("Voix déjà là : aucune demande.");
} else {
  const key = apiKey();
  const sub = await (await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } })).json();
  const left = sub.character_limit - sub.character_count;
  console.log(`Forfait : ${left} caractères restants ; à envoyer : ${TEXT.length}.`);
  if (TEXT.length > left) throw new Error("Pas assez de caractères : rien n'a été envoyé.");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: TEXT, model_id: VOICE.model, language_code: "fr", voice_settings: VOICE.settings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  writeFileSync(RAW_MP3, Buffer.from(data.audio_base64, "base64"));
  writeFileSync(RAW_JSON, JSON.stringify({ text: TEXT, alignment: data.alignment }, null, 1));
  console.log("Voix reçue.");
}

// Les mots et leurs temps (un mot = une suite sans espace), pour les sous-titres et le calage des scènes.
const { alignment } = JSON.parse(readFileSync(RAW_JSON, "utf8"));
const chars = alignment.characters;
const t0 = alignment.character_start_times_seconds;
const t1 = alignment.character_end_times_seconds;
const words = [];
let cur = null;
for (let i = 0; i < chars.length; i++) {
  if (/\s/.test(chars[i])) {
    if (cur) words.push(cur);
    cur = null;
    continue;
  }
  if (!cur) cur = { w: "", at: t0[i], end: t1[i] };
  cur.w += chars[i];
  cur.end = t1[i];
}
if (cur) words.push(cur);
writeFileSync(join("src", "lettre", "mots.json"), JSON.stringify(words.map((w) => ({ w: w.w, at: +w.at.toFixed(3), end: +w.end.toFixed(3) })), null, 1));
console.log(`${words.length} mots, ${words[words.length - 1].end.toFixed(2)} s.`);
