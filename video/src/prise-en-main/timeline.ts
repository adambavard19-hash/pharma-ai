/**
 * Le calage des films « Prise en main », UNE seule source pour l'image (src/films/prise-en-main.tsx) et pour le son
 * (scripts/guide-mix.mjs) : chaque phrase commence après la précédente et son silence. Les instants des mots viennent de la voix.
 * Lu par Node sans compilation (imports avec extension).
 */
import { SCRIPTS, type FilmKey, type GuideLine } from "./script.ts";
import { VOICES as TITULAIRE } from "./voix-titulaire.ts";
import { VOICES as PHARMACIEN } from "./voix-pharmacien.ts";
import type { VoiceWord } from "./voix-titulaire.ts";

export const FPS = 30;
export const LEAD = 0.9;
export const TAIL = 3.2;

export type Timed = GuideLine & { start: number; end: number; words: VoiceWord[] };

const VOICES = { titulaire: TITULAIRE, pharmacien: PHARMACIEN } as const;

export function timeline(film: FilmKey): { lines: Timed[]; total: number } {
  let t = LEAD;
  const lines = SCRIPTS[film].map((line) => {
    const voice = VOICES[film][line.id];
    const timed: Timed = { ...line, start: t, end: t + voice.dur, words: voice.words.map((w) => ({ ...w, s: w.s + t, e: w.e + t })) };
    t += voice.dur + line.gapAfter;
    return timed;
  });
  return { lines, total: t + TAIL };
}

export const frames = (film: FilmKey) => Math.ceil(timeline(film).total * FPS);

/** L'instant (s, dans le film) où le mot `needle` est prononcé dans la phrase (début du mot) ; sinon le début de la phrase. */
export function wordAt(line: Timed, needle: string): number {
  const n = needle.toLowerCase();
  const hit = line.words.find((w) => w.w.toLowerCase().replace(/[«»,.:;?!]/g, "").startsWith(n));
  return hit ? hit.s : line.start;
}
