import { Ease, RobotMotion, type Emote, type MotionFace, type ParticleKind, type RobotPose } from "../../../src/core/robot/motion";
import { BURST_MS, burstForMood, pokeReducer, POKE_IDLE, type PokeState, type RobotBurst, type RobotMood } from "../../../src/core/robot/mascot";

/* ==========================================================================
 * LE ROBOT, IMAGE PAR IMAGE.
 *
 * Le site fait vivre le robot avec le moteur `core/robot/motion.ts` (ressorts, gestes, yeux, particules), avancé à
 * chaque rafraîchissement d'écran. Remotion exige un rendu déterministe : on rejoue ici LE MÊME moteur, avec un hasard
 * à graine fixe, à 60 images par seconde, et l'on donne ses entrées (humeur, geste, toucher, survol, regard) à des
 * instants précis. Le résultat — une pose par image — est calculé une fois et gardé en mémoire.
 *
 * Ce que le composant du site ajoute au moteur est refait ici à l'identique (components/robot/robot.tsx) :
 * l'expression affichée (`faceFor`), le geste qui accompagne une humeur (`burstForMood`), la règle des touchers
 * (`pokeReducer` : un toucher → rire, trois rapprochés → tournis).
 * ======================================================================== */

export type RobotCue =
  /** L'humeur durable ; `quiet` : sans le geste d'arrivée (saut, fête). */
  | { at: number; mood: RobotMood; quiet?: boolean }
  /** Un geste d'un instant (saut, fête, coucou, rire, tournis). */
  | { at: number; burst: RobotBurst }
  /** On le touche. */
  | { at: number; poke: true }
  /** Le pointeur survole le robot (ses yeux grandissent). */
  | { at: number; hover: boolean }
  /** Le regard suit le pointeur (−1…1 autour du robot) ; null : plus de pointeur. */
  | { at: number; look: { x: number; y: number } | null }
  /** Une émotion passagère (clin d'œil, surprise…). */
  | { at: number; emote: Emote; duration?: number }
  /** Il penche la tête (radians), le temps `hold`. */
  | { at: number; tilt: number; hold: number };

export type TrackParticle = { kind: ParticleKind; x: number; y: number; age: number; life: number; rot: number; size: number };
export type RobotFrame = {
  pose: Omit<RobotPose, "particles">;
  particles: TrackParticle[];
  /** L'expression affichée (bouches, sourcils, points de réflexion, lampe). */
  face: MotionFace;
  mood: RobotMood;
  /** Le geste en cours et depuis quand (secondes) : confettis de la fête, étincelles du saut. */
  burst: RobotBurst | null;
  burstAge: number;
};

/** Le hasard du moteur, à graine fixe (mulberry32) : le même robot à chaque rendu. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'expression : le geste d'un instant l'emporte sur l'humeur (components/robot/robot.tsx, `faceFor`). */
function faceFor(mood: RobotMood, burst: RobotBurst | null): MotionFace {
  if (burst === "dizzy") return "dizzy";
  if (burst === "giggle" || burst === "jump" || burst === "party" || burst === "wave") return "happy";
  if (mood === "celebrate") return "happy";
  return mood;
}

type Anim = (prop: "tilt", keys: readonly (readonly [number, number, (x: number) => number])[]) => void;

const CACHE = new Map<string, RobotFrame[]>();

/**
 * Les poses du robot, une par image, de 0 à `duration` secondes. `key` nomme la piste (une seule simulation par
 * rendu) : à changer si les entrées changent.
 */
export function robotTrack(key: string, cues: RobotCue[], duration: number, fps = 60, seed = 20261012): RobotFrame[] {
  const known = CACHE.get(key);
  if (known) return known;
  const engine = new RobotMotion({ random: seeded(seed), now: 0 });
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  let next = 0;
  let mood: RobotMood = "idle";
  let burst: { name: RobotBurst; start: number; until: number } | null = null;
  let poke: PokeState = POKE_IDLE;
  let shownFace: MotionFace = "idle";
  const frames: RobotFrame[] = [];
  const N = Math.ceil(duration * fps) + 1;
  for (let i = 0; i < N; i++) {
    const t = i / fps;
    // La fin d'un geste, la fin d'un toucher (le composant les retire après leur durée).
    if (burst && t >= burst.until) burst = null;
    poke = pokeReducer(poke, { type: "tick", now: t * 1000 });
    while (next < sorted.length && sorted[next].at <= t) {
      const cue = sorted[next++];
      if ("mood" in cue) {
        mood = cue.mood;
        const b = cue.quiet ? null : burstForMood(mood);
        if (b) {
          burst = { name: b, start: t, until: t + BURST_MS[b] / 1000 };
          // L'humeur passe au moteur avant le geste (le composant : setFace, puis play).
          const face = faceFor(mood, poke.burst ?? b);
          if (face !== shownFace) engine.setFace((shownFace = face));
          engine.play(b);
        }
      } else if ("burst" in cue) {
        burst = { name: cue.burst, start: t, until: t + BURST_MS[cue.burst] / 1000 };
        engine.play(cue.burst);
      } else if ("poke" in cue) {
        poke = pokeReducer(poke, { type: "poke", now: t * 1000 });
        engine.poke();
      } else if ("hover" in cue) {
        engine.hover(cue.hover);
      } else if ("look" in cue) {
        engine.lookAt(cue.look);
      } else if ("emote" in cue) {
        engine.emote(cue.emote, cue.duration);
      } else if ("tilt" in cue) {
        (engine as unknown as { anim: Anim }).anim("tilt", [
          [cue.tilt, 0.22, Ease.out],
          [cue.tilt, cue.hold, Ease.lin],
          [0, 0.3, Ease.inOut],
        ]);
      }
    }
    const active = poke.burst ?? burst?.name ?? null;
    const face = faceFor(mood, active);
    if (face !== shownFace) engine.setFace((shownFace = face));
    engine.update(1 / fps, t);
    const { particles, ...pose } = engine.pose();
    const pokeStart = poke.burst ? poke.until / 1000 - BURST_MS[poke.burst] / 1000 : 0;
    frames.push({
      pose,
      particles: particles.map((p) => ({ kind: p.kind, x: p.x, y: p.y, age: p.age, life: p.life, rot: p.rot, size: p.size })),
      face,
      mood,
      burst: active,
      burstAge: poke.burst ? t - pokeStart : burst ? t - burst.start : 0,
    });
  }
  CACHE.set(key, frames);
  return frames;
}

/** La pose à l'instant `t` (secondes) d'une piste calculée à `fps`. */
export function frameAt(track: RobotFrame[], t: number, fps = 60): RobotFrame {
  const i = Math.max(0, Math.min(track.length - 1, Math.round(t * fps)));
  return track[i];
}
