// Les effets sonores du film « Présentation » (ElevenLabs Sound Effects), d'après la liste « sfx » de
// DIRECTION-PRESENTATION.json. Bruts dans out/sound/raw-<nom>.mp3 ; prêts (silence de tête retiré, recadrés,
// crête à −1 dBFS) dans public/sfx2/<nom>.mp3 — le nom est celui du type PbSfx (motion/kit/sfx.tsx).
//   node scripts/sfx-elevenlabs.mjs            génère ce qui manque, puis traite tout
//   node scripts/sfx-elevenlabs.mjs --force n1 n2   régénère ces sons
//   node scripts/sfx-elevenlabs.mjs --process  ne fait que le traitement (aucun crédit)
//   node scripts/sfx-elevenlabs.mjs --process --only=impact_reveal,impact_clean   ne retraite que ces sons
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { post, credits } from "./eleven.mjs";

// [nom, prompt, durée demandée (s), recadrage final (s) ou null, prompt_influence]
const LIST = [
  ["neon_flicker_grey", "Old neon sign flickering on with an electric buzz and three sharp crackles, then an unstable buzzing hum", 1.6, null],
  ["neon_clean_on", "Fluorescent neon tube powering on: a soft electric tink, then a warm bright steady electric hum that sustains, clean, no crackle", 1.5, null, 0.7],
  ["whoosh_fast", "Fast airy whoosh, short and clean, modern motion graphics transition swish", 0.6, null],
  ["whoosh_heavy", "Deep powerful whoosh with low rumble, camera flying fast through glass, cinematic transition", 1.0, null],
  ["tick_metronome", "Single crisp dry mechanical clock tick, one hit only, close-mic, no reverb", 0.5, 0.12],
  ["gauge_slam", "Gauge needle slamming into the red zone with a metallic spring twang and a short warning beep tone", 0.8, null],
  ["box_drop", "Small cardboard medicine box dropping on a wooden counter, soft thud with one light bounce", 0.5, null],
  ["counter_roll", "Rapid mechanical flip digits rolling, fast ticking counter, stopping with a click", 1.0, null],
  ["queue_murmur", "Low indistinct murmur of a few people waiting in a small shop, light shuffling footsteps, impatient sighs, no words", 3.0, null],
  ["stopwatch_tension", "Fast stopwatch ticking, accelerating with rising tension", 1.5, null],
  ["glitch_burst", "Short digital glitch burst, data corruption stutter, crunchy", 0.5, null],
  ["bubble_pop", "Soft round cartoon bubble pop, wet and playful, single pop", 0.5, 0.35],
  ["door_slide", "Automatic sliding shop door closing, pneumatic swish and soft thump", 1.2, null],
  ["coin_miss", "A single coin rolling away on a hard floor, then a soft deflating whoosh with a gently descending tone, missed opportunity", 1.2, null],
  ["riser_big", "Cinematic white noise riser with a rising synth swell, building tension, cutting off abruptly at the peak", 3.0, null],
  ["crt_off", "Old CRT television switching off, electric zap collapsing to a dot, faint high whine, then silence", 0.8, null],
  ["awakening_pad", "Dark warm ambient pad with a soft slow heartbeat sub bass and tiny glassy twinkles, mysterious and hopeful", 3.5, null],
  ["robot_boot", "Cute friendly little robot powering up, rising playful electronic chirps and a warm hum", 1.5, null],
  ["reverse_riser", "Cinematic reverse cymbal swell and reverse riser sucking inward, getting louder, ending abruptly at the loudest point", 2.0, null],
  ["impact_reveal", "Massive cinematic impact with deep sub boom and glass shattering into shimmering crystal sparkles, bright tail", 3.0, null],
  ["impact_clean", "Huge bright cinematic impact with deep sub boom and a shimmering bell tail, no glass", 2.5, null],
  ["sparkle_shimmer", "Magical glittering sparkle shimmer, bright high chimes, airy", 1.2, null],
  ["robot_boing", "Small cute robot jumping and landing with a springy metallic boing and a soft servo whir", 0.7, null],
  ["scan_laser", "Futuristic soft laser scanner sweep, smooth electronic zap with a light sparkle", 0.6, null],
  ["hud_lock", "HUD target lock confirmation, crisp digital click with a tiny bright tone", 0.5, null],
  ["catch_whoomp", "Cartoon catch, soft padded whoomp with a tiny rubbery squeak", 0.5, null],
  ["data_processing", "Soft rapid computer processing blips, tiny high digital chirps, friendly", 1.0, null],
  ["ui_ding", "Bright clean pleasant UI notification chime, single ding, modern and premium", 0.6, null],
  ["card_unfold", "Sleek UI card unfolding, soft paper-like swoosh followed by a tiny sparkle", 0.7, null],
  ["ui_pop", "Soft bubbly UI pop, interface element appearing, single short pop", 0.5, 0.22],
  ["ui_click", "Crisp soft modern UI click, short and satisfying, single click", 0.5, 0.15],
  ["radar_ping", "Soft clean sonar ping with a gentle echo, modern interface", 0.6, null],
  ["slot_lock", "Digital slot machine reels spinning briefly and locking into place with a click", 0.8, null],
  ["coin_flip", "Gold coin flipping and spinning in the air, bright metallic ring on landing", 0.8, null],
  ["stamp_slam", "Heavy rubber stamp slamming on a desk, punchy with deep low end", 0.5, null],
  ["cash_register", "Cheerful vintage cash register cha-ching with a small bell and coins jingling", 1.2, null],
  ["paper_plane", "Quick crisp paper folding three times, then a paper airplane whooshing away in a loop", 1.8, null],
  ["paper_fold", "Quick crisp sheet of paper folding three times, origami, light and clean", 0.7, null],
  ["mail_chime", "Friendly two-note notification chime, soft and modern, message sent", 0.6, null],
  ["confetti_cannon", "Two party poppers bursting with confetti rain and a short joyful crowd cheer", 2.0, null],
  ["pixel_dissolve", "Digital particles dissolving away, sparkly granular swish", 1.0, null],
  ["lock_shield", "Soft energy shield humming closed, then a secure lock clicking shut", 1.0, null],
  ["pen_signature", "Quick pen signature scribble on paper, light and crisp", 0.8, null],
  ["laser_write", "Sci-fi laser beam writing on glass, sizzling light with a soft hum", 1.5, null],
  ["orbit_whoosh", "Accelerating circular whoosh spinning faster and faster, swirling air, ending in a bright flash", 1.5, null],
];

