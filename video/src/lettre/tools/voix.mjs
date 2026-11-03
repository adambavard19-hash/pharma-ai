// La voix de la vidéo « Lettre sous la porte » (fondateur, 31 oct. 2026 ; texte complet refait le 2 nov. 2026, la vidéo entière) : UNE demande ElevenLabs (Yann, le narrateur des films
// PharmaBoost) avec l'horodatage de chaque caractère → public/lettre/voix.mp3 + out/lettre/voix.json (bruts) + src/lettre/mots.json.
// Ne redemande JAMAIS si le brut existe déjà pour le même texte (une seconde demande coûterait une seconde fois).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const TEXT =
  "Bonjour, Docteur. Nous avons préféré vous envoyer cette lettre, plutôt que de vous déranger en pleine journée : on sait à quel point elle est chargée. Nous avons créé PharmaBoost, un logiciel qui fonctionne à côté de votre LGO, sans jamais le gêner. Au comptoir, vous connaissez vos patients. Vous connaissez vos produits. Mais entre les ordonnances, les questions et les interruptions… comment penser à chaque conseil, à chaque délivrance ? Avec PharmaBoost, chaque scan devient une occasion de mieux accompagner votre patient. Vous scannez les boîtes, comme d'habitude. Une bannière discrète vous propose des conseils liés à la délivrance, choisis parmi les produits de votre officine. Les questions à poser. L'intérêt du produit. Les précautions à vérifier. La bonne information, au bon moment. Et c'est toujours vous qui décidez. Un exemple : un patient vient chercher sa cétirizine, conseillée ou prescrite. PharmaBoost vous propose une routine allergie complète : le nez, les yeux, la gorge, selon ses symptômes, avec les conseils d'utilisation, et, si la situation s'y prête, un traitement de fond. Même logique pour la peau, les antibiotiques, et bien d'autres thèmes. Même patient. Même ordonnance. Un conseil plus complet. PharmaBoost connaît aussi vos gammes, et vous aide à faire vivre votre stock. Mettez en avant vos priorités : vos dates courtes, vos laboratoires partenaires, vos challenges en cours. Un produit en surstock qui dort en rayon, alors qu'il est déjà payé ? Lancez une campagne : PharmaBoost le remet en avant au comptoir. Pour le titulaire, ce sont des gammes mieux exploitées, et une officine qui avance. Pour le patient, le conseil continue après le comptoir : un récapitulatif personnalisé, imprimé, envoyé par e-mail, ou en QR code. Et bientôt, il le retrouvera dans l'application PharmaBoost, sur son téléphone. PharmaBoost. Votre expertise, soutenue à chaque délivrance. Réservez une démonstration, et voyez-le en situation, au comptoir.";
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
