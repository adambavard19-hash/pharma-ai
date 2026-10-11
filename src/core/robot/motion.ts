/**
 * Le moteur de mouvement du robot PharmaBoost : ressorts, gestes, expressions des yeux, émotions, particules et petite
 * vie au repos. Module pur (aucun navigateur, aucune horloge réelle : le temps et le hasard sont passés) — le dessin,
 * lui, reste celui de notre robot (components/robot/robot.tsx) ; ce module ne calcule qu'une POSE par image.
 *
 * La logique d'animation est adaptée du moteur de Coucou (windows/src/mochi/engine.ts et core/anim.ts) :
 *   Copyright (c) 2026 Louis Raillé — licence MIT (texte complet dans THIRD_PARTY_NOTICES.md).
 * Seul le CODE est repris (interpolations, ressorts, enchaînements de gestes). Le personnage de Coucou, son nom, ses
 * dessins et ses sons ne le sont pas : notre robot garde son casque, son écran, sa croix et nos sons synthétisés.
 *
 * Unités : celles du dessin (boîte de 100 de large, tête centrée vers (50, 45), base du corps en (50, 84)). Les angles
 * sont en radians. `yaw` / `pitch` (−1…1) disent où la tête regarde : le dessin en déduit le décalage du visage, comme
 * des yeux peints sur une sphère.
 */
import type { RobotBurst, RobotMood } from "./mascot";

// ── Courbes (Ease de Coucou) ─────────────────────────────────────────────────────────────────────────────────────

export type EaseFn = (t: number) => number;

export const Ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => {
    const c1 = 1.7;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  lin: (t: number) => t,
} satisfies Record<string, EaseFn>;

// ── Expressions ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Les formes d'yeux que le dessin sait faire. */
export const EYE_SHAPES = ["pill", "wide", "line", "flat", "happy", "closed", "spiral", "heart", "star", "tired", "wink"] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];

/** L'expression affichée par le dessin (`faceFor` du composant) : humeurs + le tournis. */
export type MotionFace = RobotMood | "dizzy";

/** Les émotions d'un instant : des yeux, un geste, parfois des particules. */
export type Emote = "love" | "surprised" | "proud" | "wink" | "yawn" | "annoyed" | "laugh";

export type ParticleKind = "heart" | "star" | "spark" | "sweat" | "z";

export type Particle = { kind: ParticleKind; x: number; y: number; vx: number; vy: number; gravity: number; age: number; life: number; rot: number; size: number };

type FaceConfig = {
  eye: EyeShape;
  /** Inclinaison de la tête au repos (radians, + = vers la droite). */
  tilt: number;
  /** Où la tête regarde quand l'humeur l'impose (−1…1) ; null : libre (pointeur, coups d'œil). */
  look: readonly [number, number] | null;
  /** Respiration plus ample (sommeil). */
  breathes: boolean;
  /** Des « z » montent. */
  zz: boolean;
  /** La petite vie au repos (coups d'œil, sautillements, clins d'œil, bâillements) est permise. */
  idleLife: boolean;
};

export const FACE_CONFIG: Record<MotionFace, FaceConfig> = {
  idle: { eye: "pill", tilt: 0, look: null, breathes: false, zz: false, idleLife: true },
  curious: { eye: "wide", tilt: 0.16, look: null, breathes: false, zz: false, idleLife: false },
  thinking: { eye: "pill", tilt: 0.07, look: [0.55, -0.6], breathes: false, zz: false, idleLife: false },
  // Une mise en garde : sérieux, posé, tête un peu basse. Jamais de geste festif, jamais de particule.
  concerned: { eye: "flat", tilt: 0, look: [0, 0.3], breathes: false, zz: false, idleLife: false },
  happy: { eye: "happy", tilt: -0.05, look: null, breathes: false, zz: false, idleLife: true },
  celebrate: { eye: "happy", tilt: 0, look: null, breathes: false, zz: false, idleLife: false },
  sleepy: { eye: "closed", tilt: 0.09, look: [0, 0.35], breathes: true, zz: true, idleLife: false },
  dizzy: { eye: "spiral", tilt: 0, look: null, breathes: false, zz: false, idleLife: false },
};

/** Les yeux d'une expression, sans émotion passagère : ce que le serveur dessine avant toute animation. */
export function eyeForFace(face: MotionFace): EyeShape {
  return FACE_CONFIG[face].eye;
}

const EMOTE_EYE: Record<Emote, EyeShape> = { love: "heart", surprised: "wide", proud: "star", wink: "wink", yawn: "tired", annoyed: "line", laugh: "happy" };

