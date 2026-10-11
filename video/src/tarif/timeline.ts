import { SCRIPT, spokenChunk } from "./script";
import { chunkStarts, type VoiceInfo } from "../reel/timeline";

/**
 * LE TEMPS DU FILM « TARIF », tiré de la voix — comme le reel (src/reel/timeline.ts, dont il reprend le calage des
 * sous-titres sur les pauses réelles de la voix).
 *
 * Chaque phrase dure ce que dure son fichier, mesuré au rendu ; entre deux phrases, le silence `gapAfter` du script ;
 * après la dernière, la carte de fin (sans voix). Les sous-titres se partagent le temps de leur phrase au prorata des
 * syllabes PRONONCÉES (« 3 500 € » compte comme « trois mille cinq cents euros »).
 *
 * Tout est en secondes ici ; les scènes reçoivent des « images de scène » (30 par seconde).
 */

/**
 * Une pause de ponctuation dure au moins 120 ms ; en dessous, c'est la fermeture d'une consonne (le « k » de
 * « quarante », le « p » de « par ») : elle ne sert pas d'ancre aux sous-titres.
 */
export const MIN_PAUSE = 0.12;
/** Avant la première phrase : le temps que la première image se pose. */
export const LEAD = 0.45;
/** La carte de fin : la phrase, le robot et le nom, la promesse, « Réserver une démo », pharmaboost.app, tenus. */
export const END_CARD = 6;

export type ChunkTime = { text: string; start: number; end: number };
export type LineTime = { id: string; text: string; start: number; end: number; dur: number; next: number; chunks: ChunkTime[] };
export type TarifTimeline = { lines: LineTime[]; endStart: number; total: number };

export function tarifTimeline(voices: VoiceInfo[]): TarifTimeline {
  let t = LEAD;
  const lines = SCRIPT.map((line, i) => {
    const voice = voices[i];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const starts = chunkStarts(line.chunks.map(spokenChunk), { dur: voice.dur, pauses: voice.pauses.filter(([from, to]) => to - from >= MIN_PAUSE) });
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id: line.id, text: line.text, start, end, dur: voice.dur, next: t, chunks };
  });
  return { lines, endStart: t, total: t + END_CARD };
}
