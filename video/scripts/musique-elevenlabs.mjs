// Les deux musiques du film « Présentation » (ElevenLabs Music), calées sur la timeline mesurée.
//   node scripts/musique-elevenlabs.mjs m1|m2|all
// M1 « Tension » : 0 → arrêt sur image (≈ 12,4 s), coupée net par le mix.
// M2 « Groove → final » : DROP (« Pharma » de P6) → fin du film ; une section par ancrage de la timeline.
// Durées (s) relevées le 15 oct. 2026 avec les voix mesurées : DROP 15,77 · P10 26,97 · P12 33,22 · P13 36,47
// · P15 41,96 · P18 48,73 · fin 56,61.
import { post, credits } from "./eleven.mjs";

const which = process.argv[2] ?? "all";
const NEG = ["vocals", "lyrics", "spoken words", "choir", "humming", "dark", "horror", "lo-fi", "tempo changes", "fade in", "long intro"];

const M1 = {
  positive_global_styles: [
    "instrumental", "120 BPM strict tempo", "A minor", "tense but playful rush-hour motion-graphics cue for a French product film",
    "crisp dry clock tick on every beat", "tight 16th-note closed hi-hats", "muted staccato synth plucks",
    "pulsing low-pass-filtered eighth-note synth bass", "tiny glitch stutters and tape-stop accents", "slightly comedic stress, never dark",
    "clean modern punchy mix, wide stereo, leaves 1-3 kHz open for a male voice-over",
  ],
  negative_global_styles: NEG,
  sections: [
    { section_name: "Rush", positive_local_styles: ["starts instantly on the very first downbeat, no intro", "clock tick on every beat, hats, staccato plucks, filtered pulsing bass", "busy hurried energy"], negative_local_styles: ["silence", "fade in", "pads only"], duration_ms: 5900, lines: [] },
    { section_name: "Stress", positive_local_styles: ["stopwatch-like nervous ticking", "bass filter opens", "glitch stutter and tape-stop accent at the end"], negative_local_styles: ["calm"], duration_ms: 3000, lines: [] },
    { section_name: "Build", positive_local_styles: ["nervous rising arpeggio", "snare roll building", "white-noise riser climbing to a peak", "maximum tension, no resolution"], negative_local_styles: ["resolution", "ending", "fade out"], duration_ms: 4600, lines: [] },
  ],
};

const M2 = {
  positive_global_styles: [
    "instrumental", "premium motion-graphics product launch", "modern electro-pop with future-funk", "120 BPM strict tempo", "C major",
    "punchy four-on-the-floor kick", "tight claps on 2 and 4", "bouncy slap synth bass", "funky muted guitar plucks", "glassy bell arpeggios",
    "polished wide stereo mix", "optimistic, playful, confident", "high-end tech launch film energy", "strong dynamic contrast between sections",
  ],
  negative_global_styles: NEG,
  sections: [
    { section_name: "Drop and groove", positive_local_styles: ["starts at full power on the very first millisecond: massive cinematic impact with sub boom and a bright shimmering major chord stab", "then driving euphoric groove", "ear-candy fills every two bars"], negative_local_styles: ["intro", "build-up", "fade in", "silence at start", "count-in"], duration_ms: 11200, lines: [] },
    { section_name: "Lift", positive_local_styles: ["groove intensifies", "brass stabs", "shaker", "one-beat stop-time break with total silence about 1.5 seconds into the section", "quick drum fill", "ends with half a second of drop-out"], negative_local_styles: ["slow"], duration_ms: 6250, lines: [] },
    { section_name: "Celebration", positive_local_styles: ["first second: a held suspended synth chord alone, no drums", "then a bright brass fanfare hit with cymbal crash", "joyful party energy"], negative_local_styles: ["sad"], duration_ms: 3250, lines: [] },
    { section_name: "Team", positive_local_styles: ["full groove back with layered handclaps and stomps", "uplifting whistle-like synth lead hook", "proud"], negative_local_styles: ["vocals", "whistling human"], duration_ms: 5490, lines: [] },
    { section_name: "Trust", positive_local_styles: ["sudden breakdown: much quieter and sparse", "no kick, no claps, no bass", "only warm soft piano chords and a gentle pad, calm and reassuring", "in the last 1.5 seconds a snare roll and riser rebuild the energy"], negative_local_styles: ["kick drum", "four-on-the-floor", "busy drums", "loud"], duration_ms: 6770, lines: [] },
    { section_name: "Finale", positive_local_styles: ["big final drop on the first downbeat", "full band", "triumphant chord stabs on each beat", "anthemic synth lead", "one big final hit about 3 seconds before the end", "then a long shimmering bell chime tail ringing out to silence"], negative_local_styles: ["abrupt cut", "early ending", "fade before the final hit"], duration_ms: 8380, lines: [] },
  ],
};

