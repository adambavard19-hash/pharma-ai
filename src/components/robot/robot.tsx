"use client";

import { useEffect, useId, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { BANNER } from "../../../agent/src/banner-design";
import { BURST_MS, burstForMood, gazeToward, GAZE_CENTER, POKE_IDLE, pokeReducer, type Gaze, type RobotBurst, type RobotMood } from "@/core/robot/mascot";
import { cn } from "@/lib/utils";
import { useRobotSignal } from "./bus";
import { robotCss } from "./robot-css";
import { playRobotSound } from "./sound";
import { soundFor, type SoundContext } from "@/core/robot/sound";

/**
 * Le robot de PharmaBoost, vivant : un seul composant pour tout le web (site, application mobile, comptoir).
 *
 * Il respire, cligne des yeux au hasard, regarde parfois autour de lui ; il prend l'humeur qu'on lui donne (`mood`) et
 * joue un petit geste quand elle arrive (saut de joie, fête). Touché, il glousse ; touché quatre fois très vite, la tête
 * lui tourne, puis il se remet. Ses yeux peuvent suivre le pointeur (`track`) — à n'activer que là où ça ne distrait
 * personne : jamais au comptoir, devant un patient.
 *
 * Décoratif par défaut (aria-hidden). Muet par défaut. Immobile pour qui a demandé à réduire les animations : l'humeur
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
  /** Les yeux suivent la souris ou le doigt. Jamais au comptoir. */
  track?: boolean;
  /** Réagit quand on le touche (gloussement, tournis). */
  interactive?: boolean;
  /** Un petit coucou en arrivant — une seule fois par session de navigation quand `greet` vaut "once". */
  greet?: boolean | "once";
  /** S'endort après tant de millisecondes sans activité (souris, clavier, toucher). */
  sleepAfterMs?: number;
  /** Écoute les signaux d'un canal (`emitRobotMood`). `true` : le canal par défaut. */
  listen?: boolean | string;
  /** Change cette valeur pour rejouer le geste de l'humeur actuelle (un deuxième conseil vendu). */
  cheerKey?: string | number;
  /**
   * Les sons, et le lieu dont ils suivent le réglage : "site" et "mobile" (allumés par défaut, après un geste),
   * "counter" (éteints par défaut, jamais pour une mise en garde). Sans valeur : muet.
   */
  sound?: SoundContext;
  /** "reduce" force l'immobilité (sinon : le réglage du système). */
  motion?: "auto" | "reduce";
  /** Rend le robot lisible par un lecteur d'écran. Sans label : décoratif. */
  label?: string;
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
export function faceFor(mood: RobotMood, burst: RobotBurst | null, asleep: boolean): string {
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

export function Robot({
  mood = "idle",
  size,
  className,
  style,
  floating = false,
  track = false,
  interactive = false,
  greet = false,
  sleepAfterMs,
  listen,
  cheerKey,
  sound,
  motion = "auto",
  label,
}: RobotProps) {
  const rawId = useId();
  const uid = `rbt${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const gazeRef = useRef<SVGGElement>(null);
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

  // Le coucou d'arrivée, une fois (par session de navigation si "once").
  useEffect(() => {
    if (!greet || reduced) return;
    if (greet === "once") {
      try {
        if (window.sessionStorage.getItem(GREETED_KEY)) return;
        window.sessionStorage.setItem(GREETED_KEY, "1");
      } catch {
        // Stockage indisponible (navigation privée) : on salue quand même, ce n'est qu'un coucou.
      }
    }
    const id = setTimeout(() => setBurst({ name: "wave", seq: 0 }), 450);
    return () => clearTimeout(id);
  }, [greet, reduced]);

  // Le clignement : au hasard, parfois deux fois de suite, comme un vrai regard.
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout>;
    const blink = (again: boolean) => {
      root.setAttribute("data-blink", "");
      timer = setTimeout(() => {
        root.removeAttribute("data-blink");
        timer = again ? setTimeout(() => blink(false), 160) : setTimeout(() => blink(Math.random() < 0.15), 2200 + Math.random() * 4300);
      }, 120);
    };
    timer = setTimeout(() => blink(false), 1200 + Math.random() * 2500);
    return () => {
      clearTimeout(timer);
      root.removeAttribute("data-blink");
    };
  }, [reduced]);

  // Le regard. Suivre le pointeur (si demandé), sinon jeter un œil autour de temps en temps ; certaines humeurs
  // l'imposent : on lève les yeux pour réfléchir, on baisse un peu la tête quand c'est sérieux.
  useEffect(() => {
    const target = gazeRef.current;
    if (!target) return;
    const apply = (gaze: Gaze) => {
      target.style.transform = `translate(${gaze.x.toFixed(2)}px, ${gaze.y.toFixed(2)}px) scale(${gaze.scaleX.toFixed(3)}, ${gaze.scaleY.toFixed(3)})`;
    };
    if (reduced || face === "sleepy" || face === "dizzy" || face === "happy") return apply(GAZE_CENTER);
    if (face === "thinking") return apply({ x: 2.6, y: -3, scaleX: 0.95, scaleY: 0.96 });
    if (face === "concerned") return apply({ x: 0, y: 1.2, scaleX: 1, scaleY: 1 });

    let lastPointer = 0;
    let frame = 0;
    let look: ReturnType<typeof setTimeout>;
    const onPointer = (event: globalThis.PointerEvent) => {
      lastPointer = Date.now();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = rootRef.current?.getBoundingClientRect();
        if (!box) return;
        apply(gazeToward(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height * 0.36)));
      });
    };
    if (track) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
    }
    // Regarder autour : seulement quand personne ne bouge le pointeur depuis quelques secondes.
    const glance = () => {
      if (Date.now() - lastPointer > 4000) {
        const spots = [{ x: -3.4, y: 0.4 }, { x: 3.4, y: 0.2 }, { x: -2, y: -2.2 }, { x: 2.4, y: -1.8 }];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        apply({ ...spot, scaleX: 0.94, scaleY: 0.98 });
        look = setTimeout(() => {
          if (Date.now() - lastPointer > 4000) apply(GAZE_CENTER);
          look = setTimeout(glance, 3500 + Math.random() * 5000);
        }, 900 + Math.random() * 800);
      } else look = setTimeout(glance, 3000);
    };
    apply(GAZE_CENTER);
    look = setTimeout(glance, 2500 + Math.random() * 4000);
    return () => {
      clearTimeout(look);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [track, reduced, face]);

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
        if (!reduced) dispatchPoke({ type: "poke", now: Date.now() });
      }
    : undefined;

  const tiny = size !== undefined && size < 32;
  const sizeStyle: CSSProperties | undefined = size ? { width: size, height: Math.round(size * (floating ? 1.22 : 0.92)) } : undefined;
  const eye = (cx: number) => (
    <g key={cx}>
      <g className="rbt-eo">
        <ellipse cx={cx} cy={42} rx={tiny ? 5.6 : 4.8} ry={tiny ? 7.2 : 6.4} fill={C.eye} />
        <circle className="rbt-glint" cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
      </g>
    </g>
  );

  return (
    <span
      ref={rootRef}
      className={cn("rbt", className)}
      style={{ ...sizeStyle, ...style }}
      data-mood={shownMood}
      data-face={face}
      data-burst={activeBurst ?? undefined}
      data-seq={activeBurst ? String(seq) : undefined}
      data-float={floating ? "" : undefined}
      data-tiny={tiny ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      data-motion={reduced ? "reduce" : "auto"}
      onPointerDown={onPoke}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <style href="pharmaboost-robot" precedence="default">
        {CSS}
      </style>
      <svg viewBox={floating ? "0 -4 100 122" : "0 -4 100 92"} focusable="false">
        <defs>
          <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.shellTop} /><stop offset="1" stopColor={C.shellBottom} /></linearGradient>
          <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.screenTop} /><stop offset="1" stopColor={C.screenBottom} /></linearGradient>
          <linearGradient id={`${uid}-ear`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.ear} /><stop offset="1" stopColor="#12968C" /></linearGradient>
          <linearGradient id={`${uid}-badge`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.accent} /><stop offset="1" stopColor={C.accentDark} /></linearGradient>
        </defs>
        {floating && <ellipse className="rbt-shadow" cx={50} cy={110} rx={26} ry={4.5} fill={C.screenBottom} />}
        <g className="rbt-float">
          <g className="rbt-act">
            <g className="rbt-burst">
              <g className="rbt-breath">
                {/* La main du coucou, cachée derrière l'oreille droite le reste du temps. */}
                <g className="rbt-hand">
                  <rect x={95} y={33} width={5} height={18} rx={2.5} fill={`url(#${uid}-ear)`} />
                  <circle cx={99} cy={29} r={6} fill={C.shellTop} stroke={C.shellEdge} strokeWidth={1.4} />
                </g>
                <line x1={50} y1={17} x2={50} y2={8} stroke={C.shellEdge} strokeWidth={tiny ? 4 : 3} strokeLinecap="round" />
                <circle className="rbt-glow" cx={50} cy={6} r={8} />
                <circle className="rbt-lamp" cx={50} cy={6} r={tiny ? 4.6 : 3.8} />
                {!tiny && <path d="M 9.90 36.72 A 41 35 0 0 1 90.10 36.72" fill="none" stroke={C.ear} strokeWidth={5} strokeLinecap="round" />}
                <rect x={3} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
                <rect x={82} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
                <rect x={14} y={16} width={72} height={58} rx={24} fill={`url(#${uid}-shell)`} stroke={C.shellEdge} strokeWidth={1.6} />
                <rect x={22} y={25} width={56} height={40} rx={17} fill={`url(#${uid}-screen)`} />

                {/* Les sourcils de l'inquiétude : l'intérieur relevé, sérieux, jamais fâché. */}
                <path className="rbt-brow" d="M 32.5 34.6 L 42.5 32.2 M 57.5 32.2 L 67.5 34.6" stroke={C.eye} strokeWidth={2.2} strokeLinecap="round" fill="none" />

                <g ref={gazeRef} className="rbt-gaze" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                  <g className="rbt-lids">
                    <g className="rbt-eyescale">
                      {eye(38)}
                      {eye(62)}
                    </g>
                  </g>
                  {/* Yeux rieurs, yeux fermés, yeux en spirale. */}
                  <path className="rbt-eh" d="M 32.58 42.13 A 5.5 5 0 0 1 43.42 42.13 M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" fill="none" stroke={C.eye} strokeWidth={3.2} strokeLinecap="round" />
                  <path className="rbt-ez" d="M 33 42.5 A 5.5 3.6 0 0 0 43 42.5 M 57 42.5 A 5.5 3.6 0 0 0 67 42.5" fill="none" stroke={C.eye} strokeWidth={2.8} strokeLinecap="round" />
                  <g className="rbt-es">
                    {[38, 62].map((cx) => (
                      <path key={cx} className="rbt-spiral" d={`M ${cx} 42 a 1 1 0 0 1 2 0 a 2 2 0 0 1 -4 0 a 3 3 0 0 1 6 0 a 4 4 0 0 1 -8 0`} fill="none" stroke={C.eye} strokeWidth={1.7} strokeLinecap="round" />
                    ))}
                  </g>
                </g>

                {/* Les bouches. */}
                <path className="rbt-m rbt-m-idle" d="M 56.58 53.04 A 7 4.5 0 0 1 43.42 53.04" fill="none" stroke={C.eye} strokeWidth={tiny ? 3.4 : 2.6} strokeLinecap="round" />
                <path className="rbt-m rbt-m-happy" d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={C.eye} />
                <ellipse className="rbt-m rbt-m-o" cx={50} cy={55} rx={3} ry={3.4} fill="none" stroke={C.eye} strokeWidth={2.4} />
                <line className="rbt-m rbt-m-flat" x1={46} y1={55} x2={56} y2={54} stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" />
                <path className="rbt-m rbt-m-worry" d="M 44 56.2 Q 50 53.4 56 56.2" fill="none" stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" />
                <line className="rbt-m rbt-m-sleep" x1={46.5} y1={55} x2={53.5} y2={55} stroke={C.eye} strokeWidth={2.4} strokeLinecap="round" />
                <path className="rbt-m rbt-m-wave" d="M 42 55 q 2 -2.4 4 0 t 4 0 t 4 0 t 4 0" fill="none" stroke={C.eye} strokeWidth={2.2} strokeLinecap="round" />

                <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.95} />
                <circle cx={74} cy={69} r={13.5} fill={`url(#${uid}-badge)`} />
                <rect x={72.2} y={61} width={3.6} height={16} rx={1} fill="#fff" />
                <rect x={66} y={67.2} width={16} height={3.6} rx={1} fill="#fff" />
                <path className="rbt-spark" d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A" />

                {/* Réfléchir : trois points ; dormir : un « z » qui monte. */}
                <g className="rbt-dots" fill={C.eye}>
                  <circle cx={86} cy={22} r={2.2} />
                  <circle cx={92.5} cy={18} r={2.2} />
                  <circle cx={99} cy={14} r={2.2} />
                </g>
                <path className="rbt-z" d="M 80 14 h 7 l -7 8 h 7" fill="none" stroke={C.shellEdge} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          </g>
          {/* Hors du corps : les étincelles d'une joie et les confettis d'une fête. */}
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
        </g>
      </svg>
    </span>
  );
}
