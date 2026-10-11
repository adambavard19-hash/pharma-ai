"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  parseSoundPreference,
  SOUND_GLOBAL_KEY,
  SOUND_SCORE,
  SOUND_VOLUME,
  soundIsOn,
  soundStorageKey,
  type RobotSound,
  type SoundContext,
} from "@/core/robot/sound";

/**
 * Jouer les sons du robot (la partition et les règles vivent dans core/robot/sound.ts).
 *
 * Rien n'est chargé tant que personne n'a rien touché : le contexte audio naît au premier son permis, APRÈS un geste
 * (règle des navigateurs). Aucun fichier, donc aucune requête qui puisse échouer ; toute erreur est avalée en silence.
 * Le choix « sons activés / coupés » est gardé dans le navigateur, par lieu (site, mobile, comptoir).
 */

const CHANGE_EVENT = "pharmaboost:robot-sound";
let context: AudioContext | null = null;
let gestured = false;

if (typeof window !== "undefined") {
  const mark = () => {
    gestured = true;
  };
  window.addEventListener("pointerdown", mark, { capture: true, passive: true });
  window.addEventListener("keydown", mark, { capture: true, passive: true });
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function preferenceOf(where: SoundContext): boolean {
  return soundIsOn({ context: where, stored: parseSoundPreference(read(soundStorageKey(where))), globalMute: read(SOUND_GLOBAL_KEY) === "off" });
}

/** Retient le choix et prévient chaque robot de la page. */
export function setRobotSound(where: SoundContext, on: boolean): void {
  try {
    window.localStorage.setItem(soundStorageKey(where), on ? "on" : "off");
  } catch {
    // Stockage indisponible : le choix vaut jusqu'au rechargement, faute de mieux.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Le réglage du lieu, à jour partout sur la page. Côté serveur : le défaut du lieu. */
export function useRobotSound(where: SoundContext): { on: boolean; toggle: () => void } {
  const on = useSyncExternalStore(subscribe, () => preferenceOf(where), () => soundIsOn({ context: where, stored: null, globalMute: false }));
  const toggle = useCallback(() => setRobotSound(where, !preferenceOf(where)), [where]);
  return { on, toggle };
}

/** Joue un son, si le lieu le permet et qu'un geste a déjà eu lieu. Jamais d'erreur visible. */
export function playRobotSound(sound: RobotSound, where: SoundContext): void {
  try {
    if (typeof window === "undefined" || !preferenceOf(where)) return;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!(activation?.hasBeenActive ?? gestured)) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const start = context.currentTime + 0.01;
    const master = context.createGain();
    master.gain.value = SOUND_VOLUME[where];
    master.connect(context.destination);
    for (const note of SOUND_SCORE[sound]) {
      const t0 = start + note.at;
      const t1 = t0 + note.dur;
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.type = note.wave;
      osc.frequency.setValueAtTime(note.from, t0);
      if (note.to !== note.from) osc.frequency.exponentialRampToValueAtTime(note.to, t1);
      if (note.vibrato) {
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.frequency.value = note.vibrato.rate;
        depth.gain.value = note.vibrato.depth;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t1);
      }
      // Attaque et relâche douces : pas de clic.
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, note.gain), t0 + Math.min(0.02, note.dur / 3));
      env.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(env).connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  } catch {
    // Pas de son possible (navigateur, réglages) : le robot reste muet, rien d'autre ne change.
  }
}
