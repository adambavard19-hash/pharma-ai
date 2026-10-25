// LES SONS DU FILM « REMBOBINONS » (hors voix) :
//  1. les bruitages neufs, demandés à ElevenLabs Sound Effects (seulement ceux qui manquent : out/rembobine/raw-sfx) ;
//  2. la bibliothèque du film : ces bruitages neufs + ceux des films PharmaBoost (public/sfx2, public/sfx) et du Garnier
//     (Mixkit, public/garnier/sfx), renommés et mis à niveau dans public/rembobine/sfx/<nom>.wav ;
//  3. les deux musiques (ElevenLabs Music) : M1 « Tension » (0 → DROP) et M2 « Groove » (DROP → fin), montées en une
//     seule piste public/rembobine/music/musique.wav calée sur la timeline.
//
//   node src/rembobine/tools/sons.mjs            tout ce qui manque, puis la mise à niveau et le montage
//   node src/rembobine/tools/sons.mjs --musique m1|m2   redemande cette musique (coûte des crédits)
//
// Les coups (one-shots) sont ramenés à une crête de −3 dBFS, les ambiances à −23 LUFS : le `gain` des repères a ainsi le
// même sens d'un fichier à l'autre.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DROP, TOTAL, FINAL_HIT } from "../timeline.ts";

const RAW = join("out", "rembobine", "raw-sfx");
const MRAW = join("out", "rembobine", "raw-music");
const SFX_OUT = join("public", "rembobine", "sfx");
const MUSIC_OUT = join("public", "rembobine", "music");
for (const d of [RAW, MRAW, SFX_OUT, MUSIC_OUT]) mkdirSync(d, { recursive: true });
const ff = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

function key() {
  const env = readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8");
  const m = env.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error("ELEVENLABS_API_KEY absente de ~/.pharmaboost-voix.env");
  return m[1];
}
async function post(path, body, out) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { method: "POST", headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 400)}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

// 1. LES BRUITAGES NEUFS — [nom, description, durée (s), influence du texte]
const NEW = [
  ["porte-carillon", "Electronic shop entrance door chime, two-tone ding-dong as a customer walks out of a small pharmacy, clean", 2.0, 0.6],
  ["porte-ferme", "Glass shop door closing with a soft thud and a latch click, interior perspective", 1.2, 0.5],
  ["scanner-bip", "Single short barcode scanner beep at a pharmacy cash desk, crisp high electronic beep, one beep only", 0.5, 0.7],
  ["pharmacie-ambiance", "Quiet French pharmacy interior ambience: soft indistinct murmur of a few customers, distant footsteps, faint plastic bag rustle, a distant till beep, no music, no clear words", 10, 0.4],
  ["coeur", "Single deep cinematic heartbeat, double thump lub-dub, sub bass, dry and close, one heartbeat only", 1.2, 0.6],
  ["disque-raye", "Vinyl record scratch stop, sharp comedic needle scratch then silence", 0.8, 0.7],
  ["arret-image", "Freeze frame sound: camera shutter snap with a short whoosh sucking in and a soft low boom, cinematic", 1.2, 0.5],
  ["vhs-rembobine", "VHS video tape rewinding at high speed inside a VCR: fast mechanical whirring, squeaky tape, warbling high-pitched sped-up audio chatter running backwards, building, then a mechanical clunk stop", 3.0, 0.6],
  ["vhs-lecture", "VHS tape player pressing play: mechanical clunk, motor spin up, short tape hiss", 1.2, 0.5],
  ["bande-ralentit", "Tape stop effect: music slowing down and pitching down to a halt, turntable power off, 1 second", 1.2, 0.6],
  ["sub-boom", "Massive deep sub bass boom drop, cinematic trailer hit, very low, long tail, no high frequencies", 2.5, 0.5],
  ["telephone-vibre", "Smartphone vibrating twice on a wooden table, short buzz buzz", 1.0, 0.6],
  ["notif-douce", "Soft pleasant smartphone notification ping, two gentle bright notes, modern app", 0.8, 0.6],
  ["ticket-imprime", "Small receipt printer printing a short ticket quickly, thermal printer whirr", 1.5, 0.5],
  ["multiplication", "Rapid cascade of many tiny digital pops multiplying and spreading outward, glitchy duplication, swelling", 1.6, 0.4],
  ["carte-ping", "Soft digital map pin drop ping with a tiny water-drop pop, clean UI", 0.5, 0.6],
  ["foule-non-merci", "Many people in different places politely saying no thanks overlapping, murmured, distant, indistinct, layered crowd, no clear words", 3.0, 0.3],
  ["machine-a-sous", "Slot machine style counter rolling up fast with tiny bell dings, ending on a bright ding", 1.5, 0.5],
  ["tampon-vendu", "Heavy rubber stamp slamming on paper with a satisfying thunk and a tiny cash register bell", 0.8, 0.6],
  ["swipe-tel", "Quick smartphone screen swipe, soft glassy swish", 0.5, 0.5],
];

