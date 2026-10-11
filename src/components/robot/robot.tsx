"use client";

import { useEffect, useId, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { BANNER } from "../../../agent/src/banner-design";
import { BURST_MS, burstForMood, POKE_IDLE, pokeReducer, type RobotBurst, type RobotMood } from "@/core/robot/mascot";
import { eyeForFace, pointerToLook, RobotMotion, type MotionFace, type Particle, type ParticleKind, type RobotPose } from "@/core/robot/motion";
import { cn } from "@/lib/utils";
import { useRobotSignal } from "./bus";
import { robotCss } from "./robot-css";
import { playRobotSound } from "./sound";
import { soundFor, type SoundContext } from "@/core/robot/sound";
import { robotLook } from "@/core/robot/counter-look";
import { FaceAccessory, HeadAccessory } from "./accessories";

/**
 * Le robot de PharmaBoost, vivant : un seul composant pour tout le web (site, application mobile, comptoir).
 *
 * Il vit comme un petit personnage : la tête tourne (le visage glisse sur l'écran comme sur une sphère), le corps
 * s'écrase et s'étire sur des ressorts, il cligne des yeux, jette des coups d'œil, sautille, s'étire, fait un clin d'œil,
 * bâille, penche la tête ; ses yeux changent de forme (rieurs, cœurs, étoiles, fermés, spirale, agacés…), ses joues
 * rosissent, des cœurs, étoiles, étincelles et « z » s'envolent. Il prend l'humeur qu'on lui donne (`mood`) avec un geste
 * d'arrivée (saut de joie, fête dansée). Touché, il s'écrase et rit ; une deuxième fois, il secoue la tête, agacé ; trois
 * fois très vite, la tête lui tourne. Au survol, ses yeux grandissent. Ses yeux peuvent suivre le pointeur (`track`) —
 * sur les pages d'accueil, pas sur l'écran de vente, où l'attention va au patient. Une mise en garde le rend sérieux :
 * jamais de geste festif, jamais de particule.
 *
 * Le mouvement vient de `core/robot/motion.ts` (adapté du moteur de Coucou, licence MIT, © 2026 Louis Raillé — voir
 * THIRD_PARTY_NOTICES.md) ; le dessin, lui, est le nôtre. Le moteur ne tourne que quand le robot est à l'écran et l'onglet
 * visible ; pour qui a demandé à réduire les animations, il ne tourne pas du tout : l'expression seule.
 *
 * Décoratif par défaut (aria-hidden). Muet sans `sound`. Immobile pour qui a demandé à réduire les animations : l'humeur
 * se lit alors à l'expression seule.
 */

const C = BANNER.colors;
const CSS = robotCss();

export type RobotProps = {
  /** L'humeur durable. Passer à « happy » ou « celebrate » joue le geste qui va avec. */
  mood?: RobotMood;
  /** Largeur en pixels (la hauteur suit). Sans elle, la taille vient de `className`. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Flotte dans le vide, avec son ombre (site, accueil mobile). */
  floating?: boolean;
  /** Les yeux suivent la souris ou le doigt (accueil du site, « Nouvelle vente », compagnon du site). */
  track?: boolean;
  /** Réagit quand on le touche (gloussement, tournis). */
  interactive?: boolean;
  /** Un petit coucou en arrivant — une seule fois par session de navigation quand `greet` vaut "once". */
  greet?: boolean | "once";
  /** Le coucou « once » de ce robot-ci (le site et le logiciel saluent chacun une fois, sur la même adresse). */
  greetKey?: string;
  /** S'endort après tant de millisecondes sans activité (souris, clavier, toucher). */
  sleepAfterMs?: number;
  /** Écoute les signaux d'un canal (`emitRobotMood`). `true` : le canal par défaut. */
  listen?: boolean | string;
  /** Change cette valeur pour rejouer le geste de l'humeur actuelle (un deuxième conseil vendu). */
  cheerKey?: string | number;
  /**
   * Les sons, et le lieu dont ils suivent le réglage : "site", "mobile", "counter" (allumés par défaut, après un geste ;
   * au comptoir très bas et amicaux seulement ; jamais pour une mise en garde). Sans valeur : muet.
   */
  sound?: SoundContext;
  /** "reduce" force l'immobilité (sinon : le réglage du système). */
  motion?: "auto" | "reduce";
  /** Rend le robot lisible par un lecteur d'écran. Sans label : décoratif. */
  label?: string;
  /** Le robot d'un comptoir (0 à 19, core/robot/counter-look.ts) : sa couleur et son accessoire. Sans valeur : le robot de la marque. */
  look?: number | null;
};

// --- Réduire les animations : le réglage du système, lu sans scintillement au premier rendu ---
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const list = window.matchMedia(REDUCE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}
const reducedNow = () => window.matchMedia(REDUCE_QUERY).matches;
const reducedOnServer = () => false;

const GREETED_KEY = "pharmaboost:robot-greeted";

/** L'expression affichée : le geste d'un instant l'emporte sur l'humeur (on rit en sautant, on a le tournis). */
export function faceFor(mood: RobotMood, burst: RobotBurst | null, asleep: boolean): MotionFace {
  if (burst === "dizzy") return "dizzy";
  if (burst === "giggle" || burst === "jump" || burst === "party" || burst === "wave") return "happy";
  if (mood === "celebrate") return "happy";
  if (asleep && mood === "idle") return "sleepy";
  return mood;
}

/** Les confettis de la fête : position d'arrivée, couleur, forme. Fixes, pour un rendu serveur identique au client. */
const CONFETTI: { x: number; y: number; color: string; round: boolean }[] = [
  { x: 6, y: 18, color: "#FFD65A", round: false },
  { x: 20, y: 4, color: C.eye, round: true },
  { x: 36, y: -6, color: C.accent, round: false },
  { x: 64, y: -6, color: "#FF9F7A", round: true },
  { x: 80, y: 4, color: "#FFD65A", round: true },
  { x: 95, y: 18, color: C.accent, round: false },
  { x: 2, y: 44, color: "#FF9F7A", round: false },
  { x: 98, y: 44, color: C.eye, round: true },
];

/** Les particules : une forme par sorte, dessinée autour de (0, 0) à l'échelle 1. */
const PARTICLE_SHAPES: Record<ParticleKind, { d: string; fill: string; stroke?: string }> = {
  heart: { d: "M 0 1.7 C -2.7 -0.2 -2.3 -2.5 -0.95 -2.5 C -0.35 -2.5 0 -2 0 -1.65 C 0 -2 0.35 -2.5 0.95 -2.5 C 2.3 -2.5 2.7 -0.2 0 1.7 Z", fill: "#FF5C7A" },
  star: { d: "M 0 -2.4 L 0.7 -0.8 L 2.3 -0.75 L 1.1 0.35 L 1.45 2 L 0 1.1 L -1.45 2 L -1.1 0.35 L -2.3 -0.75 L -0.7 -0.8 Z", fill: "#FFC83D" },
  spark: { d: "M 0 -2.5 L 0.55 -0.55 L 2.5 0 L 0.55 0.55 L 0 2.5 L -0.55 0.55 L -2.5 0 L -0.55 -0.55 Z", fill: "#FFD65A" },
  sweat: { d: "M 0 -2.1 Q 1.7 0.4 0 1.3 Q -1.7 0.4 0 -2.1 Z", fill: "#7CC7FF" },
  z: { d: "M -1.3 -1.3 H 1.3 L -1.3 1.3 H 1.3", fill: "none", stroke: C.shellEdge },
};
const PARTICLE_POOL = 14;

const deg = (radians: number) => (radians * 180) / Math.PI;
const n2 = (value: number) => (Math.round(value * 100) / 100).toString();
const n3 = (value: number) => (Math.round(value * 1000) / 1000).toString();

/** Applique une pose au dessin : quelques attributs posés directement, sans repasser par React à chaque image. */
type Parts = {
  root: HTMLSpanElement;
  body: SVGGElement;
  screen: SVGGElement;
  face: SVGGElement;
  gaze: SVGGElement;
  lids: SVGGElement;
  blush: SVGGElement;
  hand: SVGGElement;
  particles: SVGPathElement[];
};

function applyPose(parts: Parts, pose: RobotPose, lastEye: { current: string }) {
  parts.body.setAttribute(
    "transform",
    `translate(${n2(pose.ox)} ${n2(pose.oy)}) rotate(${n2(deg(pose.tilt))} 50 84) rotate(${n2(deg(pose.roll))} 50 46) translate(50 84) scale(${n3(pose.sx)} ${n3(pose.sy)}) translate(-50 -84)`,
  );
  parts.screen.setAttribute("transform", `translate(${n2(pose.yaw * 2.2)} ${n2(pose.pitch * 1.4)})`);
  parts.face.setAttribute("transform", `translate(${n2(pose.yaw * 5)} ${n2(pose.pitch * 3.6)})`);
  parts.gaze.style.transform = `scale(${(pose.eyeScale * (1 - 0.18 * Math.abs(pose.yaw))).toFixed(3)}, ${(pose.eyeScale * (1 - 0.1 * Math.abs(pose.pitch))).toFixed(3)})`;
  parts.lids.style.transform = `scaleY(${Math.max(0.06, pose.open).toFixed(3)})`;
  parts.blush.style.opacity = (pose.blush * 0.6).toFixed(2);
  parts.hand.style.opacity = pose.hand.toFixed(2);
  parts.hand.style.transform = `translateY(${n2((1 - pose.hand) * 6)}px) rotate(${n2(deg(pose.handSwing))}deg)`;
  if (lastEye.current !== pose.eye) {
    lastEye.current = pose.eye;
    parts.root.setAttribute("data-eye", pose.eye);
  }
  parts.particles.forEach((element, index) => {
    const particle: Particle | undefined = pose.particles[index];
    if (!particle || particle.age <= 0) {
      element.setAttribute("visibility", "hidden");
      return;
    }
    const k = particle.age / particle.life;
    const alpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
    const shape = PARTICLE_SHAPES[particle.kind];
    if (element.dataset.kind !== particle.kind) {
      element.dataset.kind = particle.kind;
      element.setAttribute("d", shape.d);
      element.setAttribute("fill", shape.fill);
      element.setAttribute("stroke", shape.stroke ?? "none");
    }
    const rotate = particle.kind === "heart" ? Math.sin(particle.age * 6) * 0.3 : particle.kind === "star" || particle.kind === "spark" ? particle.rot + particle.age * 2 : 0;
    const scale = particle.size * 1.5 * (1 + k * 0.4);
    element.setAttribute("visibility", "visible");
    element.setAttribute("opacity", Math.max(0, Math.min(1, alpha)).toFixed(2));
    element.setAttribute("transform", `translate(${n2(particle.x)} ${n2(particle.y)}) rotate(${n2(deg(rotate))}) scale(${n2(scale)})`);
  });
}

export function Robot({
  mood = "idle",
  size,
  className,
  style,
  floating = false,
  track = false,
  interactive = false,
  greet = false,
  greetKey,
  sleepAfterMs,
  listen,
  cheerKey,
  sound,
  motion = "auto",
  label,
  look: lookIndex,
}: RobotProps) {
  const look = typeof lookIndex === "number" ? robotLook(lookIndex) : null;
  const earTop = look ? look.palette.ear : C.ear;
  const earBottom = look ? look.palette.earDark : "#12968C";
  const rawId = useId();
  const uid = `rbt${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const screenRef = useRef<SVGGElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const gazeRef = useRef<SVGGElement>(null);
  const lidsRef = useRef<SVGGElement>(null);
  const blushRef = useRef<SVGGElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const motionRef = useRef<RobotMotion | null>(null);
  const systemReduced = useSyncExternalStore(subscribeReduced, reducedNow, reducedOnServer);
  const reduced = motion === "reduce" || systemReduced;

  // Un signal du fil (quiz réussi, badge gagné…) prend le pas un instant sur l'humeur donnée.
  const signal = useRobotSignal(listen ? (listen === true ? "app" : listen) : null);
  const shownMood: RobotMood = signal?.mood ?? mood;

  // Les gestes d'un instant : à l'arrivée d'une humeur, au coucou, au toucher.
  const [burst, setBurst] = useState<{ name: RobotBurst; seq: 0 | 1 } | null>(null);
  const [seen, setSeen] = useState({ mood: shownMood, cheer: cheerKey, signalAt: signal?.at ?? 0 });
  if (seen.mood !== shownMood || seen.cheer !== cheerKey || (signal && seen.signalAt !== signal.at)) {
    setSeen({ mood: shownMood, cheer: cheerKey, signalAt: signal?.at ?? 0 });
    const next = burstForMood(shownMood);
    if (next) setBurst((current) => ({ name: next, seq: current?.seq === 0 ? 1 : 0 }));
  }

  const [poke, dispatchPoke] = useReducer(pokeReducer, POKE_IDLE);
  const [asleep, setAsleep] = useState(false);

  const activeBurst: RobotBurst | null = poke.burst ?? burst?.name ?? null;
  const seq = poke.burst ? (poke.taps.length % 2 === 0 ? 1 : 0) : (burst?.seq ?? 0);
  const face = faceFor(shownMood, activeBurst, asleep);

  // Fin d'un geste : on revient à l'humeur.
  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(null), BURST_MS[burst.name]);
    return () => clearTimeout(id);
  }, [burst]);
  useEffect(() => {
    if (!poke.burst) return;
    const id = setTimeout(() => dispatchPoke({ type: "tick", now: Date.now() }), Math.max(0, poke.until - Date.now()));
    return () => clearTimeout(id);
  }, [poke]);

  // Le moteur de mouvement : une image par rafraîchissement d'écran, seulement à l'écran et onglet visible.
  useEffect(() => {
    if (reduced) {
      motionRef.current = null;
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const parts: Parts | null =
      bodyRef.current && screenRef.current && faceRef.current && gazeRef.current && lidsRef.current && blushRef.current && handRef.current
        ? {
            root,
            body: bodyRef.current,
            screen: screenRef.current,
            face: faceRef.current,
            gaze: gazeRef.current,
            lids: lidsRef.current,
            blush: blushRef.current,
            hand: handRef.current,
            // Tout petit (moins de 32 px), le robot n'a pas de particules : elles seraient illisibles.
            particles: particlesRef.current ? [...particlesRef.current.querySelectorAll("path")] : [],
          }
        : null;
    if (!parts) return;
    const engine = new RobotMotion({ now: performance.now() / 1000 });
    motionRef.current = engine;
    const lastEye = { current: root.getAttribute("data-eye") ?? "" };
    let frame = 0;
    let last = performance.now();
    let onScreen = true;
    const loop = (time: number) => {
      const dt = (time - last) / 1000;
      last = time;
      engine.update(dt, time / 1000);
      applyPose(parts, engine.pose(), lastEye);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (frame || !onScreen || document.visibilityState === "hidden") return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      if (onScreen) start();
      else stop();
    });
    observer?.observe(root);
    const onVisibility = () => (document.visibilityState === "hidden" ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionRef.current = null;
    };
  }, [reduced]);

  // L'humeur affichée et les gestes d'humeur (saut, fête, coucou) passent au moteur.
  useEffect(() => {
    motionRef.current?.setFace(face);
  }, [face, reduced]);
  useEffect(() => {
    if (burst) motionRef.current?.play(burst.name);
  }, [burst]);

  // Le coucou d'arrivée, une fois (par session de navigation si "once").
  useEffect(() => {
    if (!greet || reduced) return;
    if (greet === "once") {
      try {
        const key = greetKey ? `${GREETED_KEY}:${greetKey}` : GREETED_KEY;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        // Stockage indisponible (navigation privée) : on salue quand même, ce n'est qu'un coucou.
      }
    }
    const id = setTimeout(() => setBurst({ name: "wave", seq: 0 }), 450);
    return () => clearTimeout(id);
  }, [greet, greetKey, reduced]);

  // Le regard suit le pointeur (si demandé) ; sans pointeur depuis quelques secondes, il reprend ses coups d'œil.
  useEffect(() => {
    if (!track || reduced) return;
    let frame = 0;
    let quiet: ReturnType<typeof setTimeout>;
    const onPointer = (event: globalThis.PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = rootRef.current?.getBoundingClientRect();
        if (!box) return;
        motionRef.current?.lookAt(pointerToLook(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height * 0.36), box.width));
      });
      clearTimeout(quiet);
      quiet = setTimeout(() => motionRef.current?.lookAt(null), 4000);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(quiet);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [track, reduced]);

  // Le sommeil : seulement au repos, réveillé par la moindre activité.
  useEffect(() => {
    if (!sleepAfterMs || reduced) return;
    let timer = setTimeout(() => setAsleep(true), sleepAfterMs);
    const wake = () => {
      setAsleep(false);
      clearTimeout(timer);
      timer = setTimeout(() => setAsleep(true), sleepAfterMs);
    };
    const events = ["pointermove", "pointerdown", "keydown", "scroll"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [sleepAfterMs, reduced]);

  // Le son, s'il est demandé : un par geste, et un à l'arrivée de certaines humeurs (bip reçu, réflexion…).
  const lastSound = useRef<string | null>(null);
  useEffect(() => {
    if (!sound) return;
    const key = activeBurst ? `burst:${activeBurst}:${seq}` : `mood:${face}`;
    if (lastSound.current === key) return;
    const first = lastSound.current === null;
    lastSound.current = key;
    // Au premier rendu, l'humeur de départ ne sonne pas : seul un changement s'entend.
    if (first && !activeBurst) return;
    const kind = activeBurst ? soundFor(sound, { burst: activeBurst }) : soundFor(sound, { mood: face as RobotMood });
    if (kind) playRobotSound(kind, sound);
  }, [sound, activeBurst, seq, face]);

  const onPoke = interactive
    ? (event: PointerEvent<HTMLSpanElement>) => {
        if (event.button !== 0) return;
        setAsleep(false);
        if (reduced) return;
        dispatchPoke({ type: "poke", now: Date.now() });
        motionRef.current?.poke();
      }
    : undefined;
  const onHover = interactive || track ? (on: boolean) => () => motionRef.current?.hover(on) : null;

  const tiny = size !== undefined && size < 32;
  const sizeStyle: CSSProperties | undefined = size ? { width: size, height: Math.round(size * (floating ? 1.22 : 0.92)) } : undefined;
  const pair = (render: (cx: number) => ReactNode) => [38, 62].map((cx) => <g key={cx}>{render(cx)}</g>);
  const ink = { fill: "none", stroke: C.eye, strokeLinecap: "round" as const };

  return (
    <span
      ref={rootRef}
      className={cn("rbt", className)}
      style={{ ...sizeStyle, ...(look ? ({ "--rbt-lamp": look.palette.lamp } as CSSProperties) : null), ...style }}
      data-mood={shownMood}
      data-face={face}
      data-eye={eyeForFace(face)}
      data-burst={activeBurst ?? undefined}
      data-seq={activeBurst ? String(seq) : undefined}
      data-float={floating ? "" : undefined}
      data-tiny={tiny ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      data-motion={reduced ? "reduce" : "auto"}
      onPointerDown={onPoke}
      onPointerEnter={onHover?.(true)}
      onPointerLeave={onHover?.(false)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <style href="pharmaboost-robot" precedence="default">
        {CSS}
      </style>
      <svg viewBox={floating ? "0 -4 100 122" : "0 -4 100 92"} focusable="false">
        <defs>
          <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.shellTop} /><stop offset="1" stopColor={C.shellBottom} /></linearGradient>
          <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.screenTop} /><stop offset="1" stopColor={C.screenBottom} /></linearGradient>
          <linearGradient id={`${uid}-ear`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={earTop} /><stop offset="1" stopColor={earBottom} /></linearGradient>
          <linearGradient id={`${uid}-badge`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.accent} /><stop offset="1" stopColor={C.accentDark} /></linearGradient>
        </defs>
        {floating && <ellipse className="rbt-shadow" cx={50} cy={110} rx={26} ry={4.5} fill={C.screenBottom} />}
        <g className="rbt-float">
          <g className="rbt-act">
            <g ref={bodyRef} className="rbt-burst">
              <g className="rbt-breath">
                {/* La main du coucou, cachée derrière l'oreille droite le reste du temps. */}
                <g ref={handRef} className="rbt-hand">
                  <rect x={95} y={33} width={5} height={18} rx={2.5} fill={`url(#${uid}-ear)`} />
                  <circle cx={99} cy={29} r={6} fill={C.shellTop} stroke={C.shellEdge} strokeWidth={1.4} />
                </g>
                <line x1={50} y1={17} x2={50} y2={8} stroke={C.shellEdge} strokeWidth={tiny ? 4 : 3} strokeLinecap="round" />
                <circle className="rbt-glow" cx={50} cy={6} r={8} />
                <circle className="rbt-lamp" cx={50} cy={6} r={tiny ? 4.6 : 3.8} />
                {!tiny && <path d="M 9.90 36.72 A 41 35 0 0 1 90.10 36.72" fill="none" stroke={earTop} strokeWidth={5} strokeLinecap="round" />}
                <rect x={3} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
                <rect x={82} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
                <rect x={14} y={16} width={72} height={58} rx={24} fill={`url(#${uid}-shell)`} stroke={C.shellEdge} strokeWidth={1.6} />
                <g ref={screenRef}>
                  <rect x={22} y={25} width={56} height={40} rx={17} fill={`url(#${uid}-screen)`} />
                </g>
                {look && <HeadAccessory look={look} />}

                {/* Le visage : il glisse sur l'écran quand la tête tourne. */}
                <g ref={faceRef}>
                  {/* Les joues, qui rosissent de joie. */}
                  <g ref={blushRef} className="rbt-blush" style={{ opacity: 0 }} fill="#FF8FA3">
                    <ellipse cx={29.5} cy={52} rx={4.2} ry={2.4} />
                    <ellipse cx={70.5} cy={52} rx={4.2} ry={2.4} />
                  </g>

                  {/* Les sourcils de l'inquiétude : l'intérieur relevé, sérieux, jamais fâché. */}
                  <path className="rbt-brow" d="M 32.5 34.6 L 42.5 32.2 M 57.5 32.2 L 67.5 34.6" stroke={C.eye} strokeWidth={2.2} strokeLinecap="round" fill="none" />

                  <g ref={gazeRef} className="rbt-gaze" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                    <g ref={lidsRef} className="rbt-lids">
                      <g className="rbt-eye rbt-eo">
                        {pair((cx) => (
                          <>
                            <ellipse cx={cx} cy={42} rx={tiny ? 5.6 : 4.8} ry={tiny ? 7.2 : 6.4} fill={C.eye} />
                            <circle className="rbt-glint" cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                          </>
                        ))}
                      </g>
                      <g className="rbt-eye rbt-e-wide">
                        {pair((cx) => (
                          <>
                            <ellipse cx={cx} cy={42} rx={5.9} ry={7.6} fill={C.eye} />
                            <circle className="rbt-glint" cx={cx - 1.8} cy={38.8} r={2.1} fill="#fff" fillOpacity={0.9} />
                          </>
                        ))}
                      </g>
                      <g className="rbt-eye rbt-e-flat">{pair((cx) => <ellipse cx={cx} cy={42.6} rx={4.8} ry={4.6} fill={C.eye} />)}</g>
                      <path className="rbt-eye rbt-e-line" d="M 33 40.4 L 43 42.6 M 57 42.6 L 67 40.4" {...ink} strokeWidth={3} />
                      <path className="rbt-eye rbt-eh" d="M 32.58 42.13 A 5.5 5 0 0 1 43.42 42.13 M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />
                      <path className="rbt-eye rbt-ez" d="M 33 42.5 A 5.5 3.6 0 0 0 43 42.5 M 57 42.5 A 5.5 3.6 0 0 0 67 42.5" {...ink} strokeWidth={2.8} />
                      <g className="rbt-eye rbt-es">
                        {[38, 62].map((cx) => (
                          <path key={cx} className="rbt-spiral" d={`M ${cx} 42 a 1 1 0 0 1 2 0 a 2 2 0 0 1 -4 0 a 3 3 0 0 1 6 0 a 4 4 0 0 1 -8 0`} {...ink} strokeWidth={1.7} />
                        ))}
                      </g>
                      <g className="rbt-eye rbt-e-heart" fill="#FF7A93">
                        {pair((cx) => <path transform={`translate(${cx} 42.6) scale(2.5)`} d={PARTICLE_SHAPES.heart.d} />)}
                      </g>
                      <g className="rbt-eye rbt-e-star" fill="#FFD65A">
                        {pair((cx) => <path transform={`translate(${cx} 42) scale(2.6)`} d={PARTICLE_SHAPES.star.d} />)}
                      </g>
                      <g className="rbt-eye rbt-e-tired">
                        {pair((cx) => (
                          <>
                            <path d={`M ${cx - 5} 42 A 5 4.6 0 0 0 ${cx + 5} 42 Z`} fill={C.eye} />
                            <path d={`M ${cx - 5.6} 41.6 H ${cx + 5.6}`} {...ink} strokeWidth={2.4} />
                          </>
                        ))}
                      </g>
                      <g className="rbt-eye rbt-e-wink">
                        <ellipse cx={38} cy={42} rx={4.8} ry={6.4} fill={C.eye} />
                        <circle className="rbt-glint" cx={36.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                        <path d="M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />
                      </g>
                    </g>
                  </g>

                  {/* Les bouches. */}
                  <path className="rbt-m rbt-m-idle" d="M 56.58 53.04 A 7 4.5 0 0 1 43.42 53.04" {...ink} strokeWidth={tiny ? 3.4 : 2.6} />
                  <path className="rbt-m rbt-m-happy" d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={C.eye} />
                  <ellipse className="rbt-m rbt-m-o" cx={50} cy={55} rx={3} ry={3.4} {...ink} strokeWidth={2.4} />
                  <line className="rbt-m rbt-m-flat" x1={46} y1={55} x2={56} y2={54} stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" />
                  <path className="rbt-m rbt-m-worry" d="M 44 56.2 Q 50 53.4 56 56.2" {...ink} strokeWidth={2.6} />
                  <line className="rbt-m rbt-m-sleep" x1={46.5} y1={55} x2={53.5} y2={55} stroke={C.eye} strokeWidth={2.4} strokeLinecap="round" />
                  <path className="rbt-m rbt-m-wave" d="M 42 55 q 2 -2.4 4 0 t 4 0 t 4 0 t 4 0" {...ink} strokeWidth={2.2} />

                  {look && <FaceAccessory look={look} />}
                </g>

                <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.95} />
                <circle cx={74} cy={69} r={13.5} fill={`url(#${uid}-badge)`} />
                <rect x={72.2} y={61} width={3.6} height={16} rx={1} fill="#fff" />
                <rect x={66} y={67.2} width={16} height={3.6} rx={1} fill="#fff" />
                <path className="rbt-spark" d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A" />

                {/* Réfléchir : trois points ; un point d'interrogation quand il est curieux ; un « z » immobile si rien ne bouge. */}
                <g className="rbt-dots" fill={C.eye}>
                  <circle cx={86} cy={22} r={2.2} />
                  <circle cx={92.5} cy={18} r={2.2} />
                  <circle cx={99} cy={14} r={2.2} />
                </g>
                <path className="rbt-q" d="M 86 12 q 0 -5 5 -5 q 5 0 5 4.5 q 0 3 -4 4.5 v 2.5 M 92 24.5 v 0.5" fill="none" stroke={C.accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                <path className="rbt-z" d="M 80 14 h 7 l -7 8 h 7" fill="none" stroke={C.shellEdge} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          </g>
          {/* Hors du corps : les étincelles d'une joie, les confettis d'une fête, et les particules du moteur. */}
          <g className="rbt-pop" fill="#FFD65A">
            <path d="M 10 14 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 Z" />
            <path d="M 92 30 l 1.2 3 l 3 1.2 l -3 1.2 l -1.2 3 l -1.2 -3 l -3 -1.2 l 3 -1.2 Z" />
          </g>
          <g className="rbt-confetti">
            {CONFETTI.map((piece, index) => {
              const vars = { "--tx": piece.x - 50, "--ty": piece.y - 40 } as CSSProperties;
              return piece.round ? (
                <circle key={index} cx={piece.x} cy={piece.y} r={2.4} fill={piece.color} style={vars} />
              ) : (
                <rect key={index} x={piece.x - 2} y={piece.y - 3} width={4} height={6} rx={1} fill={piece.color} style={vars} />
              );
            })}
          </g>
          {!tiny && (
            <g ref={particlesRef} className="rbt-particles" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
              {Array.from({ length: PARTICLE_POOL }, (_, index) => (
                <path key={index} visibility="hidden" />
              ))}
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