/** Les émotions qu'une mise en garde n'autorise jamais (festives ou moqueuses). */
const FESTIVE: ReadonlySet<Emote> = new Set(["love", "proud", "wink", "laugh"]);

// ── La pose : ce que le dessin applique à chaque image ───────────────────────────────────────────────────────────

export type RobotPose = {
  /** Déplacement du corps (unités du dessin). */
  ox: number;
  oy: number;
  /** Étirement / écrasement (1 = repos), autour de la base. */
  sx: number;
  sy: number;
  /** Inclinaison (radians, autour de la base) et roulade (autour de la tête). */
  tilt: number;
  roll: number;
  /** Où regarde la tête (−1…1). */
  yaw: number;
  pitch: number;
  /** Ouverture des paupières (0 fermées… 1 ouvertes) et taille des yeux (1 = normale). */
  open: number;
  eyeScale: number;
  /** Rougeur des joues (0…1). */
  blush: number;
  /** La main du coucou (0 cachée… 1 levée) et son balancement (radians). */
  hand: number;
  handSwing: number;
  eye: EyeShape;
  particles: readonly Particle[];
};

type Prop = "yaw" | "pitch" | "tilt" | "roll" | "open" | "sx" | "sy" | "ox" | "oy" | "es" | "blush" | "hand";
type Key = readonly [target: number, durationS: number, ease: EaseFn];
type Tween = { keys: readonly Key[]; index: number; from: number; start: number; onDone?: () => void };

/** Taille de référence du corps, pour transposer les amplitudes de Coucou (fractions de rayon) en unités du dessin. */
const R = 36;

export type MotionOptions = { random?: () => number; now?: number };

/**
 * Un robot qui bouge. `update(dt, now)` à chaque image, puis `pose()`. Les entrées : `setFace` (l'humeur affichée),
 * `play` (un geste : saut, fête, coucou, rire, tournis), `poke` (on le touche), `hover`, `lookAt` (le pointeur),
 * `emote` (une émotion passagère).
 */
export class RobotMotion {
  private readonly random: () => number;
  private time: number;

  // L'état animé (comme le `s` du moteur de Coucou).
  yaw = 0;
  pitch = 0;
  tilt = 0;
  roll = 0;
  open = 1;
  sx = 1;
  sy = 1;
  ox = 0;
  oy = 0;
  es = 1;
  blush = 0;
  hand = 0;

  private face: MotionFace = "idle";
  private cfg: FaceConfig = FACE_CONFIG.idle;
  private tweens = new Map<Prop, Tween>();
  private particles: Particle[] = [];

  private lookX = 0;
  private lookY = 0;
  private hasPointer = false;
  private hovering = false;
  private glance: { x: number; y: number; until: number } | null = null;

  private eyeOverride: EyeShape | null = null;
  private eyeOverrideUntil = 0;
  private nextBlink: number;
  private nextIdle: number;
  private lastAmbient = 0;
  private danceUntil = 0;
  private danceLevel = 0;
  private waveStart = 0;
  private waveUntil = 0;
  private pokes: number[] = [];

  constructor(options: MotionOptions = {}) {
    this.random = options.random ?? Math.random;
    this.time = options.now ?? 0;
    this.nextBlink = this.time + 1.4 + this.random() * 2;
    this.nextIdle = this.time + 3 + this.random() * 3;
  }

  // ── Entrées ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** L'humeur affichée change : la tête prend sa pose, avec un petit geste d'arrivée. */
  setFace(face: MotionFace): void {
    if (face === this.face) return;
    const previous = this.face;
    this.face = face;
    this.cfg = FACE_CONFIG[face];
    this.eyeOverride = null;
    switch (face) {
      case "curious":
        this.anim("oy", [[-0.12 * R, 0.14, Ease.out], [0, 0.38, Ease.back]]);
        this.anim("es", [[1.2, 0.12, Ease.out], [1.08, 0.5, Ease.inOut]]);
        break;
      case "thinking":
        this.blink();
        break;
      case "concerned":
        // Sérieux : la tête se pose, une seule fois, sans rebond.
        this.anim("oy", [[0.04 * R, 0.25, Ease.out], [0, 0.4, Ease.inOut]]);
        this.particles = [];
        this.danceUntil = 0;
        break;
      case "sleepy":
        this.anim("open", [[0.3, 0.4, Ease.inOut], [0, 0.4, Ease.inOut]]);
        break;
      default:
        if (previous !== "idle" || face !== "idle") this.blink();
    }
  }