for (const [name, text, dur, infl] of NEW) {
  const out = join(RAW, `${name}.mp3`);
  if (existsSync(out)) continue;
  console.log(`ElevenLabs → ${name}`);
  await post("/v1/sound-generation", { text, duration_seconds: dur, prompt_influence: infl }, out);
}

// 2. LA BIBLIOTHÈQUE — nom du film : [source, type] (type : "one" = coup, "amb" = ambiance)
const LIB = {
  ...Object.fromEntries(NEW.map(([n]) => [n, [join(RAW, `${n}.mp3`), n.includes("ambiance") || n === "foule-non-merci" ? "amb" : "one"]])),
  // films PharmaBoost (ElevenLabs, public/sfx2)
  "scan-laser": ["public/sfx2/scan_laser.mp3", "one"],
  "caisse": ["public/sfx2/cash_register.mp3", "one"],
  "mail": ["public/sfx2/mail_chime.mp3", "one"],
  "compteur": ["public/sfx2/counter_roll.mp3", "one"],
  "glitch": ["public/sfx2/glitch_burst.mp3", "one"],
  "montee-grande": ["public/sfx2/riser_big.mp3", "one"],
  "aspiration": ["public/sfx2/reverse_riser.mp3", "one"],
  "robot-allume": ["public/sfx2/robot_boot.mp3", "one"],
  "robot-boing": ["public/sfx2/robot_boing.mp3", "one"],
  "verrou-hud": ["public/sfx2/hud_lock.mp3", "one"],
  "ui-pop": ["public/sfx2/ui_pop.mp3", "one"],
  "ui-clic": ["public/sfx2/ui_click.mp3", "one"],
  "ui-ding": ["public/sfx2/ui_ding.mp3", "one"],
  "boite-posee": ["public/sfx2/box_drop.mp3", "one"],
  "tampon": ["public/sfx2/stamp_slam.mp3", "one"],
  "tele-off": ["public/sfx2/crt_off.mp3", "one"],
  "impact-revelation": ["public/sfx2/impact_reveal.mp3", "one"],
  "impact-net": ["public/sfx2/impact_clean.mp3", "one"],
  "scintillement": ["public/sfx2/sparkle_shimmer.mp3", "one"],
  "confettis": ["public/sfx2/confetti_cannon.mp3", "one"],
  "piece": ["public/sfx2/coin_flip.mp3", "one"],
  "calcul": ["public/sfx2/data_processing.mp3", "one"],
  "laser-ecrit": ["public/sfx2/laser_write.mp3", "one"],
  "case-verrou": ["public/sfx2/slot_lock.mp3", "one"],
  "avion-papier": ["public/sfx2/paper_plane.mp3", "one"],
  "radar": ["public/sfx2/radar_ping.mp3", "one"],
  "pixels": ["public/sfx2/pixel_dissolve.mp3", "one"],
  "jauge": ["public/sfx2/gauge_slam.mp3", "one"],
  "orbite": ["public/sfx2/orbit_whoosh.mp3", "one"],
  "chrono": ["public/sfx2/stopwatch_tension.mp3", "one"],
  "neon": ["public/sfx2/neon_clean_on.mp3", "one"],
  "carte-depliee": ["public/sfx2/card_unfold.mp3", "one"],
  "whoosh-pb": ["public/sfx2/whoosh_fast.mp3", "one"],
  "whoosh-lourd": ["public/sfx2/whoosh_heavy.mp3", "one"],
  "bulle": ["public/sfx2/bubble_pop.mp3", "one"],
  "attrape": ["public/sfx2/catch_whoomp.mp3", "one"],
  "tic-sec": ["public/sfx2/tick_metronome.mp3", "one"],
  // films PharmaBoost (synthèse, public/sfx)
  "touche": ["public/sfx/touche1.wav", "one"],
  "clic": ["public/sfx/clic.wav", "one"],
  // Mixkit (licence Sound Effects Free, public/garnier/sfx)
  "whoosh-cine": ["public/garnier/sfx/whoosh-cine.wav", "one"],
  "whoosh-rapide": ["public/garnier/sfx/whoosh-rapide.wav", "one"],
  "balayage-court": ["public/garnier/sfx/balayage-court.wav", "one"],
  "balayage-mini": ["public/garnier/sfx/balayage-mini.wav", "one"],
  "swoosh": ["public/garnier/sfx/swoosh-rapide.wav", "one"],
  "air-woosh": ["public/garnier/sfx/air-woosh.wav", "one"],
  "paillettes": ["public/garnier/sfx/paillettes-whoosh.wav", "one"],
  "impact-film": ["public/garnier/sfx/impact-film.wav", "one"],
  "impact-epique": ["public/garnier/sfx/impact-epique.wav", "one"],
  "whoosh-impact": ["public/garnier/sfx/whoosh-impact.wav", "one"],
  "pop-long": ["public/garnier/sfx/pop-long.wav", "one"],
  "pop-sec": ["public/garnier/sfx/pop-sec.wav", "one"],
  "pop-leger": ["public/garnier/sfx/pop-leger.wav", "one"],
  "declencheur": ["public/garnier/sfx/declencheur.wav", "one"],
  "cloche-reussite": ["public/garnier/sfx/cloche-reussite.wav", "one"],
  "etincelle": ["public/garnier/sfx/etincelle.wav", "one"],
  "etincelle-magique": ["public/garnier/sfx/etincelle-magique.wav", "one"],
  "applaudissements": ["public/garnier/sfx/applaudissements.wav", "one"],
  "acclamation": ["public/garnier/sfx/acclamation.wav", "one"],
  "papier": ["public/garnier/sfx/papier.wav", "one"],
  "tic": ["public/garnier/sfx/tic.wav", "one"],
  "molette": ["public/garnier/sfx/molette-horloge.wav", "one"],
  "montee": ["public/garnier/sfx/montee.wav", "one"],
  "montee-inverse": ["public/garnier/sfx/montee-inverse.wav", "one"],
  "canon-confettis": ["public/garnier/sfx/canon-confettis.wav", "one"],
};

