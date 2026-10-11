import type { RobotBurst, RobotMood } from "./mascot";

/**
 * Les sons du robot : NOS sons, synthétisés à la volée par le navigateur (Web Audio) à partir des notes ci-dessous —
 * aucun fichier à télécharger, donc rien qui puisse manquer, et aucun son emprunté. Module pur : les règles (quand
 * jouer, à quel volume, par défaut allumé ou non) se testent sans navigateur ; `components/robot/sound.ts` les joue.
 *
 * Règles :
 *  - une famille cohérente : sinusoïdes et triangles doux, courts (moins de 400 ms), jamais stridents ;
 *  - site et application mobile : allumés par défaut, mais seulement après un geste de la personne (règle des
 *    navigateurs), et un bouton les coupe — le choix est retenu ;
 *  - comptoir : ÉTEINTS par défaut (un patient est en face), à activer soi-même, très bas, et JAMAIS de son pour une
 *    mise en garde ;
 *  - un « tout couper » global l'emporte sur tout.
 */

export const ROBOT_SOUNDS = ["greet", "giggle", "dizzy", "curious", "thinking", "happy", "celebrate", "concerned"] as const;
export type RobotSound = (typeof ROBOT_SOUNDS)[number];

/** Là où le robot vit : chaque lieu a son réglage par défaut et son volume. */
export type SoundContext = "site" | "mobile" | "counter";

export const SOUND_DEFAULT_ON: Record<SoundContext, boolean> = { site: true, mobile: true, counter: false };
/** Volume maître (0 à 1) : bas partout, plus bas encore au comptoir. */
export const SOUND_VOLUME: Record<SoundContext, number> = { site: 0.25, mobile: 0.25, counter: 0.1 };

export const SOUND_STORAGE_PREFIX = "pharmaboost:robot-sound:";
/** La clé du « tout couper », valable dans tous les lieux. */
export const SOUND_GLOBAL_KEY = `${SOUND_STORAGE_PREFIX}tout`;

export function soundStorageKey(context: SoundContext): string {
  return `${SOUND_STORAGE_PREFIX}${context}`;
}

/** Ce que le stockage du navigateur contient : « on », « off », ou rien (le défaut du lieu s'applique). */
export function parseSoundPreference(value: string | null | undefined): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

/** Le son est-il permis ici ? Le « tout couper » d'abord, puis le choix de la personne, puis le défaut du lieu. */
export function soundIsOn(input: { context: SoundContext; stored: boolean | null; globalMute: boolean }): boolean {
  if (input.globalMute) return false;
  return input.stored ?? SOUND_DEFAULT_ON[input.context];
}

/** Le son d'un geste ou d'une humeur qui arrive — null : rien à jouer. Au comptoir, jamais pour une mise en garde. */
export function soundFor(context: SoundContext, event: { burst?: RobotBurst | null; mood?: RobotMood | null }): RobotSound | null {
  const byBurst: Record<RobotBurst, RobotSound> = { jump: "happy", party: "celebrate", wave: "greet", giggle: "giggle", dizzy: "dizzy" };
  if (event.burst) return byBurst[event.burst];
  if (event.mood === "curious") return "curious";
  if (event.mood === "thinking") return "thinking";
  if (event.mood === "concerned") return context === "counter" ? null : "concerned";
  return null;
}

/** Une note : départ et durée en secondes, fréquence de début et de fin, timbre, niveau relatif (0 à 1), vibrato. */
export type SoundNote = { at: number; dur: number; from: number; to: number; wave: "sine" | "triangle"; gain: number; vibrato?: { rate: number; depth: number } };

/** La partition de chaque son. Tout tient sous 400 ms. */
export const SOUND_SCORE: Record<RobotSound, SoundNote[]> = {
  // Un « coucou » : deux notes qui montent.
  greet: [
    { at: 0, dur: 0.09, from: 660, to: 880, wave: "sine", gain: 0.8 },
    { at: 0.11, dur: 0.13, from: 880, to: 1175, wave: "sine", gain: 0.7 },
  ],
  // Le gloussement : trois petites bulles.
  giggle: [
    { at: 0, dur: 0.05, from: 900, to: 1000, wave: "triangle", gain: 0.6 },
    { at: 0.07, dur: 0.05, from: 1050, to: 1150, wave: "triangle", gain: 0.6 },
    { at: 0.14, dur: 0.06, from: 950, to: 1080, wave: "triangle", gain: 0.55 },
  ],
  // Le tournis : une note qui vacille et redescend.
  dizzy: [{ at: 0, dur: 0.36, from: 560, to: 360, wave: "sine", gain: 0.6, vibrato: { rate: 14, depth: 40 } }],
  // Un bip arrive : un « blip » curieux.
  curious: [{ at: 0, dur: 0.11, from: 700, to: 1100, wave: "sine", gain: 0.55 }],
  // Réfléchir : un bourdonnement très doux.
  thinking: [{ at: 0, dur: 0.32, from: 300, to: 320, wave: "triangle", gain: 0.35, vibrato: { rate: 6, depth: 6 } }],
  // La joie : un « pop ».
  happy: [{ at: 0, dur: 0.15, from: 520, to: 1040, wave: "sine", gain: 0.75 }],
  // La fête : une petite étincelle en arpège.
  celebrate: [
    { at: 0, dur: 0.07, from: 1047, to: 1047, wave: "sine", gain: 0.6 },
    { at: 0.07, dur: 0.07, from: 1319, to: 1319, wave: "sine", gain: 0.6 },
    { at: 0.14, dur: 0.07, from: 1568, to: 1568, wave: "sine", gain: 0.6 },
    { at: 0.21, dur: 0.14, from: 2093, to: 2093, wave: "sine", gain: 0.45 },
  ],
  // Le sérieux : une note basse qui descend un peu — douce, jamais une alarme.
  concerned: [{ at: 0, dur: 0.28, from: 330, to: 294, wave: "sine", gain: 0.45 }],
};

/** La durée d'un son, en secondes. */
export function soundDuration(sound: RobotSound): number {
  return Math.max(...SOUND_SCORE[sound].map((note) => note.at + note.dur));
}