  /** Un geste d'un instant (ceux du composant : saut, fête, coucou, rire, tournis). */
  play(burst: RobotBurst): void {
    if (this.face === "concerned" && (burst === "jump" || burst === "party")) return;
    switch (burst) {
      case "jump":
        this.anim("oy", [[-0.3 * R, 0.16, Ease.out], [0.03 * R, 0.2, Ease.inOut], [0, 0.18, Ease.back]]);
        this.anim("sy", [[0.82, 0.08, Ease.out], [1.18, 0.13, Ease.out], [0.9, 0.16, Ease.inOut], [1, 0.2, Ease.back]]);
        this.anim("sx", [[1.15, 0.08, Ease.out], [0.88, 0.13, Ease.out], [1.06, 0.16, Ease.inOut], [1, 0.2, Ease.back]]);
        this.anim("blush", [[0.7, 0.2, Ease.out], [0, 0.7, Ease.inOut]]);
        this.emit("star", 4);
        break;
      case "party":
        this.danceUntil = this.time + 2.6;
        this.doRoll(0.95, 1);
        this.emit("spark", 6);
        this.anim("blush", [[0.8, 0.3, Ease.out], [0.8, 1.6, Ease.lin], [0, 0.4, Ease.inOut]]);
        break;
      case "wave":
        this.greet();
        break;
      case "giggle":
        this.squash();
        this.setEye("happy", 0.55);
        this.anim("tilt", [[-0.12, 0.08, Ease.out], [0.1, 0.12, Ease.inOut], [-0.05, 0.1, Ease.inOut], [0, 0.14, Ease.out]]);
        break;
      case "dizzy":
        this.doRoll(1.3, 2);
        this.setEye("spiral", 1.9);
        this.emit("spark", 3);
        break;
    }
  }

