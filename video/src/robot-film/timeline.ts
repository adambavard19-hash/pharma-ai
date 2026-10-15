import { SCRIPT, spokenChunk } from "./script";
import { chunkStarts, type VoiceInfo } from "../reel/timeline";

/**
 * LE TEMPS DU FILM « ROBOT », tiré de la voix — comme « Tarif » (src/tarif/timeline.ts), dont il reprend le calage
 * des sous-titres sur les pauses réelles de la voix.
 *
 * Chaque phrase dure ce que dure son fichier, mesuré au rendu ; entre deux phrases, le silence `gapAfter` du script
 * (les temps muets où l'île joue seule) ; après la dernière, la carte de fin tient `gapAfter` de R11.
 * Tout est en secondes.
 */

/** Une pause de ponctuation dure au moins 120 ms ; en dessous, c'est la fermeture d'une consonne. */
export const MIN_PAUSE = 0.12;
/** Avant la première phrase : la capsule au repos, puis le curseur qui la survole. */
export const LEAD = 1.0;
/** La carte de fin entre ce temps avant R11. */
export const END_INTRO = 0.4;

export type ChunkTime = { text: string; start: number; end: number };
export type LineTime = { id: string; text: string; start: number; end: number; dur: number; next: number; chunks: ChunkTime[] };
export type RobotTimeline = { lines: LineTime[]; endStart: number; total: number };

export function robotTimeline(voices: VoiceInfo[]): RobotTimeline {
  let t = LEAD;
  const lines = SCRIPT.map((line, i) => {
    const voice = voices[i];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const starts = line.chunks.length ? chunkStarts(line.chunks.map(spokenChunk), { dur: voice.dur, pauses: voice.pauses.filter(([from, to]) => to - from >= MIN_PAUSE) }) : [];
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id: line.id, text: line.text, start, end, dur: voice.dur, next: t, chunks };
  });
  const last = lines[lines.length - 1];
  return { lines, endStart: last.start - END_INTRO, total: t };
}