const M2_PROMPT = "Instrumental only, no vocals. 41 seconds, 120 BPM strict, C major, modern electro-pop / future-funk for a premium tech product launch film. 0:00 starts instantly (no intro) with a massive cinematic impact with sub boom and a bright major chord stab on the very first downbeat, then a euphoric groove: four-on-the-floor kick, claps on 2 and 4, bouncy slap synth bass, funky muted guitar plucks, glassy bell arpeggios. 0:11 groove intensifies with brass stabs and shaker, a one-beat silent stop at 0:12.7, drum fill, half a second of drop-out at 0:17. 0:17.5 one held suspended chord without drums, then at 0:18.5 a bright brass fanfare hit with cymbal crash. 0:20.7 to 0:26.2 full groove with handclaps, stomps and a whistle-like synth lead. 0:26.2 sudden quiet breakdown: no drums, only warm piano chords and soft pads, calm; snare roll and riser rebuild from 0:31.5. 0:33 big final drop, full band, triumphant stabs on each beat, anthemic lead, one big final hit at 0:38, then a shimmering bell tail ringing to silence at 0:41.";

async function gen(name, plan, out = `public/music/presentation-${name}.mp3`) {
  const len = name === "trust" ? 10000 : name === "finale" ? 12000 : 41500;
  const body = typeof plan === "string" ? { prompt: plan, music_length_ms: len, model_id: "music_v1", force_instrumental: true } : { composition_plan: plan, model_id: "music_v1", respect_sections_durations: true };
  try {
    const n = await post("/v1/music?output_format=mp3_44100_192", body, out);
    console.log(`${name} : ${out} (${n} octets, mp3 192k)`);
  } catch (e) {
    console.warn(`${name} : 192k refusé (${String(e).slice(0, 200)}) — format par défaut`);
    const n = await post("/v1/music", body, out);
    console.log(`${name} : ${out} (${n} octets)`);
  }
}

const before = await credits();
console.log(`avant : ${before.used} / ${before.limit}`);
const jobs = [];
if (which === "m1" || which === "all") jobs.push(gen("m1", M1));
if (which === "m2" || which === "all") jobs.push(gen("m2", M2));
// Pièces du montage de M2 (assemblé par scripts/montage-m2.sh) : la « confiance » calme et le final.
const TRUST = "Instrumental only, no vocals, no drums for the first 6 seconds. 120 BPM, C major. Calm, warm and reassuring breakdown for a premium tech product film: soft felt piano chords C - G - Am - F on each bar, gentle warm pad, a few glassy bell plucks, intimate and confident. From 0:06 a snare roll and a white-noise riser build quickly up to 0:08 and stop abruptly on the peak. Clean modern mix, leaves room for a male voice-over.";
const FINALE = "Instrumental only, no vocals. 120 BPM strict, C major. Triumphant finale of a premium tech launch film, modern electro-pop / future-funk: starts INSTANTLY at full power on the very first downbeat with a big impact and full band (four-on-the-floor kick, claps, slap synth bass, funky guitar, glassy bells), triumphant chord stabs on each beat, anthemic bright synth lead, then at 0:06 one big final orchestral hit with cymbal crash, followed by a long shimmering bell chime tail ringing out to complete silence at 0:11. No intro, no build-up at the start.";
if (which === "pieces") {
  // 2 requêtes simultanées au plus (forfait Starter).
  await Promise.all([gen("trust", TRUST, "out/sound/m2-trust.mp3"), gen("finale", FINALE, "out/sound/m2-finale-a.mp3")]);
  await gen("finale", FINALE, "out/sound/m2-finale-b.mp3");
}
// Candidats (comparés à l'oreille… ou à ffmpeg) : out/sound/m2-plan.mp3 et out/sound/m2-prompt.mp3.
if (which === "m2-candidats") jobs.push(gen("m2", M2, "out/sound/m2-plan.mp3"), gen("m2", M2_PROMPT, "out/sound/m2-prompt.mp3"));
await Promise.all(jobs);
const after = await credits();
console.log(`après : ${after.used} / ${after.limit} (dépensé ${after.used - before.used})`);
