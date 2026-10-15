import { useId, type CSSProperties, type ReactNode } from "react";
import { Easing } from "remotion";
import { BANNER } from "../../../agent/src/banner-design";
import { BURST_MS, burstForMood, type RobotBurst, type RobotMood } from "../../../src/core/robot/mascot";
import { RobotMotion, type Emote, type MotionFace, type Particle, type ParticleKind, type RobotPose } from "../../../src/core/robot/motion";
import { robotLook } from "../../../src/core/robot/counter-look";
import { FaceAccessory, HeadAccessory } from "../../../src/components/robot/accessories";

/* ==========================================================================
 * LE ROBOT DE PHARMABOOST, POUR LA VIDÉO.
 *
 * Le dessin est celui du site (src/components/robot/robot.tsx, lignes du SVG
 * reprises telles quelles) ; le mouvement vient du VRAI moteur du site
 * (src/core/robot/motion.ts), avancé image par image. Le composant du site
 * ne peut pas être importé (« use client », requestAnimationFrame, CSS animé) :
 * ici, tout est une fonction du temps, donc identique à chaque rendu.
 *
 *  - une « piste » = un robot et ce qui lui arrive (humeurs, gestes, survol,
 *    coups d'œil), à des instants précis du film ;
 *  - la piste est jouée une fois par le moteur à 60 images/s (hasard à graine
 *    fixe), et chaque image du film lit la pose calculée ;
 *  - les petites vies du repos tirées au sort par le moteur sont coupées : le
 *    film les place lui-même (coups d'œil, clignements), au bon moment.
 *
 * Les animations CSS du site (lampe qui respire, étoile qui scintille, points
 * de réflexion, confettis de la fête, flottement) sont recalculées ici avec
 * leurs durées et leurs courbes.
 * ======================================================================== */

const K = BANNER.colors;
/** La lampe inquiète (robot-css.ts) : l'ambre des pastilles « challenge ». */
const LAMP_CONCERNED = K.challengeIcon;

export type TrackEvent =
  | { t: number; kind: "mood"; mood: RobotMood }
  | { t: number; kind: "burst"; burst: RobotBurst }
  | { t: number; kind: "hover"; on: boolean }
  | { t: number; kind: "glance"; x: number; y: number; dur: number }
  | { t: number; kind: "emote"; emote: Emote; dur?: number }
  | { t: number; kind: "emit"; particle: ParticleKind; count: number }
  | { t: number; kind: "blink" }
  | { t: number; kind: "squash" };

export type Track = { id: string; seed: number; events: TrackEvent[]; until: number };

export type TrackFrame = { pose: RobotPose; face: MotionFace; mood: RobotMood; burst: RobotBurst | null; burstAt: number };

const FPS = 60;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'expression : le geste d'un instant l'emporte sur l'humeur (repris de faceFor, components/robot/robot.tsx). */
function faceFor(mood: RobotMood, burst: RobotBurst | null): MotionFace {
  if (burst === "dizzy") return "dizzy";
  if (burst === "giggle" || burst === "jump" || burst === "party" || burst === "wave") return "happy";
  if (mood === "celebrate") return "happy";
  return mood;
}

/** Accès aux gestes internes du moteur (clignement, écrasement, coup d'œil), et coupure de la vie au repos tirée au sort. */
type EngineInternals = { nextIdle: number; glance: { x: number; y: number; until: number } | null; blink: () => void; squash: () => void };

const CACHE = new Map<string, TrackFrame[]>();

