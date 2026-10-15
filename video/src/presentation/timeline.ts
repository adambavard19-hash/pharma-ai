import { SCRIPT, spokenChunk } from "./script";
import { chunkStarts, type VoiceInfo } from "../reel/timeline";

/**
 * LE TEMPS DU FILM « PRÉSENTATION », tiré de la voix — comme le film « Tarif » (src/tarif/timeline.ts), dont il reprend
 * le calage des sous-titres sur les pauses réelles de la voix.
 *
 * Chaque phrase dure ce que dure son fichier, mesuré au rendu ; entre deux phrases, le silence `gapAfter` du script.
 * La carte de fin entre 0,4 s avant la dernière phrase et reste 2,5 s après la voix. Tout est en secondes ici.
 */

/** Une pause de ponctuation dure au moins 120 ms ; en dessous, c'est la fermeture d'une consonne. */
export const MIN_PAUSE = 0.12;
/** L'ouverture muette : l'île au repos, le robot cligne. */
export const LEAD = 0.8;
/** La carte de fin, tenue après la dernière voix. */
export const END_HOLD = 2.5;
/** La carte de fin entre ce temps avant la dernière phrase. */
export const END_INTRO = 0.4;

export type ChunkTime = { text: string; start: number; end: number };
export type LineTime = { id: string; text: string; start: number; end: number; dur: number; next: number; chunks: ChunkTime[]; silentCaptions: boolean };
export type PresentationTimeline = { lines: LineTime[]; endStart: number; total: number };

export function presentationTimeline(voices: VoiceInfo[]): PresentationTimeline {
  let t = LEAD;
  const lines = SCRIPT.map((line, i) => {
    const voice = voices[i];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const starts = chunkStarts(line.chunks.map(spokenChunk), { dur: voice.dur, pauses: voice.pauses.filter(([from, to]) => to - from >= MIN_PAUSE) });
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id: line.id, text: line.text, start, end, dur: voice.dur, next: t, chunks, silentCaptions: line.silentCaptions === true };
  });
  const last = lines[lines.length - 1];
  return { lines, endStart: last.start - END_INTRO, total: last.end + END_HOLD };
}
