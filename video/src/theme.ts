import { createContext, useContext } from "react";
import { Easing, interpolate, spring, useCurrentFrame } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

/**
 * L'identité de PharmaBoost, reprise de src/app/globals.css (oklch converti
 * en hex sRGB, jetons d'octobre 2026). Teal pour l'action, ambre réservé à la
 * valeur créée. Plus de grand aplat vert foncé : les temps sombres prennent le
 * bleu-vert profond de la bannière du comptoir (agent/src/banner-design.ts).
 */
export const C = {
  brand50: "#F2FAF9",
  brand100: "#E2F3F0",
  brand200: "#BFEAE3",
  brand300: "#90D9CD",
  brand400: "#55BEAE",
  brand500: "#28A191",
  brand600: "#1D8174",
  brand700: "#207267",
  brand800: "#1F6057",
  brand900: "#1B4A44",
  brand950: "#0C2A26",
  /** L'arrivée du dégradé de marque (teal → vert) et des mots mis en valeur. */
  leaf500: "#35A174",
  accent50: "#FFF8E9",
  accent100: "#FDEFCC",
  accent200: "#F7DF9E",
  accent300: "#EFCC6A",
  accent400: "#E7B62D",
  accent500: "#DDA100",
  ink50: "#F8FBFB",
  ink100: "#F0F5F5",
  ink200: "#E2E9E9",
  ink300: "#D2DBDC",
  ink400: "#9BA7AA",
  ink500: "#5B6A72",
  ink600: "#46555C",
  ink700: "#38454B",
  ink800: "#222D33",
  ink900: "#172126",
  ink950: "#091114",
  success50: "#EBFCF0",
  success100: "#D4F7E0",
  success600: "#25975B",
  success700: "#1B794A",
  warning50: "#FFF7E5",
  warning300: "#FFCC69",
  warning600: "#DD881B",
  warning700: "#A1551E",
  danger50: "#FFF1F2",
  danger100: "#FFE3E3",
  danger600: "#DB2829",
  danger700: "#B91B1E",
  /** Le fond des écrans de l'application (#f9fbfb). */
  app: "#F9FBFB",
  /** Le bleu du mot « Bilan. » du site (dégradé brand-600 → #0796b4). */
  sky: "#0796B4",
  white: "#FFFFFF",
} as const;

/** Le dégradé des boutons de l'application (bg-brand-gradient) : teal → vert. */
export const BUTTON_GRADIENT = "linear-gradient(135deg, #1C796D, #22815B)";

const jakarta = loadJakarta("normal", { weights: ["500", "600", "700"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });

/** Plus Jakarta Sans, la police de l'application : titres en 700, interlettrage −0,025em. */
export const FONT = jakarta.fontFamily;
/** Seulement pour les petits surtitres, comme les `font-mono` du site. */
export const MONO = mono.fontFamily;
/**
 * Les réglages de caractères : ceux d'Inter ne s'appliquent pas à Plus Jakarta
 * Sans. Gardé pour FilmShell, à valeur neutre.
 */
export const FEATURES = "normal";

/** Ombres teintées teal, comme les cartes de l'application ; « lift » pour ce qui flotte au-dessus. */
export const SHADOW = {
  card: "0 4px 24px -4px rgba(30,133,120,.14), 0 1px 2px rgba(23,33,38,.05)",
  lift: "0 30px 70px -28px rgba(23,33,38,.32), 0 8px 24px -10px rgba(30,133,120,.18)",
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
/**
 * Images de scène par seconde réelle du film (36 à 120 BPM, 40,8 à 136 BPM) :
 * ce qui suit une durée de l'interface (la bannière s'agrandit en 0,38 s) se
 * cale dessus, pas sur le tempo.
 */
export function usePerSecond() {
  return useContext(ClockOffset).rate * OUT_FPS;
}
/** Image de scène → image de la séquence courante (pour poser un son). */
export function useLocalVideo() {
  const c = useContext(ClockOffset);
  return (sceneFrame: number) => Math.round((sceneFrame + c.bound) / c.rate - c.from);
}
/** Durée d'un temps, en images de scène (30/s), pour un tempo donné. */
export const beats = (bpm: number) => (n: number) => (n * 60 * FPS) / bpm;