/** Joue la piste dans le moteur, de 0 à `until` secondes, et garde une pose par image. */
export function simulate(track: Track): TrackFrame[] {
  const known = CACHE.get(track.id);
  if (known) return known;
  const engine = new RobotMotion({ random: mulberry32(track.seed), now: 0 });
  const inner = engine as unknown as EngineInternals;
  inner.nextIdle = Number.POSITIVE_INFINITY;
  const events = [...track.events].sort((a, b) => a.t - b.t);
  let next = 0;
  let mood: RobotMood = "idle";
  let burst: { name: RobotBurst; at: number; until: number } | null = null;
  let face: MotionFace = "idle";
  const frames: TrackFrame[] = [];
  const total = Math.ceil(track.until * FPS) + 1;
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    let started: RobotBurst | null = null;
    while (next < events.length && events[next].t <= t) {
      const e = events[next++];
      switch (e.kind) {
        case "mood":
          if (e.mood !== mood) {
            mood = e.mood;
            const b = burstForMood(mood);
            if (b) {
              burst = { name: b, at: t, until: t + BURST_MS[b] / 1000 };
              started = b;
            }
          }
          break;
        case "burst":
          burst = { name: e.burst, at: t, until: t + BURST_MS[e.burst] / 1000 };
          started = e.burst;
          break;
        case "hover":
          engine.hover(e.on);
          break;
        case "glance":
          inner.glance = { x: e.x, y: e.y, until: t + e.dur };
          break;
        case "emote":
          engine.emote(e.emote, e.dur);
          break;
        case "emit":
          engine.emit(e.particle, e.count);
          break;
        case "blink":
          inner.blink();
          break;
        case "squash":
          inner.squash();
          break;
      }
    }
    if (burst && t >= burst.until) burst = null;
    const nextFace = faceFor(mood, burst?.name ?? null);
    if (nextFace !== face) {
      face = nextFace;
      engine.setFace(face);
    }
    if (started) engine.play(started);
    engine.update(i === 0 ? 0 : 1 / FPS, t);
    const pose = engine.pose();
    frames.push({ pose: { ...pose, particles: pose.particles.map((p) => ({ ...p })) }, face, mood, burst: burst?.name ?? null, burstAt: burst?.at ?? -1 });
  }
  CACHE.set(track.id, frames);
  return frames;
}

// ---- Les animations CSS du site, en fonction du temps --------------------------------------------------------

const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * 2 * x);
/** Une boucle 0 → 1 → 0 sur `period` secondes (ease-in-out), démarrant à `delay`. */
const loop = (t: number, period: number, delay = 0) => sine((((t - delay) % period) + period) % period / period);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const CONFETTI_EASE = Easing.bezier(0.2, 0.7, 0.3, 1);

/** Les confettis de la fête (robot.tsx) : position d'arrivée, couleur, forme. */
const CONFETTI: { x: number; y: number; color: string; round: boolean }[] = [
  { x: 6, y: 18, color: "#FFD65A", round: false },
  { x: 20, y: 4, color: K.eye, round: true },
  { x: 36, y: -6, color: K.accent, round: false },
  { x: 64, y: -6, color: "#FF9F7A", round: true },
  { x: 80, y: 4, color: "#FFD65A", round: true },
  { x: 95, y: 18, color: K.accent, round: false },
  { x: 2, y: 44, color: "#FF9F7A", round: false },
  { x: 98, y: 44, color: K.eye, round: true },
];

const PARTICLE_SHAPES: Record<ParticleKind, { d: string; fill: string; stroke?: string }> = {
  heart: { d: "M 0 1.7 C -2.7 -0.2 -2.3 -2.5 -0.95 -2.5 C -0.35 -2.5 0 -2 0 -1.65 C 0 -2 0.35 -2.5 0.95 -2.5 C 2.3 -2.5 2.7 -0.2 0 1.7 Z", fill: "#FF5C7A" },
  star: { d: "M 0 -2.4 L 0.7 -0.8 L 2.3 -0.75 L 1.1 0.35 L 1.45 2 L 0 1.1 L -1.45 2 L -1.1 0.35 L -2.3 -0.75 L -0.7 -0.8 Z", fill: "#FFC83D" },
  spark: { d: "M 0 -2.5 L 0.55 -0.55 L 2.5 0 L 0.55 0.55 L 0 2.5 L -0.55 0.55 L -2.5 0 L -0.55 -0.55 Z", fill: "#FFD65A" },
  sweat: { d: "M 0 -2.1 Q 1.7 0.4 0 1.3 Q -1.7 0.4 0 -2.1 Z", fill: "#7CC7FF" },
  z: { d: "M -1.3 -1.3 H 1.3 L -1.3 1.3 H 1.3", fill: "none", stroke: K.shellEdge },
};