const args = process.argv.slice(2);
const onlyProcess = args.includes("--process");
const force = args.includes("--force") ? new Set(args.filter((a) => !a.startsWith("--"))) : new Set();
const only = new Set((args.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean));
mkdirSync("out/sound", { recursive: true });
mkdirSync("public/sfx2", { recursive: true });
const raw = (n) => `out/sound/raw-${n}.mp3`;

async function generate() {
  const todo = LIST.filter(([n]) => force.has(n) || !existsSync(raw(n)));
  const before = await credits();
  console.log(`avant : ${before.used} / ${before.limit} ; à générer : ${todo.length}`);
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(
      todo.slice(i, i + 3).map(async ([n, text, dur, , infl]) => {
        try {
          await post("/v1/sound-generation?output_format=mp3_44100_192", { text, duration_seconds: dur, prompt_influence: infl ?? 0.55 }, raw(n));
          console.log(`  ${n} ✓`);
        } catch (e) {
          console.warn(`  ${n} ✗ ${String(e).slice(0, 200)}`);
        }
      }),
    );
  }
  const after = await credits();
  console.log(`après : ${after.used} / ${after.limit} (dépensé ${after.used - before.used}, compteur parfois en retard)`);
}

const ff = (a) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...a]);
/** Crête (dBFS) d'un fichier. */
function require_spawn(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : 0;
}
function duration(file) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
}

/**
 * Les grandes frappes (impact_reveal, impact_clean) sortent d'ElevenLabs en sub presque pur (40-80 Hz ; impact_clean n'a
 * RIEN au-dessus de 160 Hz à −37 dB près) : inaudibles sur un ordinateur portable ou un téléphone, où le site sera vu, et
 * coûteuses en crête dans le mélange. On retire l'infra (< 30 Hz) et on ajoute les harmoniques du sub (saturation douce
 * asymétrique d'une copie filtrée sous 140 Hz, gardée de 140 Hz à 1,6 kHz, à −4 dB) : même enveloppe, même caractère,
 * mais la frappe s'entend enfin hors caisson (+11 dB au-dessus de 180 Hz pour impact_clean, +2,5 dB pour impact_reveal).
 */
const PUNCH =
  "highpass=f=30:poles=2,asplit=2[dry][wet];" +
  "[wet]lowpass=f=140:poles=2,aeval=exprs=tanh(12*val(0))+0.5*abs(tanh(12*val(0)))|tanh(12*val(1))+0.5*abs(tanh(12*val(1))):c=same," +
  "highpass=f=140:poles=2,highpass=f=140:poles=2,lowpass=f=1600:poles=2,volume=-4dB[harm];" +
  "[dry][harm]amix=inputs=2:normalize=0";
