// La voix du film « Tarif » : une phrase par fichier, public/voix/tarif/T1.mp3 … T7.mp3, lue dans src/tarif/script.ts.
//
//   node scripts/voix-tarif.mjs                  → ElevenLabs, voix « Yann » : SEULES les phrases nouvelles ou changées
//                                                  sont demandées (le brut de chaque phrase est gardé dans out/voix/tarif)
//   node scripts/voix-tarif.mjs --refaire T3     → redemande T3 (et seulement elle), même si son texte n'a pas changé
//   node scripts/voix-tarif.mjs --nettoyer       → refait seulement le nettoyage depuis les bruts, sans rien demander
//   node scripts/voix-tarif.mjs --depuis ~/Desktop/voix → une VOIX HUMAINE : T1.wav (ou .m4a, .mp3…) … T7, nettoyée
//
// La clé d'ElevenLabs est lue dans ~/.pharmaboost-voix.env (ELEVENLABS_API_KEY=…) : jamais affichée, jamais écrite
// ailleurs. Chaque caractère envoyé est décompté du forfait : le script refuse d'en envoyer plus de 1 500 d'un coup
// (--budget <n> pour changer ce plafond), et chaque phrase n'est retentée qu'une fois en cas d'erreur.
//
// Chaque fichier : silences de début et de fin retirés, niveau réglé (−16 LUFS, crête −1,5 dBTP), mono, 44,1 kHz,
// MP3 192 kb/s — comme le reel (scripts/voix-reel.mjs). public/voix/tarif/voix.json garde ce que dit chaque fichier :
// le film refuse de se rendre si le script a changé depuis (un chiffre du site, par exemple) sans que la voix suive.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SCRIPT, VOICE, VOICE_DIR } from "../src/tarif/script.ts";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const from = opt("--depuis", null);
const redo = new Set((opt("--refaire", "") || "").split(",").filter(Boolean));
const cleanOnly = args.includes("--nettoyer");
const budget = Number(opt("--budget", "1500"));

const OUT = join("public", VOICE_DIR);
const RAW = join("out", "voix", "tarif");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
const RAW_INDEX = join(RAW, "brut.json");
const MANIFEST = join(OUT, "voix.json");
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

// Comme le reel, plus un détail : en fin de phrase, un bruit de moins de 60 ms (souffle, clic de fin de fichier) compte
// comme du silence — sinon il garde une demi-seconde de blanc au bout, et la phrase suivante arrive en retard.
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_duration=0.06:start_threshold=-45dB:start_silence=0.08,areverse";

/** Silences retirés, niveau mesuré puis réglé en deux passes (sans écraser la dynamique), MP3 mono 44,1 kHz. */
function finish(input, output) {
  const measure = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `${TRIM},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(measure.slice(measure.lastIndexOf("{"), measure.lastIndexOf("}") + 1));
  const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `${TRIM},${norm}`, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", output]);
  const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }).trim();
  console.log(`${output}  ${Number(d).toFixed(2)} s`);
}

/** La clé, lue sans jamais être affichée. */
function apiKey() {
  const path = join(homedir(), ".pharmaboost-voix.env");
  if (!existsSync(path)) throw new Error(`Clé absente : ${path} (ELEVENLABS_API_KEY=…)`);
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((l) => /^\s*(export\s+)?ELEVENLABS_API_KEY\s*=/.test(l));
  const key = line?.replace(/^\s*(export\s+)?ELEVENLABS_API_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error(`ELEVENLABS_API_KEY introuvable dans ${path}`);
  return key;
}

/** Le solde du forfait, s'il est lisible avec cette clé (sinon rien). */
async function balance(key) {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
    if (!res.ok) return null;
    const s = await res.json();
    return { used: s.character_count, limit: s.character_limit };
  } catch {
    return null;
  }
}

async function speak(key, line, i) {
  const body = {
    text: line.say,
    model_id: VOICE.model,
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    // Le contexte : la phrase d'avant et celle d'après, pour une intonation suivie d'un fichier à l'autre.
    ...(SCRIPT[i - 1] ? { previous_text: SCRIPT[i - 1].say } : {}),
    ...(SCRIPT[i + 1] ? { next_text: SCRIPT[i + 1].say } : {}),
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        // Une erreur de la demande elle-même (texte, voix, droits) ne se règle pas en retentant.
        if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`${line.id} : ElevenLabs ${res.status} — ${detail}`), { final: true });
        throw new Error(`${line.id} : ElevenLabs ${res.status} — ${detail}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e.final || attempt === 2) throw e;
      console.warn(`${e.message} — nouvelle tentative dans 3 s.`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const rawIndex = readJson(RAW_INDEX, {});
const manifest = { voix: `${VOICE.name} (ElevenLabs, ${VOICE.model})`, lignes: {} };

if (from) {
  for (const line of SCRIPT) {
    const source = readdirSync(from).find((name) => name.replace(/\.[^.]+$/, "") === line.id);
    if (!source) throw new Error(`${line.id} manque dans ${from} (attendu : ${line.id}.wav, .m4a, .mp3…) — « ${line.text} »`);
    finish(join(from, source), join(OUT, `${line.id}.mp3`));
    manifest.lignes[line.id] = line.say;
  }
  manifest.voix = "voix humaine";
} else {
  const todo = cleanOnly ? [] : SCRIPT.filter((l) => redo.has(l.id) || rawIndex[l.id] !== l.say || !existsSync(join(RAW, `${l.id}.mp3`)));
  const chars = todo.reduce((s, l) => s + l.say.length, 0);
  if (todo.length) {
    if (chars > budget) throw new Error(`${chars} caractères à envoyer, au-delà du plafond de ${budget} (--budget <n>). Rien n'a été envoyé.`);
    const key = apiKey();
    const before = await balance(key);
    if (before) console.log(`Forfait ElevenLabs : ${before.limit - before.used} caractères restants.`);
    console.log(`À demander : ${todo.map((l) => l.id).join(", ")} — ${chars} caractères.`);
    for (const line of todo) {
      const audio = await speak(key, line, SCRIPT.indexOf(line));
      writeFileSync(join(RAW, `${line.id}.mp3`), audio);
      rawIndex[line.id] = line.say;
      writeFileSync(RAW_INDEX, JSON.stringify(rawIndex, null, 2));
      console.log(`${line.id} reçue (${line.say.length} caractères) : « ${line.say} »`);
    }
    const after = await balance(key);
    if (before && after) console.log(`Décompté : ${after.used - before.used} caractères · restants : ${after.limit - after.used}.`);
  } else if (!cleanOnly) {
    console.log("Aucune phrase nouvelle ou changée : rien n'est demandé à ElevenLabs.");
  }
  for (const line of SCRIPT) {
    const raw = join(RAW, `${line.id}.mp3`);
    if (!existsSync(raw)) throw new Error(`${raw} manque : lancer node scripts/voix-tarif.mjs sans --nettoyer.`);
    if (rawIndex[line.id] !== line.say) throw new Error(`${line.id} : le brut dit « ${rawIndex[line.id]} », le script « ${line.say} ».`);
    finish(raw, join(OUT, `${line.id}.mp3`));
    manifest.lignes[line.id] = line.say;
  }
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${MANIFEST} écrit.`);