function trimLead(src) {
  // Retire le silence de tête (−45 dB), sans toucher à la queue.
  return `silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.005`;
}
function peakGain(file, pre) {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${pre},volumedetect`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return -3 - Number(err.match(/max_volume:\s+(-?[\d.]+) dB/)[1]);
}
const durations = {};
for (const [name, [src, kind]] of Object.entries(LIB)) {
  const out = join(SFX_OUT, `${name}.wav`);
  if (!existsSync(src)) throw new Error(`Source absente : ${src}`);
  if (kind === "amb") {
    ff("-i", src, "-af", "loudnorm=I=-23:TP=-3:LRA=11,afade=t=in:d=0.4", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out);
  } else {
    const pre = trimLead(src);
    const g = peakGain(src, pre);
    ff("-i", src, "-af", `${pre},volume=${g.toFixed(2)}dB`, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out);
  }
  durations[name] = +Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" })).toFixed(3);
}
writeFileSync(join("src", "rembobine", "kit", "sfx-durees.json"), `${JSON.stringify(durations, null, 1)}\n`);
console.log(`${Object.keys(LIB).length} bruitages dans ${SFX_OUT} (durées : src/rembobine/kit/sfx-durees.json)`);

// 3. LES MUSIQUES
const NEG = ["vocals", "lyrics", "spoken words", "choir", "humming", "lo-fi", "tempo changes", "fade in", "long intro"];
const M1 = {
  positive_global_styles: [
    "instrumental", "cinematic tension score for a French TV commercial", "120 BPM strict tempo", "D minor", "minimal and modern",
    "clean wide mix that leaves the 1-3 kHz range open for dialogue and a male voice-over",
  ],
  negative_global_styles: [...NEG, "happy", "upbeat groove", "four-on-the-floor"],
  sections: [
    { section_name: "Routine", positive_local_styles: ["almost silent", "a very soft muted clock tick on each beat", "faint warm room tone pad", "mundane, everyday"], negative_local_styles: ["drums", "bass", "melody", "loud"], duration_ms: 5600, lines: [] },
    { section_name: "Shock", positive_local_styles: ["starts with one deep sub-bass hit", "slow heavy heartbeat-like low pulse", "dark sustained low strings", "sparse high piano notes, unsettling", "tense and serious"], negative_local_styles: ["groove", "melody", "fast drums"], duration_ms: 7000, lines: [] },
    { section_name: "Everywhere", positive_local_styles: ["tension grows", "ticking hi-hat sixteenths", "pulsing eighth-note synth bass", "staccato string ostinato", "building"], negative_local_styles: ["resolution", "calm"], duration_ms: 3700, lines: [] },
    { section_name: "Build", positive_local_styles: ["snare roll accelerating", "huge white-noise riser climbing", "maximum tension, no resolution", "stops dead at the very end"], negative_local_styles: ["ending", "fade out", "resolution"], duration_ms: 3000, lines: [] },
  ],
};
const M2 = {
  positive_global_styles: [
    "instrumental", "premium tech product launch film", "modern energetic electro-pop with future-funk", "120 BPM strict tempo", "F major",
    "punchy four-on-the-floor kick", "tight claps on 2 and 4", "bouncy synth bass", "funky muted guitar", "glassy bell arpeggios",
    "optimistic, bright, confident, uplifting", "polished wide stereo mix that leaves room for a male voice-over", "strong contrast between sections",
  ],
  negative_global_styles: NEG,
  sections: [
    { section_name: "Drop", positive_local_styles: ["starts at full power on the very first millisecond with a massive cinematic impact, sub boom and a bright major chord stab", "then a driving euphoric groove", "ear-candy fills every two bars"], negative_local_styles: ["intro", "build-up", "fade in", "silence at start"], duration_ms: 15300, lines: [] },
    { section_name: "Dialogue", positive_local_styles: ["sudden drop-out: no kick, no bass", "only soft muted guitar plucks and light shaker, very quiet, leaving space for dialogue", "a little suspense"], negative_local_styles: ["loud", "kick drum", "busy"], duration_ms: 4800, lines: [] },
    { section_name: "Sold", positive_local_styles: ["first beat: bright brass fanfare hit with cymbal crash and handclaps", "full joyful groove back", "celebration"], negative_local_styles: ["sad", "quiet"], duration_ms: 4700, lines: [] },
    { section_name: "Winners", positive_local_styles: ["driving full groove", "new synth lead hook", "layered handclaps", "energy rising every 4 bars", "short drum fill at the end"], negative_local_styles: ["breakdown", "silence"], duration_ms: 20700, lines: [] },
    { section_name: "Finale", positive_local_styles: ["big final drop on the first beat, full band, anthemic synth lead, triumphant chord stabs", "in the last 2 seconds the drums stop and only a held bright suspended chord remains, waiting"], negative_local_styles: ["abrupt cut"], duration_ms: 6500, lines: [] },
    { section_name: "Final hit", positive_local_styles: ["one huge final orchestral and synth hit with cymbal crash on the very first beat", "then a long shimmering bell and pad tail ringing out to silence"], negative_local_styles: ["drums after the hit", "groove", "melody after the hit"], duration_ms: 3000, lines: [] },
  ],
};
const musicArg = process.argv.includes("--musique") ? process.argv[process.argv.indexOf("--musique") + 1] : null;
for (const [name, plan] of [["m1", M1], ["m2", M2]]) {
  const out = join(MRAW, `${name}.mp3`);
  if (existsSync(out) && musicArg !== name) continue;
  console.log(`ElevenLabs Music → ${name}`);
  await post("/v1/music", { composition_plan: plan, model_id: "music_v1", respect_sections_durations: true }, out);
}

// Le montage, mesuré le 25 oct. 2026 (ElevenLabs n'a pas tenu les sections demandées : on monte à la main) :
//  - M1 « Tension » de 0 à DROP : sa montée s'arrête net vers 16,5 s, « Alors… rembobinons. » tombe dans le silence ;
//  - M2 « Groove » : 120 BPM, temps forts du morceau à x,05 s ; son premier grand coup (4,05 s du morceau) tombe à DROP.
//    Il joue de 4,05 à 30,05 (film 20 → 46), puis on reprend à 28,05 (une mesure répétée) jusqu'à la fin du morceau :
//    le groove s'arrête à 70,0 s du film, sa queue s'éteint sous « Il vous fallait autre chose ? », et l'accord final
//    (bruitages de la scène S13) claque à FINAL_HIT ;
//  - de 35 à 40 s (le dialogue « je vous conseille un probiotique » / « je veux bien ») : la musique passe derrière une
//    porte (filtre passe-bas, −9 dB), et revient d'un coup à 40,0 s, sur « VENDU ».
// Le tout ramené vers −16 LUFS ; le film baisse encore la musique sous la voix (Film.tsx).
const m1 = join(MRAW, "m1.mp3");
const m2 = join(MRAW, "m2.mp3");
const M2_DOWNBEAT = 4.05;
const SPLICE_FILM = 46;
const back = (a, b) => `between(t,${a},${b})`;
// k(t) : 0 = musique pleine, 1 = derrière la porte. Rampe de 0,3 s à l'entrée, coupure franche (40 ms) à la sortie.
const k = `if(lt(t,34.7),0,if(lt(t,35),(t-34.7)/0.3,if(lt(t,39.96),1,if(lt(t,40),(40-t)/0.04,0))))`;
ff(
  "-i", m1, "-i", m2, "-i", m2,
  "-filter_complex",
  `[0:a]atrim=end=${DROP - 0.9},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${DROP}[a];` +
    `[1:a]atrim=start=${M2_DOWNBEAT}:end=${M2_DOWNBEAT + (SPLICE_FILM - DROP) + 0.02},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[b1];` +
    `[2:a]atrim=start=${M2_DOWNBEAT + (SPLICE_FILM - DROP) - 2}:end=55,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[b2];` +
    `[b1][b2]acrossfade=d=0.02:c1=tri:c2=tri[b];` +
    `[a][b]concat=n=2:v=0:a=1,apad=whole_dur=${TOTAL},atrim=end=${TOTAL},asplit=2[full][f0];` +
    `[f0]lowpass=f=420,lowpass=f=420,volume=-9dB[filt];` +
    `[full]volume='1-(${k})':eval=frame[x];[filt]volume='${k}':eval=frame[y];` +
    `[x][y]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-2:LRA=11[m]`,
  "-map", "[m]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", join(MUSIC_OUT, "musique.wav"),
);
console.log(`musique.wav : M1 0 → ${DROP - 0.9} s ; M2 (coup à ${M2_DOWNBEAT} s du morceau) à ${DROP} s, mesure répétée à ${SPLICE_FILM} s, groove jusqu'à 70 s ; porte 35 → 40 s ; accord final (bruitages) à ${FINAL_HIT} s`);