const PUNCHED = new Set(["impact_reveal", "impact_clean"]);

/** Silence de tête retiré, recadrage + fondu de sortie, crête −1 dBFS, mp3 192k stéréo 44,1 kHz. */
function finish(src, dst, { trim = null, pre = "", tailTrim = false, post = "" } = {}) {
  const tmp = `out/sound/tmp-${dst.split("/").pop().replace(".mp3", "")}.wav`;
  const chain = [pre, "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004"];
  if (tailTrim) chain.push("areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01,areverse");
  if (trim) chain.push(`atrim=0:${trim},afade=t=out:st=${Math.max(0, trim - Math.min(0.06, trim / 3)).toFixed(3)}:d=${Math.min(0.06, trim / 3).toFixed(3)}`);
  if (post) chain.push(post);
  ff(["-i", src, "-af", chain.filter(Boolean).join(","), "-ar", "44100", "-ac", "2", tmp]);
  const gain = -1 - require_spawn(tmp);
  ff(["-i", tmp, "-af", `volume=${gain.toFixed(2)}dB`, "-ar", "44100", "-ac", "2", "-b:a", "192k", dst]);
  return { dur: duration(dst), gain };
}

function processAll() {
  const rep = [];
  for (const [n, , , trim] of LIST) {
    if (only.size && !only.has(n)) continue;
    if (!existsSync(raw(n))) { rep.push(`${n} : brut absent`); continue; }
    const opts = { trim, post: PUNCHED.has(n) ? PUNCH : "" };
    if (n === "reverse_riser" || n === "riser_big") opts.tailTrim = true; // finit net sur la crête
    const r = finish(raw(n), `public/sfx2/${n}.mp3`, opts);
    if (n === "reverse_riser" && r.dur < 2) {
      // Longueur nominale 2,0 s (les scènes le posent à « fin − 2,0 ») : silence ajouté devant, la crête reste à la fin.
      const pad = Math.round((2 - r.dur) * 1000);
      ff(["-i", `public/sfx2/${n}.mp3`, "-af", `adelay=${pad}|${pad}`, "-b:a", "192k", `out/sound/tmp-pad.mp3`]);
      execFileSync("mv", ["out/sound/tmp-pad.mp3", `public/sfx2/${n}.mp3`]);
      r.dur = duration(`public/sfx2/${n}.mp3`);
    }
    rep.push(`${n} ${r.dur.toFixed(2)} s (gain ${r.gain.toFixed(1)} dB)`);
  }
  // Dérivés, sans crédit.
  if ((!only.size || only.has("robot_boot_rev")) && existsSync("public/sfx2/robot_boot.mp3")) {
    const r = finish("public/sfx2/robot_boot.mp3", "public/sfx2/robot_boot_rev.mp3", { pre: "areverse", trim: 0.8 });
    rep.push(`robot_boot_rev ${r.dur.toFixed(2)} s (inversé)`);
  }
  if ((!only.size || only.has("confetti_cannon_L") || only.has("confetti_cannon_R")) && existsSync("public/sfx2/confetti_cannon.mp3")) {
    let r = finish("public/sfx2/confetti_cannon.mp3", "public/sfx2/confetti_cannon_L.mp3", { pre: "pan=stereo|c0=0.9*c0+0.5*c1|c1=0.3*c1" });
    rep.push(`confetti_cannon_L ${r.dur.toFixed(2)} s (panoramique gauche)`);
    r = finish("public/sfx2/confetti_cannon.mp3", "public/sfx2/confetti_cannon_R.mp3", { pre: "adelay=25|25,pan=stereo|c0=0.3*c0|c1=0.5*c0+0.9*c1" });
    rep.push(`confetti_cannon_R ${r.dur.toFixed(2)} s (panoramique droite)`);
  }
  console.log(rep.join("\n"));
  // Les durées, pour le mix (fin calée, coupe nette) : src/presentation/motion/sfx2-durations.ts
  const names = readdirSync("public/sfx2").filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)).sort();
  const lines = names.map((n) => `  ${n}: ${duration(`public/sfx2/${n}.mp3`).toFixed(3)},`);
  writeFileSync(
    "src/presentation/motion/sfx2-durations.ts",
    `// Écrit par scripts/sfx-elevenlabs.mjs — durées (s) des effets de public/sfx2/. Ne pas modifier à la main.\nexport const SFX2_DURATIONS: Record<string, number> = {\n${lines.join("\n")}\n};\n`,
  );
}

if (!onlyProcess) await generate();
processAll();
