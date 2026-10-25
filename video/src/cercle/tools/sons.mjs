// LES SONS DU FILM « LE CERCLE » (hors voix) :
//  - les bruitages : la bibliothèque du film « Rembobinons » (public/rembobine/sfx, voir src/rembobine/tools/sons.mjs),
//    partagée telle quelle ;
//  - la musique (ElevenLabs Music), montée sur la timeline dans public/cercle/music/musique.wav.
//
//   node src/cercle/tools/sons.mjs              la musique si elle manque, puis le montage
//   node src/cercle/tools/sons.mjs --musique    redemande la musique (coûte des crédits)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TOTAL } from "../timeline.ts";

const MRAW = join("out", "cercle", "raw-music");
const MUSIC_OUT = join("public", "cercle", "music");
for (const d of [MRAW, MUSIC_OUT]) mkdirSync(d, { recursive: true });
const ff = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const key = () => readFileSync(join(homedir(), ".pharmaboost-voix.env"), "utf8").match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m)[1];

const PLAN = {
  positive_global_styles: [
    "instrumental", "modern minimal electronic for an Instagram reel ad", "warm night-city mood", "100 BPM", "E minor to G major",
    "soft deep sub bass", "plucky marimba-like synth", "finger snaps", "airy pads", "confident, intriguing, premium",
    "clean mix that leaves the 1-3 kHz range open for a calm male voice-over",
  ],
  negative_global_styles: ["vocals", "lyrics", "spoken words", "choir", "humming", "aggressive", "dubstep", "long intro", "fade in"],
  sections: [
    { section_name: "Night street", positive_local_styles: ["starts immediately", "mysterious and minimal", "soft pulsing low synth", "a few sparse plucks", "light ticking hi-hat", "curious"], negative_local_styles: ["full drums", "loud"], duration_ms: 10750, lines: [] },
    { section_name: "System", positive_local_styles: ["first beat: a soft warm impact, then a light confident groove", "soft kick, finger snaps, bouncy plucky synth melody", "optimistic, warm, steady", "small lift every 8 bars"], negative_local_styles: ["breakdown", "silence"], duration_ms: 24600, lines: [] },
    { section_name: "Next door", positive_local_styles: ["sudden drop-out: no drums", "lonely sparse piano notes and a cold thin pad", "a bit sad and empty"], negative_local_styles: ["drums", "bass", "happy"], duration_ms: 5650, lines: [] },
    { section_name: "Reveal", positive_local_styles: ["a short riser rebuilding tension, then a big warm impact with a bright major chord at about 2 seconds into the section", "full warm groove returns, uplifting"], negative_local_styles: ["sad"], duration_ms: 6000, lines: [] },
    { section_name: "Final", positive_local_styles: ["warm full groove", "last big warm chord with shimmering bells ringing out to silence"], negative_local_styles: ["abrupt cut"], duration_ms: 5500, lines: [] },
  ],
};
const raw = join(MRAW, "musique.mp3");
if (!existsSync(raw) || process.argv.includes("--musique")) {
  console.log("ElevenLabs Music → musique");
  const r = await fetch("https://api.elevenlabs.io/v1/music", { method: "POST", headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify({ composition_plan: PLAN, model_id: "music_v1", respect_sections_durations: true }) });
  if (!r.ok) throw new Error(`music → ${r.status} ${(await r.text()).slice(0, 300)}`);
  writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
}
// Mesurée le 25 oct. 2026 : le groove arrive vers 9,5 s, un vrai coup de relance tombe vers 43,0 s (la révélation), le
// dernier accord s'éteint de 48 à 52 s. ElevenLabs n'a pas fait le creux « à côté » : de 35,3 à 41,0 s la musique passe
// derrière une porte (passe-bas, −10 dB), comme dans « Rembobinons ».
const k = `if(lt(t,35.3),0,if(lt(t,35.6),(t-35.3)/0.3,if(lt(t,40.85),1,if(lt(t,41.05),(41.05-t)/0.2,0))))`;
ff(
  "-i", raw,
  "-filter_complex",
  `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${TOTAL},atrim=end=${TOTAL},asplit=2[full][f0];` +
    `[f0]lowpass=f=380,lowpass=f=380,volume=-10dB[filt];` +
    `[full]volume='1-(${k})':eval=frame[x];[filt]volume='${k}':eval=frame[y];` +
    `[x][y]amix=inputs=2:normalize=0,afade=t=out:st=${TOTAL - 0.8}:d=0.8,loudnorm=I=-16:TP=-2:LRA=11[m]`,
  "-map", "[m]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", join(MUSIC_OUT, "musique.wav"),
);
console.log("public/cercle/music/musique.wav écrit");
