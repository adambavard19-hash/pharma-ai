import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { FPS } from "./ease";
import { useClockOffset } from "./clock";

/* ==========================================================================
 * EFFETS SONORES — chaque scène EXPORTE ses repères ; l'ingénieur du son les joue dans motion/sound.tsx.
 *
 *   type Cue = { name: PbSfx; at: number; gain?: number; rate?: number }   at en secondes du FILM
 *   cue("ui_pop", time.A("P6", 1) + .2, .4, 1.2)                             fabrique un repère
 *   every(name, from, to, step, gain?, rate?)                               repère répété (tic tous les 0,5 s)
 *   sfxSrc(name) → staticFile("sfx2/<name>.mp3")   (les 48 effets existent : scripts/sfx-elevenlabs.mjs)
 *   <Cues cues={…} known? />     joue une liste de repères (à poser HORS de toute <Sequence>, ou dans une scène :
 *                                 l'horloge du film corrige le décalage). `known` : ne joue que les noms présents
 *                                 (tant que les fichiers ne sont pas tous générés, un fichier absent ferait échouer le rendu).
 *   <SfxAt at name gain rate />  un seul effet
 *
 * Dans un fichier de scène :
 *   export const cues: SceneCues = (time) => [cue("whoosh_heavy", time.win.S1.start + .52, .7), …];
 *
 * Noms : la liste « sfx » de DIRECTION-PRESENTATION.json (public/sfx2/*.mp3, écrits par scripts/sfx-elevenlabs.mjs).
 * Le mix réel (niveaux, coupes au gel, repli des scènes sans repères) est dans motion/sound.tsx.
 * ======================================================================== */

export const PB_SFX = [
  "neon_flicker_grey",
  "neon_clean_on",
  "whoosh_fast",
  "whoosh_heavy",
  "tick_metronome",
  "gauge_slam",
  "box_drop",
  "counter_roll",
  "queue_murmur",
  "stopwatch_tension",
  "glitch_burst",
  "bubble_pop",
  "door_slide",
  "coin_miss",
  "riser_big",
  "crt_off",
  "awakening_pad",
  "robot_boot",
  "robot_boot_rev",
  "reverse_riser",
  "impact_reveal",
  "impact_clean",
  "sparkle_shimmer",
  "robot_boing",
  "scan_laser",
  "hud_lock",
  "catch_whoomp",
  "data_processing",
  "ui_ding",
  "card_unfold",
  "ui_pop",
  "ui_click",
  "radar_ping",
  "slot_lock",
  "coin_flip",
  "stamp_slam",
  "cash_register",
  "paper_plane",
  "paper_fold",
  "mail_chime",
  "confetti_cannon",
  "confetti_cannon_L",
  "confetti_cannon_R",
  "pixel_dissolve",
  "lock_shield",
  "pen_signature",
  "laser_write",
  "orbit_whoosh",
] as const;

export type PbSfx = (typeof PB_SFX)[number];

export type Cue = { name: PbSfx; at: number; gain?: number; rate?: number };

export const cue = (name: PbSfx, at: number, gain = 1, rate?: number): Cue => ({ name, at, gain, rate });

export function every(name: PbSfx, from: number, to: number, step: number, gain = 1, rate?: number): Cue[] {
  const out: Cue[] = [];
  for (let at = from; at < to - 1e-6; at += step) out.push({ name, at, gain, rate });
  return out;
}

export const sfxSrc = (name: string) => staticFile(`sfx2/${name}.mp3`);

export function SfxAt({ at, name, gain = 1, rate }: { at: number; name: PbSfx; gain?: number; rate?: number }) {
  const offset = useClockOffset();
  const from = Math.round(at * FPS) - offset;
  return (
    <Sequence from={from} layout="none" name={`sfx ${name}`}>
      <Audio src={sfxSrc(name)} volume={gain} playbackRate={rate} />
    </Sequence>
  );
}

export function Cues({ cues, known }: { cues: Cue[]; known?: ReadonlySet<string> }) {
  return (
    <>
      {cues
        .filter((c) => !known || known.has(c.name))
        .map((c, i) => (
          <SfxAt key={`${c.name}-${i}-${c.at.toFixed(3)}`} at={c.at} name={c.name} gain={c.gain} rate={c.rate} />
        ))}
    </>
  );
}