  /**
   * On le touche (règle de Coucou) : il s'écrase et fait la moue ; trois touchers en moins de 1,7 s lui donnent le
   * tournis. Renvoie ce que le composant doit jouer (le son, l'expression).
   */
  poke(): "giggle" | "annoyed" | "dizzy" | null {
    if (this.face === "dizzy" || this.eyeOverride === "spiral") return null;
    this.interruptGreet();
    this.pokes = [...this.pokes.filter((at) => this.time - at < 1.7), this.time];
    this.squash();
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.play("dizzy");
      return "dizzy";
    }
    if (this.pokes.length === 1) {
      // Le premier toucher le fait rire ; le deuxième, de suite, l'agace (il secoue la tête).
      this.setEye("happy", 0.55);
      return "giggle";
    }
    this.emote("annoyed");
    return "annoyed";
  }

  /** Le survol : les yeux grandissent, un clignement de bienvenue. */
  hover(on: boolean): void {
    if (on === this.hovering) return;
    this.hovering = on;
    if (on) this.blink();
  }

  /** Le pointeur, en coordonnées normalisées (−1…1 autour du robot) ; null : plus de pointeur. */
  lookAt(point: { x: number; y: number } | null): void {
    if (!point) {
      this.hasPointer = false;
      return;
    }
    this.hasPointer = true;
    this.lookX = clamp(point.x, -1, 1);
    this.lookY = clamp(point.y, -1, 1);
  }

  /** Une émotion passagère. Une mise en garde n'en laisse passer aucune de festive. */
  emote(emote: Emote, duration = 1.8): void {
    if (this.face === "concerned" && FESTIVE.has(emote)) return;
    this.setEye(EMOTE_EYE[emote], emote === "annoyed" ? 0.8 : duration);
    switch (emote) {
      case "love":
        this.anim("blush", [[1, 0.3, Ease.out], [1, duration - 0.6, Ease.lin], [0, 0.3, Ease.inOut]]);
        this.emit("heart", 4);
        this.anim("oy", [[-0.1 * R, 0.16, Ease.out], [0, 0.3, Ease.back]]);
        break;
      case "surprised":
        this.anim("oy", [[-0.3 * R, 0.14, Ease.out], [0, 0.38, Ease.back]]);
        this.anim("es", [[1.25, 0.12, Ease.out], [1, 0.5, Ease.inOut]]);
        break;
      case "proud":
        this.emit("star", 5);
        this.anim("tilt", [[-0.14, 0.22, Ease.out], [-0.14, duration - 0.5, Ease.lin], [0, 0.28, Ease.inOut]]);
        this.anim("blush", [[0.7, 0.25, Ease.out], [0.7, duration - 0.5, Ease.lin], [0, 0.3, Ease.inOut]]);
        break;
      case "wink":
        this.anim("tilt", [[0.13, 0.1, Ease.out], [0.13, 0.32, Ease.lin], [0, 0.2, Ease.inOut]]);
        break;
      case "yawn":
        this.anim("sy", [[1.12, 0.5, Ease.inOut], [1, 0.5, Ease.inOut]]);
        this.anim("sx", [[0.94, 0.5, Ease.inOut], [1, 0.5, Ease.inOut]]);
        this.emit("z", 2);
        break;
      case "annoyed":
        this.anim("yaw", [[-0.65, 0.05, Ease.out], [0.65, 0.09, Ease.inOut], [-0.5, 0.08, Ease.inOut], [0.4, 0.075, Ease.inOut], [-0.2, 0.07, Ease.inOut], [0, 0.14, Ease.out]]);
        break;
      case "laugh":
        this.anim("blush", [[0.6, 0.2, Ease.out], [0, 0.6, Ease.inOut]]);
        break;
    }
  }

  // ── Le pas de temps ─────────────────────────────────────────────────────────────────────────────────────────

  /** Avance de `dt` secondes ; `now` (secondes) sert aux échéances. */
  update(dt: number, now: number): void {
    this.time = now;
    const step = Math.min(Math.max(dt, 0), 0.1);

    for (const [prop, tween] of [...this.tweens]) {
      let key = tween.keys[tween.index];
      let progress = key[1] <= 0 ? 1 : (now - tween.start) / key[1];
      while (progress >= 1) {
        this[prop] = key[0];
        tween.from = key[0];
        tween.start += key[1];
        tween.index += 1;
        if (tween.index >= tween.keys.length) {
          this.tweens.delete(prop);
          tween.onDone?.();
          break;
        }
        key = tween.keys[tween.index];
        progress = key[1] <= 0 ? 1 : (now - tween.start) / key[1];
      }
      if (this.tweens.get(prop) === tween) this[prop] = tween.from + (key[0] - tween.from) * key[2](clamp(progress, 0, 1));
    }

    // Le regard : imposé par l'humeur, sinon le pointeur, sinon un coup d'œil de temps en temps.
    let targetYaw = 0;
    let targetPitch = 0;
    if (this.hasPointer) {
      targetYaw = this.lookX * 0.62;
      targetPitch = this.lookY * 0.5;
    } else if (this.glance && now < this.glance.until) {
      targetYaw = this.glance.x;
      targetPitch = this.glance.y;
    }
    if (this.cfg.look) {
      targetYaw = targetYaw * 0.35 + this.cfg.look[0] * 0.55;
      targetPitch = targetPitch * 0.3 + this.cfg.look[1] * 0.5;
    }
    if (this.effectiveEye() === "spiral") targetYaw = Math.sin(now * 9) * 0.25;

    let targetTilt = this.cfg.tilt;
    if (now > this.waveStart && now < this.waveUntil) targetTilt = -0.06 + Math.sin(2 * Math.PI * 1.2 * (now - this.waveStart)) * 0.07;

    const breathe = this.cfg.breathes ? 0.035 : 0.012;
    const targetSy = 1 + Math.sin(now * 1.8) * breathe;
    const targetSx = 1 - Math.sin(now * 1.8) * breathe * 0.57;
    const targetEs = this.hovering ? 1.14 : this.face === "curious" ? 1.08 : 1;

    const kGen = 1 - Math.pow(0.0008, step);
    const kLook = 1 - Math.pow(0.0025, step);
    if (!this.tweens.has("yaw")) this.yaw += (targetYaw - this.yaw) * kLook;
    if (!this.tweens.has("pitch")) this.pitch += (targetPitch - this.pitch) * kLook;
    if (!this.tweens.has("tilt")) this.tilt += (targetTilt - this.tilt) * kGen;
    if (!this.tweens.has("sy")) this.sy += (targetSy - this.sy) * kGen;
    if (!this.tweens.has("sx")) this.sx += (targetSx - this.sx) * kGen;
    if (!this.tweens.has("es")) this.es += (targetEs - this.es) * kGen;
    if (!this.tweens.has("oy")) this.oy += (0 - this.oy) * kGen;
    if (!this.tweens.has("open")) this.open += ((this.face === "sleepy" ? 0 : 1) - this.open) * kGen;

    // Clignements : au hasard, parfois deux de suite (pas en dormant ni en tournis).
    if (now > this.nextBlink) {
      if (this.face !== "sleepy" && this.effectiveEye() !== "spiral") {
        this.blink();
        if (this.random() < 0.22) this.nextBlink = now + 0.23;
        else this.nextBlink = now + 2.2 + this.random() * 3.2;
      } else this.nextBlink = now + 2.2 + this.random() * 3.2;
    }

    if (this.eyeOverride && now > this.eyeOverrideUntil) this.eyeOverride = null;

    // La petite vie au repos.
    if (this.cfg.idleLife && now > this.nextIdle) this.idleBehavior(now);

    // Les « z » du sommeil.
    if (now - this.lastAmbient > 1.3) {
      this.lastAmbient = now;
      if (this.cfg.zz) this.emit("z", 1);
    }

    // La danse de la fête : s'installe en 0,3 s, s'en va en 0,5 s.
    const dancing = now < this.danceUntil && this.face !== "concerned";
    this.danceLevel = dancing ? Math.min(1, this.danceLevel + step / 0.3) : Math.max(0, this.danceLevel - step / 0.5);

    for (const particle of this.particles) {
      particle.age += step;
      if (particle.age <= 0) continue;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vy += particle.gravity * step;
    }
    this.particles = this.particles.filter((particle) => particle.age < particle.life);
  }

  /** La pose de l'instant, prête à dessiner. */
  pose(): RobotPose {
    const dance = this.danceLevel > 0.001 ? danceTransform(this.time, this.danceLevel) : null;
    return {
      ox: (dance?.dx ?? 0),
      oy: this.oy + (dance?.dy ?? 0),
      sx: this.sx * (dance?.sx ?? 1),
      sy: this.sy * (dance?.sy ?? 1),
      tilt: this.tilt + (dance?.rotate ?? 0),
      roll: this.roll,
      yaw: clamp(this.yaw, -1, 1),
      pitch: clamp(this.pitch, -1, 1),
      open: clamp(this.open, 0, 1),
      eyeScale: this.es,
      blush: clamp(this.blush, 0, 1),
      hand: clamp(this.hand, 0, 1),
      handSwing: this.time > this.waveStart && this.time < this.waveUntil ? Math.sin(2 * Math.PI * 2.2 * (this.time - this.waveStart)) * 0.5 : 0,
      eye: this.effectiveEye(),
      particles: this.particles,
    };
  }

  // ── Gestes internes ─────────────────────────────────────────────────────────────────────────────────────────

  private effectiveEye(): EyeShape {
    return this.eyeOverride ?? this.cfg.eye;
  }

  private setEye(eye: EyeShape, duration: number): void {
    this.eyeOverride = eye;
    this.eyeOverrideUntil = this.time + duration;
  }

  private blink(): void {
    if (this.tweens.has("open") || this.face === "sleepy") return;
    this.anim("open", [[0.06, 0.07, Ease.inOut], [1, 0.13, Ease.out]]);
  }

  private squash(): void {
    this.anim("sy", [[0.78, 0.07, Ease.out], [1.1, 0.13, Ease.out], [1, 0.17, Ease.inOut]]);
    this.anim("sx", [[1.16, 0.07, Ease.out], [0.95, 0.13, Ease.out], [1, 0.17, Ease.inOut]]);
  }

  private doRoll(duration: number, turns: number): void {
    this.roll = 0;
    this.anim("roll", [[Math.PI * 2 * turns, duration, Ease.inOut]], () => {
      this.roll = 0;
    });
  }

  /** Le coucou (minutage de Coucou) : petit saut, la main se lève et salue, yeux rieurs, deux clignements. */
  private greet(): void {
    const t = this.time;
    this.waveStart = t + 0.45;
    this.waveUntil = t + 1.55;
    this.setEye("happy", 2);
    this.anim("oy", [[-0.06 * R, 0.22, Ease.out], [0, 0.22, Ease.back]]);
    this.anim("hand", [[0, 0.25, Ease.lin], [1, 0.28, Ease.out], [1, 1.02, Ease.lin], [0, 0.2, Ease.inOut]]);
    this.anim("sy", [[1, 0.25, Ease.lin], [0.95, 0.1, Ease.out], [1, 0.26, Ease.back]]);
    this.anim("sx", [[1, 0.25, Ease.lin], [1.04, 0.1, Ease.out], [1, 0.26, Ease.back]]);
  }

  private interruptGreet(): void {
    if (this.hand <= 0.01 && this.time >= this.waveUntil) return;
    this.waveUntil = 0;
    this.waveStart = 0;
    this.anim("hand", [[0, 0.15, Ease.inOut]]);
  }

  /** Un petit comportement de repos, tiré au sort : il ne reste jamais figé. */
  private idleBehavior(now: number): void {
    if (this.tweens.size > 0 || this.hasPointer) {
      this.nextIdle = now + 0.6;
      return;
    }
    const roll = this.random();
    if (roll < 0.34) {
      // Un coup d'œil d'un côté, puis de l'autre.
      const side = this.random() < 0.5 ? -1 : 1;
      this.glance = { x: side * (0.45 + this.random() * 0.35), y: -0.25 + this.random() * 0.5, until: now + 1 + this.random() * 0.8 };
    } else if (roll < 0.5) {
      // Un petit sautillement content.
      this.anim("oy", [[-0.16 * R, 0.14, Ease.out], [0, 0.32, Ease.back]]);
      this.anim("sy", [[0.9, 0.07, Ease.out], [1.08, 0.12, Ease.out], [1, 0.2, Ease.back]]);
      this.anim("sx", [[1.08, 0.07, Ease.out], [0.95, 0.12, Ease.out], [1, 0.2, Ease.back]]);
    } else if (roll < 0.64) {
      this.emote("wink", 0.6);
    } else if (roll < 0.76) {
      // Il s'étire.
      this.anim("sy", [[1.1, 0.35, Ease.inOut], [1.1, 0.25, Ease.lin], [1, 0.4, Ease.back]]);
      this.anim("sx", [[0.94, 0.35, Ease.inOut], [0.94, 0.25, Ease.lin], [1, 0.4, Ease.back]]);
    } else if (roll < 0.86) {
      // Il penche la tête, curieux.
      this.anim("tilt", [[0.16, 0.22, Ease.out], [0.16, 0.7, Ease.lin], [0, 0.3, Ease.inOut]]);
    } else if (roll < 0.94 && this.face === "idle") {
      this.emote("yawn", 1.4);
    } else {
      this.emote(this.face === "happy" ? "love" : "surprised", 1.4);
    }
    this.nextIdle = now + 3.5 + this.random() * 4.5;
  }

  /** Des particules : cœurs et « z » qui montent, étoiles et étincelles qui jaillissent puis retombent. */
  emit(kind: ParticleKind, count: number): void {
    if (this.face === "concerned") return;
    for (let index = 0; index < count; index += 1) {
      const rising = kind === "heart" || kind === "z";
      this.particles.push({
        kind,
        x: 50 + (this.random() - 0.5) * 36 + (kind === "z" ? 22 : 0),
        y: 14 - this.random() * 6,
        vx: rising ? (this.random() - 0.5) * 12 + (kind === "z" ? 6 : 0) : (this.random() - 0.5) * 46,
        vy: rising ? -(16 + this.random() * 12) : -(28 + this.random() * 18),
        gravity: rising ? 0 : 46,
        age: -index * 0.12,
        life: 1.2 + this.random() * 0.5,
        rot: this.random() * Math.PI * 2,
        size: 0.85 + this.random() * 0.4,
      });
    }
    if (this.particles.length > 14) this.particles = this.particles.slice(-14);
  }

  private anim(prop: Prop, keys: readonly Key[], onDone?: () => void): void {
    this.tweens.set(prop, { keys, index: 0, from: this[prop], start: this.time, onDone });
  }
}

/** La danse de la fête (112 battements par minute) : balancement, saut, inclinaison, écrasement à l'atterrissage. */
export function danceTransform(seconds: number, level: number): { dx: number; dy: number; rotate: number; sx: number; sy: number } {
  const beat = (seconds * 112) / 60;
  const hop = Math.abs(Math.sin(Math.PI * beat));
  const land = Math.pow(1 - hop, 6);
  return {
    dx: 0.08 * R * Math.sin(Math.PI * beat) * level,
    dy: -0.2 * R * hop * level,
    rotate: 0.1 * Math.sin(Math.PI * beat) * level,
    sx: 1 + 0.045 * land * level,
    sy: 1 - 0.06 * land * level,
  };
}

/** Le pointeur à (dx, dy) pixels du robot de largeur `width` → regard normalisé (−1…1). */
export function pointerToLook(dx: number, dy: number, width: number): { x: number; y: number } {
  const reach = Math.max(width * 2.2, 160);
  return { x: clamp(dx / reach, -1, 1), y: clamp(dy / reach, -1, 1) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
