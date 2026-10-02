import { createContext, useContext } from "react";
import { Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

/**
 * L'identité de PharmaBoost, reprise de src/app/globals.css (oklch converti
 * en hex sRGB). Teal pour l'action, ambre réservé à la valeur créée, un seul
 * quasi-noir : celui de l'avis en coin d'écran.
 */
export const C = {
  brand50: "#EAFCF8",
  brand100: "#CDF7EE",
  brand200: "#A0EEDE",
  brand300: "#68DCC7",
  brand400: "#21BEA8",
  brand500: "#00A18D",
  brand600: "#008474",
  brand700: "#00685C",
  brand800: "#005148",
  brand900: "#00403B",
  brand950: "#012421",
  accent50: "#FFF8E9",
  accent100: "#FDEFCC",
  accent200: "#F7DF9E",
  accent300: "#EFCC6A",
  accent400: "#E7B62D",
  accent500: "#DDA100",
  ink50: "#F8FAFC",
  ink100: "#F2F5F7",
  ink200: "#E3E8EC",
  ink300: "#CED5DA",
  ink400: "#98A1A9",
  ink500: "#6B747C",
  ink600: "#4D555D",
  ink700: "#3A4149",
  ink800: "#232930",
  ink900: "#14191F",
  ink950: "#05080E",
  success50: "#EBFCF0",
  success100: "#D4F7E0",
  success600: "#25975B",
  success700: "#1B794A",
  warning50: "#FFF7E5",
  warning300: "#FFCC69",
  warning600: "#DD881B",
  warning700: "#B3621E",
  danger50: "#FFF1F2",
  danger100: "#FFE1E2",
  danger600: "#DB2829",
  danger700: "#B91B1E",
  // L'avis en coin d'écran (agent/src/toast.ts)
  toastBg: "#18211F",
  toastTitle: "#78C8B4",
  toastFoot: "#A0AAA6",
  white: "#FFFFFF",
} as const;

const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });

export const FONT = inter.fontFamily;
export const MONO = mono.fontFamily;
/** Les réglages de caractères déclarés par le site (a à un étage, chiffres ouverts). */
export const FEATURES = '"cv02","cv03","cv04","cv11","ss01"';

/** Ombres slate très diffuses, comme l'interface. */
export const SHADOW = {
  card: "0 24px 60px -28px rgba(15,23,42,.35)",
  lift: "0 40px 90px -30px rgba(15,23,42,.45)",
  toast: "0 25px 50px -12px rgba(0,0,0,.35)",
};

// ---- Le temps -------------------------------------------------------------

/**
 * Le temps des scènes est écrit en « images de scène » : 30 par seconde à
 * 100 BPM (un temps = 18, une mesure = 72). Le film les joue plus vite
 * (SPEED) et les rend à OUT_FPS images par seconde : changer le rythme ou la
 * cadence ne touche à aucune scène.
 */
export const FPS = 30;
export const BEAT = 18;
export const BAR = 72;
export const SPEED = 1.2; // 100 → 120 BPM : 60 s → 50 s
export const OUT_FPS = 60;
/** Images de scène par image de vidéo. */
export const RATE = (SPEED * FPS) / OUT_FPS;
/** Une image de scène → l'image de vidéo correspondante. */
export const toVideo = (sceneFrame: number) => Math.round(sceneFrame / RATE);

/** La courbe du site : cubic-bezier(0.16, 1, 0.3, 1). */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Interpolation bornée, avec la courbe de la marque par défaut. */
export function tw(frame: number, range: [number, number], out: [number, number], easing = EASE) {
  return interpolate(frame, range, out, { ...CLAMP, easing });
}

/** Ressort amorti (sans rebond par défaut), démarrant à `delay`. */
export function sp(frame: number, delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  return spring({ frame: frame - delay, fps: FPS, config: { damping: 200, stiffness: 120, mass: 1, ...config } });
}

/** Apparition puis disparition : 0 → 1 entre `a` et `a+inDur`, 1 → 0 entre `b` et `b+outDur`. */
export function life(frame: number, a: number, b: number, inDur = 14, outDur = 12) {
  return Math.min(tw(frame, [a, a + inDur], [0, 1]), tw(frame, [b, b + outDur], [1, 0], EASE_IN_OUT));
}

/**
 * L'horloge d'une scène : 0 tombe sur sa barre de mesure. Une scène entre un
 * temps avant (images négatives) ; tous les composants lisent cette horloge,
 * jamais l'image brute de la séquence.
 */
export const ClockOffset = createContext({ from: 0, bound: 0, rate: RATE });
export function useF() {
  const c = useContext(ClockOffset);
  return (useCurrentFrame() + c.from) * c.rate - c.bound;
}
/** Image de scène → image de la séquence courante (pour poser un son). */
export function useLocalVideo() {
  const c = useContext(ClockOffset);
  return (sceneFrame: number) => Math.round((sceneFrame + c.bound) / c.rate - c.from);
}
/** Durée d'un temps, en images de scène (30/s), pour un tempo donné. */
export const beats = (bpm: number) => (n: number) => (n * 60 * FPS) / bpm;
