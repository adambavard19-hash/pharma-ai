// La voix du reel Instagram : une phrase par fichier, public/voix/reel/L1.mp3 … L7.mp3, lue dans src/reel/script.ts.
//
//   node scripts/voix-reel.mjs                         → voix PROVISOIRE de macOS (Thomas, débit 195)
//   node scripts/voix-reel.mjs --voix "Flo (Français (France))" --debit 190 --sortie /tmp/essai
//   node scripts/voix-reel.mjs --depuis ~/Desktop/voix   → la VOIX HUMAINE : L1.wav (ou .m4a, .mp3…) … L7, nettoyée
//
// Chaque fichier : silences de début et de fin retirés, niveau réglé (−16 LUFS, crête −1,5 dBTP), mono, 44,1 kHz,
// MP3 192 kb/s. Le film (src/films/reel.tsx) mesure ces fichiers au rendu : changer la voix recale tout le montage.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRIPT, VOICE_DIR } from "../src/reel/script.ts";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const voice = opt("--voix", "Thomas");
const rate = opt("--debit", "195");
const from = opt("--depuis", null);
const out = opt("--sortie", join("public", VOICE_DIR));
mkdirSync(out, { recursive: true });

const work = mkdtempSync(join(tmpdir(), "voix-reel-"));
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse";

/** Silences retirés, niveau mesuré puis réglé en deux passes (sans écraser la dynamique), MP3 mono 44,1 kHz. */
function finish(input, output) {
  const measure = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `${TRIM},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(measure.slice(measure.lastIndexOf("{"), measure.lastIndexOf("}") + 1));
  const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `${TRIM},${norm}`, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", output]);
  const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }).trim();
  console.log(`${output}  ${Number(d).toFixed(2)} s`);
}

for (const line of SCRIPT) {
  const output = join(out, `${line.id}.mp3`);
  if (from) {
    const source = readdirSync(from).find((name) => name.replace(/\.[^.]+$/, "") === line.id);
    if (!source) throw new Error(`${line.id} manque dans ${from} (attendu : ${line.id}.wav, .m4a, .mp3…) — « ${line.text} »`);
    finish(join(from, source), output);
  } else {
    const aiff = join(work, `${line.id}.aiff`);
    execFileSync("say", ["-v", voice, "-r", rate, "-o", aiff, line.say]);
    finish(aiff, output);
  }
}
rmSync(work, { recursive: true, force: true });
if (!from) console.log(`Voix provisoire : ${voice}, débit ${rate}. À remplacer par la voix humaine (--depuis <dossier>).`);
if (!existsSync(join("public", VOICE_DIR))) console.warn("Attention : rien n'a été écrit dans public/ (option --sortie).");