const deg = (r: number) => (r * 180) / Math.PI;

type MouthKey = "idle" | "happy" | "o" | "flat" | "worry" | "sleep" | "wave";

function mouthFor(face: MotionFace, eye: string): MouthKey | null {
  if (eye === "line") return "flat";
  if (eye === "heart" || eye === "star") return "happy";
  if (eye === "tired") return "o";
  if (eye === "spiral") return "wave";
  switch (face) {
    case "idle":
      return "idle";
    case "curious":
      return "o";
    case "thinking":
      return "flat";
    case "concerned":
      return "worry";
    case "happy":
    case "celebrate":
      return "happy";
    case "sleepy":
      return "sleep";
    case "dizzy":
      return "wave";
  }
}

export type MascotProps = {
  track: Track;
  /** Le temps du film, en secondes. */
  t: number;
  /** Largeur en pixels (la hauteur suit, comme sur le site). */
  size: number;
  /** Le robot d'un comptoir (0 à 19) ; sans valeur : le robot de la marque. */
  look?: number | null;
  /** Flotte dans le vide, avec son ombre (accueil mobile, carte de fin). */
  floating?: boolean;
  style?: CSSProperties;
};

/** Le robot : la pose de l'image courante, dessinée comme sur le site. */
export function Mascot({ track, t, size, look: lookIndex, floating = false, style }: MascotProps) {
  const rawId = useId();
  const uid = `pm${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const frames = simulate(track);
  const i = Math.max(0, Math.min(frames.length - 1, Math.round(t * FPS)));
  const { pose, face, burst, burstAt } = frames[i];
  const look = typeof lookIndex === "number" ? robotLook(lookIndex) : null;
  const earTop = look ? look.palette.ear : K.ear;
  const earBottom = look ? look.palette.earDark : "#12968C";
  const lamp = face === "concerned" ? LAMP_CONCERNED : look ? look.palette.lamp : K.eye;
  // En petit (capsule de l'île), la tête seule ; dès 48 px, le pharmacien en blouse — comme sur le site.
  const bust = size >= 48;
  const eye = pose.eye;
  const mouth = mouthFor(face, eye);
  const ink = { fill: "none", stroke: K.eye, strokeLinecap: "round" as const };
  const pair = (render: (cx: number) => ReactNode) => [38, 62].map((cx) => <g key={cx}>{render(cx)}</g>);
  const since = t - burstAt;

  // La lampe qui respire : 2,2 s ; vite en réfléchissant (0,95 s) ; lente devant une mise en garde (3 s).
  const glowPeriod = face === "thinking" ? 0.95 : face === "concerned" ? 3 : 2.2;
  const g = loop(t, glowPeriod);
  const glowOpacity = face === "sleepy" ? 0.08 : face === "thinking" ? 0.2 + 0.65 * g : 0.16 + 0.39 * g;
  const glowScale = face === "sleepy" ? 1 : face === "thinking" ? 0.8 + 0.65 * g : 0.8 + 0.4 * g;
  // L'étoile qui scintille (1,8 s ; 0,9 s de joie), absente quand il réfléchit, s'inquiète ou dort.
  const sparkOn = !(face === "thinking" || face === "concerned" || face === "sleepy" || face === "dizzy");
  const s = loop(t, face === "happy" ? 0.9 : 1.8);
  // Le flottement (3,6 s) et son ombre.
  const fl = floating ? loop(t, 3.6) : 0;
  const floatT = floating ? `translate(0 ${-7 * fl}) rotate(${-3 + 6 * fl} 50 80)` : undefined;

  const eyeShown = (name: string) => (eye === name ? "inline" : "none");
  const m = (k: MouthKey) => (mouth === k ? "inline" : "none");

  return (
    <span style={{ display: "inline-block", position: "relative", lineHeight: 0, width: size, height: Math.round(size * (floating ? 1.22 : 0.92)), flexShrink: 0, ...style }}>
      <svg viewBox={floating ? "0 -4 100 122" : "0 -4 100 92"} style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}>
        <defs>
          <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D9E4E9" /></linearGradient>
          <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#13232B" /><stop offset="1" stopColor="#060D11" /></linearGradient>
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id={`${uid}-ear`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={earTop} /><stop offset="1" stopColor={earBottom} /></linearGradient>
          <linearGradient id={`${uid}-badge`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.accent} /><stop offset="1" stopColor={K.accentDark} /></linearGradient>
        </defs>
        {floating && <ellipse cx={50} cy={110} rx={26} ry={4.5} fill={K.screenBottom} opacity={0.32 - 0.16 * fl} transform={`translate(50 110) scale(${1 - 0.32 * fl} 1) translate(-50 -110)`} />}
        <g transform={floatT}>
          <g transform={`translate(${pose.ox.toFixed(2)} ${pose.oy.toFixed(2)}) rotate(${deg(pose.tilt).toFixed(2)} 50 84) rotate(${deg(pose.roll).toFixed(2)} 50 46) translate(50 84) scale(${pose.sx.toFixed(3)} ${pose.sy.toFixed(3)}) translate(-50 -84)`}>
            {/* Le pharmacien en blouse (comme le site, src/components/robot/robot.tsx) : épaules, chemise, stylo, tablette. */}
            {bust && (
              <g>
                <rect x={44} y={44} width={12} height={10} rx={3} fill={K.screenTop} />
                <path d="M 13 88 C 13 67 23 55 40 52 L 60 52 C 77 55 87 67 87 88 Z" fill={`url(#${uid}-shell)`} stroke={K.shellEdge} strokeWidth={1.4} strokeLinejoin="round" />
                <path d="M 40 52 L 50 69 L 60 52 Z" fill={earTop} />
                <path d="M 40 52 L 50 69 L 43.5 75 L 35 56 Z M 60 52 L 50 69 L 56.5 75 L 65 56 Z" fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.2} strokeLinejoin="round" />
                <path d="M 50 69 L 50 88" stroke={K.shellEdge} strokeWidth={1.2} />
                <rect x={60} y={73} width={13} height={10} rx={2} fill="none" stroke={K.shellEdge} strokeWidth={1.2} />
                <rect x={64} y={66} width={2.6} height={10} rx={1.2} fill="#8C9AA4" />
                <rect x={63.6} y={67.5} width={3.4} height={3} rx={0.8} fill={earBottom} />
                <g transform="rotate(-8 28 76)">
                  <rect x={16} y={63} width={24} height={27} rx={3.5} fill="#16242C" stroke="#0B1418" strokeWidth={1} />
                  <rect x={18.5} y={65.5} width={19} height={4} rx={2} fill="#ffffff" fillOpacity={0.08} />
                </g>
                <ellipse cx={39} cy={79} rx={4} ry={5.4} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.2} />
              </g>
            )}
            {/* La main du coucou : le bras droit se lève, l'index en l'air. */}
            <g style={{ opacity: pose.hand, transform: `translateY(${((1 - pose.hand) * 6).toFixed(2)}px) rotate(${deg(pose.handSwing).toFixed(2)}deg)`, transformBox: "fill-box", transformOrigin: "20% 90%" }}>
              {bust ? (
                <>
                  <rect x={84} y={42} width={9} height={26} rx={4.5} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.2} />
                  <rect x={88} y={25} width={3.4} height={10} rx={1.7} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.1} />
                  <circle cx={89} cy={38} r={6} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.2} />
                </>
              ) : (
                <>
                  <rect x={95} y={33} width={5} height={18} rx={2.5} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1} />
                  <circle cx={99} cy={29} r={6} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.4} />
                </>
              )}
            </g>
            <g transform={bust ? "translate(10 -9) scale(0.8)" : undefined}>
            {/* Les écouteurs : un anneau lumineux qui respire (la lampe d'avant). */}
            {[10, 90].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={45} r={10} fill={lamp} opacity={glowOpacity} transform={`translate(${cx} 45) scale(${glowScale.toFixed(3)}) translate(${-cx} -45)`} />
                <circle cx={cx} cy={45} r={11} fill={`url(#${uid}-shell)`} stroke={K.shellEdge} strokeWidth={1.6} />
                <circle cx={cx} cy={45} r={7} fill={lamp} opacity={face === "sleepy" ? 0.45 : 1} />
                <circle cx={cx} cy={45} r={4.4} fill={K.screenTop} />
              </g>
            ))}
            <rect x={12} y={13} width={76} height={63} rx={29} fill={`url(#${uid}-shell)`} stroke={K.shellEdge} strokeWidth={1.6} />
            <path d="M 26 20 Q 50 11 74 20" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.9} />
            <g transform={`translate(${(pose.yaw * 2.2).toFixed(2)} ${(pose.pitch * 1.4).toFixed(2)})`}>
              <rect x={20} y={24} width={60} height={42} rx={19} fill={`url(#${uid}-screen)`} />
              <path d="M 27 33 Q 30 27 38 26.5" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" strokeOpacity={0.16} />
            </g>
            {look && <HeadAccessory look={look} />}

            <g transform={`translate(${(pose.yaw * 5).toFixed(2)} ${(pose.pitch * 3.6).toFixed(2)})`} filter={`url(#${uid}-glow)`}>
              <g fill="#FF8FA3" opacity={pose.blush * 0.6}>
                <ellipse cx={29.5} cy={52} rx={4.2} ry={2.4} />
                <ellipse cx={70.5} cy={52} rx={4.2} ry={2.4} />
              </g>
              {face === "concerned" && <path d="M 32.5 34.6 L 42.5 32.2 M 57.5 32.2 L 67.5 34.6" stroke={K.eye} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
              <g style={{ transformBox: "fill-box", transformOrigin: "center", transform: `scale(${(pose.eyeScale * (1 - 0.18 * Math.abs(pose.yaw))).toFixed(3)}, ${(pose.eyeScale * (1 - 0.1 * Math.abs(pose.pitch))).toFixed(3)})` }}>
                <g style={{ transformBox: "fill-box", transformOrigin: "center", transform: `scaleY(${Math.max(0.06, pose.open).toFixed(3)})` }}>
                  <g display={eyeShown("pill")}>
                    {pair((cx) => (
                      <>
                        <ellipse cx={cx} cy={42} rx={4.8} ry={6.4} fill={K.eye} />
                        <circle cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                      </>
                    ))}
                  </g>
                  <g display={eyeShown("wide")}>
                    {pair((cx) => (
                      <>
                        <ellipse cx={cx} cy={42} rx={5.9} ry={7.6} fill={K.eye} />
                        <circle cx={cx - 1.8} cy={38.8} r={2.1} fill="#fff" fillOpacity={0.9} />
                      </>
                    ))}
                  </g>
                  <g display={eyeShown("flat")}>{pair((cx) => <ellipse cx={cx} cy={42.6} rx={4.8} ry={4.6} fill={K.eye} />)}</g>
                  <path display={eyeShown("line")} d="M 33 40.4 L 43 42.6 M 57 42.6 L 67 40.4" {...ink} strokeWidth={3} />
                  <path display={eyeShown("happy")} d="M 32.58 42.13 A 5.5 5 0 0 1 43.42 42.13 M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />
                  <path display={eyeShown("closed")} d="M 33 42.5 A 5.5 3.6 0 0 0 43 42.5 M 57 42.5 A 5.5 3.6 0 0 0 67 42.5" {...ink} strokeWidth={2.8} />
                  <g display={eyeShown("spiral")}>
                    {[38, 62].map((cx) => (
                      <path key={cx} transform={`rotate(${(t * 400) % 360} ${cx} 42)`} d={`M ${cx} 42 a 1 1 0 0 1 2 0 a 2 2 0 0 1 -4 0 a 3 3 0 0 1 6 0 a 4 4 0 0 1 -8 0`} {...ink} strokeWidth={1.7} />
                    ))}
                  </g>
                  <g display={eyeShown("heart")} fill="#FF7A93">
                    {pair((cx) => <path transform={`translate(${cx} 42.6) scale(2.5)`} d={PARTICLE_SHAPES.heart.d} />)}
                  </g>
                  <g display={eyeShown("star")} fill="#FFD65A">
                    {pair((cx) => <path transform={`translate(${cx} 42) scale(2.6)`} d={PARTICLE_SHAPES.star.d} />)}
                  </g>
                  <g display={eyeShown("tired")}>
                    {pair((cx) => (
                      <>
                        <path d={`M ${cx - 5} 42 A 5 4.6 0 0 0 ${cx + 5} 42 Z`} fill={K.eye} />
                        <path d={`M ${cx - 5.6} 41.6 H ${cx + 5.6}`} {...ink} strokeWidth={2.4} />
                      </>
                    ))}
                  </g>
                  <g display={eyeShown("wink")}>
                    <ellipse cx={38} cy={42} rx={4.8} ry={6.4} fill={K.eye} />
                    <circle cx={36.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                    <path d="M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />
                  </g>
                </g>
              </g>

              <path display={m("idle")} d="M 56.58 53.04 A 7 4.5 0 0 1 43.42 53.04" {...ink} strokeWidth={2.6} />
              <path display={m("happy")} d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={K.eye} />
              <ellipse display={m("o")} cx={50} cy={55} rx={3} ry={3.4} {...ink} strokeWidth={2.4} />
              <line display={m("flat")} x1={46} y1={55} x2={56} y2={54} stroke={K.eye} strokeWidth={2.6} strokeLinecap="round" />
              <path display={m("worry")} d="M 44 56.2 Q 50 53.4 56 56.2" {...ink} strokeWidth={2.6} />
              <line display={m("sleep")} x1={46.5} y1={55} x2={53.5} y2={55} stroke={K.eye} strokeWidth={2.4} strokeLinecap="round" />
              <path display={m("wave")} d="M 42 55 q 2 -2.4 4 0 t 4 0 t 4 0 t 4 0" {...ink} strokeWidth={2.2} />

              {look && <FaceAccessory look={look} />}
            </g>

            {sparkOn && (
              <path
                d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z"
                fill="#FFD65A"
                opacity={0.55 + 0.45 * s}
                transform={`translate(80 14) rotate(${18 * s}) scale(${0.7 + 0.5 * s}) translate(-80 -14)`}
              />
            )}

            {/* Réfléchir : trois points ; un point d'interrogation quand il est curieux. */}
            {face === "thinking" && (
              <g fill={K.eye}>
                {[
                  [86, 22],
                  [92.5, 18],
                  [99, 14],
                ].map(([cx, cy], k) => {
                  const ph = (((t - k * 0.18) % 1.2) + 1.2) % 1.2 / 1.2;
                  const up = ph < 0.3 ? ph / 0.3 : ph < 0.6 ? 1 - (ph - 0.3) / 0.3 : 0;
                  return <circle key={k} cx={cx} cy={cy - 2 * up} r={2.2} opacity={0.25 + 0.75 * up} />;
                })}
              </g>
            )}
            {face === "curious" && (
              <path
                transform={`translate(91 16) translate(0 ${-2 * loop(t, 1.6)}) rotate(${-6 + 12 * loop(t, 1.6)}) translate(-91 -16)`}
                d="M 86 12 q 0 -5 5 -5 q 5 0 5 4.5 q 0 3 -4 4.5 v 2.5 M 92 24.5 v 0.5"
                fill="none"
                stroke={K.accent}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            </g>
          </g>
        </g>
        {/* Hors du corps : les étincelles d'une joie, les confettis d'une fête, et les particules du moteur. */}
        {(burst === "jump" || burst === "giggle") && since >= 0 && since < 0.7 && (
          <g fill="#FFD65A">
            {[
              { d: "M 10 14 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 Z", cx: 10, cy: 19.6 },
              { d: "M 92 30 l 1.2 3 l 3 1.2 l -3 1.2 l -1.2 3 l -1.2 -3 l -3 -1.2 l 3 -1.2 Z", cx: 92, cy: 34.2 },
            ].map((p, k) => {
              const ph = since / 0.7;
              const e = 1 - Math.pow(1 - ph, 2);
              const sc = ph < 0.35 ? 0.2 + (1.15 - 0.2) * (ph / 0.35) : 1.15 - (1.15 - 0.6) * ((ph - 0.35) / 0.65);
              const op = ph < 0.35 ? ph / 0.35 : 1 - (ph - 0.35) / 0.65;
              return <path key={k} d={p.d} opacity={op} transform={`translate(${p.cx} ${p.cy}) rotate(${ph > 0.35 ? 40 * e : 0}) scale(${sc}) translate(${-p.cx} ${-p.cy})`} />;
            })}
          </g>
        )}
        {burst === "party" && since >= 0 && (
          <g>
            {CONFETTI.map((piece, k) => {
              const n = k + 1;
              const delay = n % 3 === 0 ? 0.16 : n % 2 === 0 ? 0.08 : 0;
              const ph = clamp01((since - delay) / 1.5);
              if (ph <= 0 || ph >= 1) return null;
              const e = CONFETTI_EASE(ph);
              const op = ph < 0.15 ? ph / 0.15 : ph < 0.75 ? 1 : 1 - (ph - 0.75) / 0.25;
              const x = 50 + (piece.x - 50) * e;
              const y = 40 + (piece.y + 4 - 40) * e;
              const sc = 0.3 + 0.7 * e;
              const rot = 160 * e;
              return piece.round ? (
                <circle key={k} cx={x} cy={y} r={2.4 * sc} fill={piece.color} opacity={op} />
              ) : (
                <rect key={k} x={x - 2 * sc} y={y - 3 * sc} width={4 * sc} height={6 * sc} rx={1} fill={piece.color} opacity={op} transform={`rotate(${rot} ${x} ${y})`} />
              );
            })}
          </g>
        )}
        <g strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
          {pose.particles.map((particle: Particle, k) => {
            if (particle.age <= 0) return null;
            const kk = particle.age / particle.life;
            const alpha = kk < 0.2 ? kk / 0.2 : 1 - (kk - 0.2) / 0.8;
            const shape = PARTICLE_SHAPES[particle.kind];
            const rotate = particle.kind === "heart" ? Math.sin(particle.age * 6) * 0.3 : particle.kind === "star" || particle.kind === "spark" ? particle.rot + particle.age * 2 : 0;
            const scale = particle.size * 1.5 * (1 + kk * 0.4);
            return (
              <path
                key={k}
                d={shape.d}
                fill={shape.fill}
                stroke={shape.stroke ?? "none"}
                opacity={Math.max(0, Math.min(1, alpha))}
                transform={`translate(${particle.x.toFixed(2)} ${particle.y.toFixed(2)}) rotate(${deg(rotate).toFixed(2)}) scale(${scale.toFixed(2)})`}
              />
            );
          })}
        </g>
      </svg>
    </span>
  );
}
