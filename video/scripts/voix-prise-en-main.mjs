// La voix du film « Prise en main » (16 oct. 2026) : une phrase par fichier, public/voix/prise-en-main/G1.mp3 … G20.mp3, lue
// dans src/prise-en-main/script.ts. Copie de scripts/voix-presentation.mjs : même voix (« Yann »), mêmes réglages, même
// nettoyage (silences retirés, −18 LUFS, mono 44,1 kHz). Plafond par défaut : 2 500 caractères envoyés d'un coup.
//
//   node scripts/voix-prise-en-main.mjs              → SEULES les phrases nouvelles ou changées sont demandées
//   node scripts/voix-prise-en-main.mjs --refaire G3 → redemande G3
//   node scripts/voix-prise-en-main.mjs --nettoyer   → refait le nettoyage depuis les bruts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SCRIPT, VOICE, VOICE_DIR } from "../src/prise-en-main/script.ts";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const from = opt("--depuis", null);
const redo = new Set((opt("--refaire", "") || "").split(",").filter(Boolean));
const cleanOnly = args.includes("--nettoyer");
const budget = Number(opt("--budget", "2500"));

const OUT = join("public", VOICE_DIR);
const RAW = join("out", "voix", "prise-en-main");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
const RAW_INDEX = join(RAW, "brut.json");
const MANIFEST = join(OUT, "voix.json");
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

// Comme le reel, plus un détail : en fin de phrase, un bruit de moins de 60 ms (souffle, clic de fin de fichier) compte
// comme du silence — sinon il garde une demi-seconde de blanc au bout, et la phrase suivante arrive en retard.
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_duration=0.06:start_threshold=-45dB:start_silence=0.08,areverse";

/**
 * Niveau : toutes les phrases à la MÊME SONIE (−18 LUFS intégrés, mesurés en mono), crête d'échantillon −2 dBFS.
 * Pas de loudnorm : sur une phrase de 1,5 s il ne peut pas rester linéaire et repasse en « dynamique », ce qui revient à
 * normaliser en crête (15 oct. 2026 : P7, P13, P19 sortaient 5 à 7 LU sous les autres). Ici : un gain constant, puis un
 * limiteur à anticipation (retard compensé : la durée et le calage ne bougent pas), le gain corrigé une fois d'après la
 * mesure APRÈS limiteur.
 */
const VOICE_I = -18;
const VOICE_LIMIT = "alimiter=limit=0.79:attack=2:release=30:level=0:latency=1";

/** Sonie intégrée (LUFS) de `input` passé dans `filters`, et crête d'échantillon (dBFS). */
function loudness(input, filters) {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", `${filters},ebur128=framelog=verbose:peak=sample`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const summary = err.slice(err.lastIndexOf("Summary:"));
  const I = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1]);
  if (!Number.isFinite(I)) throw new Error(`${input} : sonie illisible`);
  return { I, peak };
}

/** Silences retirés, sonie réglée (gain constant + limiteur), MP3 mono 44,1 kHz. */
function finish(input, output) {
  const before = loudness(input, TRIM);
  let gain = VOICE_I - before.I;
  const trial = loudness(input, `${TRIM},volume=${gain.toFixed(2)}dB,${VOICE_LIMIT}`);
  gain += VOICE_I - trial.I; // le limiteur mange un peu de sonie sur les phrases très remontées
  const encode = () => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `${TRIM},volume=${gain.toFixed(2)}dB,${VOICE_LIMIT}`, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", output]);
  encode();
  let after = loudness(output, "anull");
  if (Math.abs(after.I - VOICE_I) > 0.15) {
    gain += VOICE_I - after.I; // l'encodeur MP3 (filtre passe-bas) retire encore quelques dixièmes
    encode();
    after = loudness(output, "anull");
  }
  const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }).trim();
  console.log(`${output}  ${Number(d).toFixed(3)} s  ${before.I.toFixed(1)} → ${after.I.toFixed(1)} LUFS (gain ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB, crête ${after.peak} dBFS)`);
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
// Les repères exacts relevés à l'oreille (voix.json → « marks », lus par src/presentation/motion/time.ts), en secondes
// depuis le début du fichier de leur phrase : gardés tant que ce fichier n'est pas redemandé ni remplacé.
const previous = readJson(MANIFEST, {});
const MARK_LINE = {};
const renewed = new Set();

if (from) {
  for (const line of SCRIPT) {
    const source = readdirSync(from).find((name) => name.replace(/\.[^.]+$/, "") === line.id);
    if (!source) throw new Error(`${line.id} manque dans ${from} (attendu : ${line.id}.wav, .m4a, .mp3…) — « ${line.text} »`);
    finish(join(from, source), join(OUT, `${line.id}.mp3`));
    manifest.lignes[line.id] = line.say;
    renewed.add(line.id);
  }
  manifest.voix = "voix humaine";
} else {
  const todo = cleanOnly ? [] : SCRIPT.filter((l) => redo.has(l.id) || rawIndex[l.id] !== l.say || !existsSync(join(RAW, `${l.id}.mp3`)));
  for (const l of todo) renewed.add(l.id);
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
    if (!existsSync(raw)) throw new Error(`${raw} manque : lancer node scripts/voix-prise-en-main.mjs sans --nettoyer.`);
    if (rawIndex[line.id] !== line.say) throw new Error(`${line.id} : le brut dit « ${rawIndex[line.id]} », le script « ${line.say} ».`);
    finish(raw, join(OUT, `${line.id}.mp3`));
    manifest.lignes[line.id] = line.say;
  }
}
const marks = Object.fromEntries(
  Object.entries(previous.marks ?? {}).filter(([k]) => MARK_LINE[k] && !renewed.has(MARK_LINE[k]) && previous.lignes?.[MARK_LINE[k]] === manifest.lignes[MARK_LINE[k]]),
);
if (Object.keys(marks).length) manifest.marks = marks;
const lost = Object.keys(previous.marks ?? {}).filter((k) => !(k in marks));
if (lost.length) console.warn(`Repères à relever de nouveau (voix.json → marks) : ${lost.join(", ")} — leur phrase a changé.`);
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${MANIFEST} écrit.`);
